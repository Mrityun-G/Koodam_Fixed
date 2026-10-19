import { useEffect, useRef, useState } from 'react';

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
 */
export const useSpeechInput = ({ language = 'en', onFinal, onError }) => {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');

  const recognitionRef = useRef(null);

  // Keep the latest callbacks without restarting recognition
  const finalRef = useRef(onFinal);
  const errorRef = useRef(onError);

  finalRef.current = onFinal;
  errorRef.current = onError;

  // Stop the microphone if the screen closes mid-sentence
  useEffect(
    () => () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    },
    []
  );

  const stop = () => {
    recognitionRef.current?.stop?.();
    setListening(false);
    setInterim('');
  };

  const start = () => {
    if (listening) {
      stop();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      errorRef.current?.(
        'Voice typing needs Chrome or Edge on this device. You can still type.'
      );
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

  return { listening, interim, start, stop, supported: speechSupported() };
};
