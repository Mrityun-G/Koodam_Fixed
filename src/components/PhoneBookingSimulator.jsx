import React, { useEffect, useRef, useState } from 'react';
import { authorizedFetch } from '../lib/authorizedFetch';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// Chrome and Edge have speech recognition built in; Firefox doesn't
const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * Lets KOODAM staff walk through the phone booking menu (offline mode),
 * by pressing keys or speaking,
 * as a caller would, before a real phone number is connected. Bookings
 * made here are real: they go to real partners.
 */
export const PhoneBookingSimulator = () => {
  const [phone, setPhone] = useState('');
  const [callId, setCallId] = useState(null);
  const [lines, setLines] = useState([]);
  const [expecting, setExpecting] = useState(0);
  const [keys, setKeys] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Language the menu is listening in, e.g. "ta-IN"
  const [listenLang, setListenLang] = useState('en-IN');
  const [listening, setListening] = useState(false);
  // Read KOODAM's replies out loud, like a real call
  const [speakReplies, setSpeakReplies] = useState(true);
  const transcriptRef = useRef(null);

  // Keep the newest line in view, like a call log
  useEffect(() => {
    const box = transcriptRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  const speak = (parts) => {
    if (!speakReplies || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    parts.forEach((part) => {
      const utterance = new SpeechSynthesisUtterance(part.text);
      utterance.lang = { ta: 'ta-IN', kn: 'kn-IN' }[part.lang] || 'en-IN';
      window.speechSynthesis.speak(utterance);
    });
  };

  const send = async (id, digits, speech = null) => {
    setBusy(true);
    setError('');

    try {
      const reply = await authorizedFetch('/ivr/simulate', {
        method: 'POST',
        body: JSON.stringify({ call_id: id, phone, digits, speech })
      });

      setLines((current) => [
        ...current,
        ...(speech
          ? [{ from: 'caller', text: `🎤 "${speech}"` }]
          : digits != null
          ? [{ from: 'caller', text: digits || '(no key pressed)' }]
          : []),
        ...reply.parts.map((part) => ({ from: 'koodam', text: part.text })),
        ...(reply.note ? [{ from: 'note', text: `Why: ${reply.note}` }] : [])
      ]);
      setExpecting(reply.hangup ? 0 : reply.digits);
      setListenLang(reply.listen || 'en-IN');
      speak(reply.parts);

      if (reply.hangup) {
        setCallId(null);
      }
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setKeys('');
      setBusy(false);
    }
  };

  const startCall = () => {
    const id = `${Date.now()}`;
    setCallId(id);
    setLines([]);
    send(id, null);
  };

  // Say the answer instead of pressing it ("three", "English", "Plumbing")
  const listen = () => {
    if (!SpeechRecognition) {
      setError('Voice needs Chrome or Edge.');
      return;
    }

    window.speechSynthesis?.cancel();

    const recognition = new SpeechRecognition();
    recognition.lang = listenLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript?.trim();
      if (heard) send(callId, null, heard);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Couldn't hear you (${event.error}). Allow the microphone and try again.`);
      }
    };
    recognition.onend = () => setListening(false);

    setError('');
    setListening(true);
    recognition.start();
  };

  const pressKey = (key) => {
    const next = keys + key;

    // Send as soon as the menu has the number of keys it asked for
    if (key === '#' || next.length >= expecting) {
      send(callId, next);
    } else {
      setKeys(next);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2 text-[11px]">
      <p className="text-slate-500">
        Try the phone menu as a caller would. Bookings made here are real and go to real partners.
      </p>

      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/[^\d+\s]/g, '').slice(0, 16))}
          placeholder="Caller's mobile number"
          inputMode="tel"
          disabled={Boolean(callId)}
          className="flex-1 min-w-0 border border-slate-200 rounded-lg p-2 disabled:opacity-60"
        />
        {callId ? (
          <button
            type="button"
            onClick={() => { setCallId(null); setExpecting(0); window.speechSynthesis?.cancel(); }}
            className="shrink-0 font-bold text-white bg-red-500 rounded-lg px-3"
          >
            Hang up
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || phone.replace(/\D/g, '').length < 10}
            onClick={startCall}
            className="shrink-0 font-bold text-white bg-[#006c49] rounded-lg px-3 disabled:opacity-60"
          >
            Call
          </button>
        )}
      </div>

      {lines.length > 0 && (
        <div ref={transcriptRef} className="max-h-64 overflow-y-auto space-y-1.5 bg-[#f8f9ff] rounded-xl p-2">
          {lines.map((line, index) => (
            <p
              key={index}
              data-no-translate
              className={
                line.from === 'caller'
                  ? 'text-right font-mono font-bold text-[#a14000]'
                  : line.from === 'note'
                  ? 'rounded-lg bg-amber-50 p-1.5 text-amber-700'
                  : 'text-[#0b1c30]'
              }
            >
              {line.text}
            </p>
          ))}
        </div>
      )}

      {error && <p className="text-red-500">{error}</p>}

      {callId && (
        <label className="flex items-center gap-1.5 text-slate-500">
          <input
            type="checkbox"
            checked={speakReplies}
            onChange={(event) => {
              setSpeakReplies(event.target.checked);
              if (!event.target.checked) window.speechSynthesis?.cancel();
            }}
          />
          Read replies aloud
        </label>
      )}

      {callId && expecting > 0 && (
        <>
          <p className="text-slate-400 text-center">
            {`Press ${expecting === 1 ? 'a key' : `${expecting} keys`} or say it${keys ? ` • ${keys}` : ''}`}
          </p>
          <button
            type="button"
            disabled={busy || listening}
            onClick={listen}
            className={`w-full py-2 rounded-lg font-bold text-white flex items-center justify-center gap-1 disabled:opacity-70 ${
              listening ? 'bg-red-500 animate-pulse' : 'bg-[#ff6a00]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">mic</span>
            {listening ? `Listening (${listenLang})...` : 'Say your answer'}
          </button>
          <div className="grid grid-cols-3 gap-1.5">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => pressKey(key)}
                className="py-2 rounded-lg bg-[#eff4ff] text-sm font-bold text-[#0b1c30] disabled:opacity-60"
              >
                {key}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => send(callId, '')}
            className="w-full py-1.5 text-slate-500 border border-slate-200 rounded-lg disabled:opacity-60"
          >
            Stay silent
          </button>
        </>
      )}
    </div>
  );
};
