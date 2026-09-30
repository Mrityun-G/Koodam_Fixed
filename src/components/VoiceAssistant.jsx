import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

export const VoiceAssistant = () => {
  const { handleVoiceBooking, showToast } = useApp();
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      showToast('Voice commands need Chrome or Edge on this device.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map(result => result[0].transcript).join('');
      setTranscript(text);
      if (event.results[0].isFinal) handleVoiceBooking(text);
    };
    recognition.onerror = () => {
      setIsListening(false);
      showToast('I could not hear that. Please try again.');
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

      {isListening && transcript && (
        <p className="absolute right-0 top-full mt-1.5 w-56 truncate rounded-xl bg-[#0b1c30] px-3 py-2 text-[11px] text-white shadow-lg z-10">
          {supported ? transcript : 'Voice is not supported in this browser.'}
        </p>
      )}
    </div>
  );
};
