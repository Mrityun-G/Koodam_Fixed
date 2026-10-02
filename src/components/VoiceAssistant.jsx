import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

// Browser speech recognition language for each app language
const SPEECH_LANGUAGES = {
  en: 'en-IN',
  ta: 'ta-IN',
  kn: 'kn-IN'
};

/**
 * Mic button. Listens once and hands the final transcript to onResult;
 * what to do with it (e.g. open the best matching helper) is up to the
 * screen. Uses the browser's built-in speech recognition, so it costs
 * nothing per request.
 */
export const VoiceAssistant = ({ onResult }) => {
  const { showToast, language } = useApp();
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Voice commands need Chrome or Edge on this device.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = SPEECH_LANGUAGES[language] || 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      setTranscript('');
      setIsListening(true);
    };
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map(result => result[0].transcript).join('');
      setTranscript(text);
      if (event.results[event.results.length - 1].isFinal) onResult?.(text);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      showToast(
        event.error === 'not-allowed'
          ? 'Allow microphone access to use voice search.'
          : 'I could not hear that. Please try again.'
      );
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={startListening}
        disabled={isListening}
        aria-label={isListening ? 'Listening' : 'Search by voice'}
        title="Search by voice"
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          isListening ? 'bg-[#ff6a00] text-white' : 'bg-[#eff4ff] text-[#0b1c30] hover:bg-[#d3e4fe]'
        } disabled:cursor-wait`}
      >
        <span className="material-symbols-outlined text-[19px]">{isListening ? 'graphic_eq' : 'mic'}</span>
      </button>

      {isListening && (
        <p className="absolute right-0 top-full mt-1.5 w-56 truncate rounded-xl bg-[#0b1c30] px-3 py-2 text-[11px] text-white shadow-lg z-10">
          {transcript || 'Listening… say what you need'}
        </p>
      )}
    </div>
  );
};
