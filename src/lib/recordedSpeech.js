import { authorizedFetch, BACKEND_URL } from './authorizedFetch';
import { boostWords } from './voiceIntent';

// Dictation for devices whose browser cannot listen.
//
// Android WebView has no SpeechRecognition, so inside the packaged app
// the mic button was dead and VoiceAssistant told people to "use Chrome
// or Edge" — inside their own app. Here the clip is recorded with
// MediaRecorder, sent to the backend, and transcribed by Gnani.
//
// There are no interim words: the transcript arrives once, after they
// stop. Measured 2026-10-21, a 7-second clip came back in 0.15-0.34s, so
// the wait is short, but the caller should still show that it is working.

// Long enough to describe a fault, short enough to stay inside the
// API's 30-second comfortable limit.
export const MAX_RECORDING_MS = 25000;

// Below this there is no speech worth sending, only a mis-tap
const MIN_BYTES = 1200;

export const recordingSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  Boolean(navigator?.mediaDevices?.getUserMedia);

// Whichever container this browser actually produces. Chrome and the
// Android WebView give webm/opus; Safari gives mp4. Gnani accepts both.
const pickMimeType = () => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];

  return candidates.find(
    (type) => window.MediaRecorder?.isTypeSupported?.(type)
  ) || '';
};

// Whether the server can transcribe at all. Asked once and remembered,
// so the app never offers a mic it cannot honour.
let availability = null;

export const serverSpeechAvailable = async () => {
  if (availability !== null) {
    return availability;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/speech/available`);
    availability = response.ok && Boolean((await response.json())?.available);
  } catch {
    availability = false;
  }

  return availability;
};

/**
 * Record until `stop()` is called, then resolve with the transcript.
 *
 * Returns { stop, cancel, done } — `done` resolves with the text, or
 * rejects with a message worth showing. `cancel` throws the clip away
 * without spending a request.
 */
export const recordAndTranscribe = async ({ language = 'en' } = {}) => {
  if (!recordingSupported()) {
    throw new Error('This device cannot record audio. Please type instead.');
  }

  let stream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw new Error(
      error?.name === 'NotAllowedError'
        ? 'Allow microphone access to use voice typing.'
        : 'No microphone was found. Please type instead.'
    );
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];

  let cancelled = false;
  let settle;
  let fail;

  const done = new Promise((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  // Always release the microphone, or the recording indicator stays on
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    clearTimeout(limit);
  };

  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };

  recorder.onerror = () => {
    release();
    fail(new Error("That recording didn't work. Please try again."));
  };

  recorder.onstop = async () => {
    release();

    if (cancelled) {
      settle('');
      return;
    }

    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });

    if (blob.size < MIN_BYTES) {
      fail(new Error('Nothing was recorded. Please hold the button and speak.'));
      return;
    }

    const form = new FormData();
    const extension = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';

    form.append('audio', blob, `speech.${extension}`);
    form.append('language', language);
    // Weight the words the matcher looks for, so "geyser" and "MCB"
    // come back as themselves rather than as something near them
    form.append('bias', boostWords().join(','));

    try {
      const { transcript } = await authorizedFetch('/speech/transcribe', {
        method: 'POST',
        body: form
      });

      settle((transcript || '').trim());
    } catch (error) {
      fail(new Error(error.message || 'Could not transcribe that. Please type instead.'));
    }
  };

  // Stop on our own terms rather than uploading a clip the API will refuse
  const limit = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, MAX_RECORDING_MS);

  recorder.start();

  return {
    done,
    stop: () => {
      if (recorder.state === 'recording') recorder.stop();
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state === 'recording') recorder.stop();
      else release();
    }
  };
};
