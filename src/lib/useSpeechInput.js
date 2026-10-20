import { useEffect, useRef, useState } from 'react';
import {
  recordAndTranscribe,
  recordingSupported,
  serverSpeechAvailable
} from './recordedSpeech';

// Browser speech recognition language for each app language
export const SPEECH_LANGUAGES = {
  en: 'en-IN',
  ta: 'ta-IN',
  kn: 'kn-IN'
};

export const speechSupported = () =>
  typeof window !== 'undefined' &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * Dictation into a text field, in the member's own language.
 *
 * Built for members who find typing hard - an older person describing a
 * fault is far more likely to say it than type it. Speech is recognised
 * by the browser, so it costs nothing per use and works offline on most
 * Android phones.
 *
 * `onFinal` is handed each finished phrase so the caller can append it;
 * `interim` is the words still being spoken, to show while they talk.
 *
 * Where the browser cannot listen — Android WebView has no
 * SpeechRecognition, which is every install of the packaged app — it
 * records a clip instead and has the backend transcribe it. Same
 * interface either way, so callers don't branch; `mode` says which is in
 * use, since the recorded path has no interim words and the caller may
 * want to say "listening…" rather than show nothing.
 */
export const useSpeechInput = ({ language = 'en', onFinal, onError }) => {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [transcribing, setTranscribing] = useState(false);

  // 'live' while the browser can hear directly, 'recorded' once we know
  // the server fallback is there, '' while neither is available
  const [mode, setMode] = useState(speechSupported() ? 'live' : '');

  const recognitionRef = useRef(null);
  const recordingRef = useRef(null);

  // Keep the latest callbacks without restarting recognition
  const finalRef = useRef(onFinal);
  const errorRef = useRef(onError);

  finalRef.current = onFinal;
  errorRef.current = onError;

  // Ask once whether the server can transcribe, so a device without
  // browser speech still gets a mic if the fallback is configured
  useEffect(() => {
    if (speechSupported() || !recordingSupported()) {
      return;
    }

    let cancelled = false;

    serverSpeechAvailable().then((available) => {
      if (!cancelled && available) setMode('recorded');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Stop the microphone if the screen closes mid-sentence
  useEffect(
    () => () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      recordingRef.current?.cancel?.();
      recordingRef.current = null;
    },
    []
  );

  const stop = () => {
    if (recordingRef.current) {
      // Keep `listening` true until the transcript lands, so the button
      // doesn't go idle while the clip is still being sent
      recordingRef.current.stop();
      return;
    }

    recognitionRef.current?.stop?.();
    setListening(false);
    setInterim('');
  };

  // Record a clip and let the backend transcribe it. Used where the
  // browser has no speech recognition of its own.
  const startRecording = async () => {
    if (mode !== 'recorded') {
      errorRef.current?.(
        'Voice typing is not available on this device. You can still type.'
      );
      return;
    }

    try {
      const recording = await recordAndTranscribe({ language });

      recordingRef.current = recording;
      setListening(true);
      setInterim('');

      const transcript = await (async () => {
        try {
          setTranscribing(false);
          return await recording.done;
        } finally {
          setTranscribing(false);
        }
      })();

      recordingRef.current = null;
      setListening(false);

      if (transcript) {
        finalRef.current?.(transcript);
      }
    } catch (error) {
      recordingRef.current = null;
      setListening(false);
      setInterim('');
      errorRef.current?.(error.message || 'Voice typing failed. Please type instead.');
    }
  };

  const start = () => {
    if (listening) {
      stop();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      startRecording();
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = SPEECH_LANGUAGES[language] || 'en-IN';
    // Keep listening between sentences: people pause while thinking
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setInterim('');
      setListening(true);
    };

    recognition.onresult = (event) => {
      let stillSpeaking = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';

        if (result.isFinal) {
          const phrase = text.trim();
          if (phrase) finalRef.current?.(phrase);
        } else {
          stillSpeaking += text;
        }
      }

      setInterim(stillSpeaking);
    };

    recognition.onerror = (event) => {
      // A pause isn't a failure; neither is us stopping it
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }

      setListening(false);
      setInterim('');

      errorRef.current?.(
        event.error === 'not-allowed'
          ? 'Allow microphone access to use voice typing.'
          : "I couldn't hear that. Please try again, or type it instead."
      );
    };

    recognition.onend = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      // start() throws if it is already running
      console.error('Could not start voice typing:', error);
      setListening(false);
    }
  };

  return {
    listening,
    interim,
    transcribing,
    mode,
    start,
    stop,
    // True when a mic is worth showing at all, by either route
    supported: mode !== ''
  };
};
