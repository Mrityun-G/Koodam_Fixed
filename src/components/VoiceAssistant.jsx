import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useSpeechInput } from '../lib/useSpeechInput';

/**
 * Mic button. Listens once and hands the final transcript to onResult;
 * what to do with it (e.g. open the best matching helper) is up to the
 * screen.
 *
 * Listening goes through useSpeechInput, which uses the browser's own
 * recognition where there is any — free, with words appearing as they
 * are spoken — and records a clip for the backend to transcribe where
 * there is none. That second path is what the Android app uses: WebView
 * has no SpeechRecognition, so this button used to do nothing there but
 * tell people to "use Chrome or Edge" inside their own app.
 */
export const VoiceAssistant = ({ onResult }) => {
  const { showToast, language } = useApp();

  const [transcript, setTranscript] = useState('');

  const { listening, interim, transcribing, mode, start, supported } =
    useSpeechInput({
      language,
      onFinal: (phrase) => {
        setTranscript(phrase);
        onResult?.(phrase);
      },
      onError: (message) => {
        setTranscript('');
        showToast(message);
      }
    });

  // No microphone by either route: don't show a button that can't work
  if (!supported) {
    return null;
  }

  const handleClick = () => {
    setTranscript('');
    start();
  };

  const label = transcribing
    ? 'Getting your words…'
    : interim || transcript ||
      (mode === 'recorded'
        ? 'Listening… tap again when you finish'
        : 'Listening… say what you need');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={transcribing}
        aria-label={listening ? 'Listening' : 'Search by voice'}
        title="Search by voice"
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          listening || transcribing
            ? 'bg-[#ff6a00] text-white'
            : 'bg-[#eff4ff] text-[#0b1c30] hover:bg-[#d3e4fe]'
        } disabled:cursor-wait`}
      >
        <span
          className={`material-symbols-outlined text-[19px] ${
            transcribing ? 'animate-pulse' : ''
          }`}
        >
          {listening || transcribing ? 'graphic_eq' : 'mic'}
        </span>
      </button>

      {(listening || transcribing) && (
        <p className="absolute right-0 top-full mt-1.5 w-56 truncate rounded-xl bg-[#0b1c30] px-3 py-2 text-[11px] text-white shadow-lg z-10">
          {label}
        </p>
      )}
    </div>
  );
};
