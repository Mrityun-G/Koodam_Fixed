import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  confidenceNote,
  diagnosisPhotoUrl,
  fetchServices,
  likelihoodLabel,
  requestDiagnosis,
  urgencyInfo
} from '../lib/diagnosis';
import { useSpeechInput } from '../lib/useSpeechInput';

// The backend reads at most this much of what the member said
const MAX_NOTE = 500;

// GigEzee AI as a simple chat. The member tells the bot what is wrong
// (typed or spoken), the bot asks for a photo, and its answer comes back
// in the chat with the helper to book.
//
// The talking part stays on the phone: everything they said goes to
// the AI together with the photo, as one request.
const BotAvatar = () => (
  <div className="w-8 h-8 rounded-full bg-[#FFC928] text-[#101F55] flex items-center justify-center shrink-0 shadow-sm">
    <span className="material-symbols-outlined text-[17px]">auto_awesome</span>
  </div>
);

const BotSays = ({ children, wide = false }) => (
  <div className="flex items-start gap-2">
    <BotAvatar />
    <div className={`${wide ? 'flex-1' : 'max-w-[80%]'} min-w-0 flex flex-col gap-2`}>
      {children}
    </div>
  </div>
);

const BotBubble = ({ children }) => (
  <div className="self-start bg-white border border-slate-100 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[13px] leading-relaxed text-[#101F55] shadow-xs">
    {children}
  </div>
);

const MeSays = ({ children }) => (
  <div className="flex justify-end">
    <div className="max-w-[80%] bg-[#FFC928] text-[#101F55] rounded-2xl rounded-tr-md px-3.5 py-2.5 text-[13px] leading-relaxed break-words">
      {children}
    </div>
  </div>
);

const TypingDots = () => (
  <span className="inline-flex items-center gap-1" aria-hidden="true">
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="w-1.5 h-1.5 rounded-full bg-[#F5B301]/70 animate-bounce"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
);

export const DiagnoseScreen = () => {
  const {
    navigateTo,
    showToast,
    setSelectedService,
    setDiagnosis,
    language
  } = useApp();

  // What they have told the bot so far, one entry per message
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');

  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState('');

  // The bookable services, so the answer's service title can be turned
  // into the service the home screen filters by
  const [services, setServices] = useState([]);

  useEffect(() => {
    let cancelled = false;

    fetchServices().then((list) => {
      if (!cancelled) setServices(list);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const answerRef = useRef(null);
  const endRef = useRef(null);

  const noteText = notes.join(' ');
  const room = MAX_NOTE - noteText.length - (noteText ? 1 : 0);

  // Speaking is easier than typing for most members this is built for.
  // Each finished phrase goes into the message box, so they can check
  // it and send it like a typed one.
  const { listening, interim, transcribing, mode, start, stop, supported } =
    useSpeechInput({
      language,
      onFinal: (phrase) =>
        setDraft((current) =>
          (current ? `${current.trim()} ${phrase}` : phrase).slice(0, MAX_NOTE)
        ),
      onError: showToast
    });

  // Drop the preview's object URL when it is replaced or the screen closes
  useEffect(() => {
    if (!preview) return undefined;

    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // Keep the newest message in view. A long answer is shown from its
  // top, so it reads from the start rather than from the buttons.
  useEffect(() => {
    if (result) {
      answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [notes.length, preview, thinking, result, failed]);

  const sendNote = () => {
    const text = draft.trim().slice(0, Math.max(room, 0));
    if (!text) return;

    setNotes((current) => [...current, text]);
    setDraft('');
  };

  const analyse = async (file, note) => {
    setThinking(true);
    setFailed('');
    setResult(null);

    try {
      setResult(await requestDiagnosis(file, note, language));
    } catch (error) {
      console.error('GigEzee AI failed:', error);
      setFailed(error.message || "GigEzee AI couldn't answer. Please try again.");
    } finally {
      setThinking(false);
    }
  };

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    // Let the same photo be picked again after clearing it
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose a photo.');
      return;
    }

    stop();

    // Anything typed but not sent yet still counts
    const pending = draft.trim().slice(0, Math.max(room, 0));
    const said = pending ? [...notes, pending] : notes;

    if (pending) {
      setNotes(said);
      setDraft('');
    }

    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    analyse(file, said.join(' ').slice(0, MAX_NOTE));
  };

  // Back to asking for a photo, keeping what they said
  const anotherPhoto = () => {
    setPhoto(null);
    setPreview('');
    setResult(null);
    setFailed('');
  };

  const newChat = () => {
    stop();
    anotherPhoto();
    setNotes([]);
    setDraft('');
  };

  // Book the service the AI pointed at, carrying the photo and the
  // causes through so the helper sees them
  const bookSuggestedService = () => {
    const match = services.find(
      (service) => service.title === result?.service_title
    );

    if (!match) {
      showToast('Please pick a service from the home screen.');
      navigateTo('home');
      return;
    }

    setSelectedService(match);
    setDiagnosis(result);
    navigateTo('home');
    showToast(`Showing helpers for ${match.title}.`);
  };

  const urgency = result ? urgencyInfo(result.urgency) : null;
  const chatStarted = notes.length > 0 || Boolean(photo);

  // The right-hand button: stop while listening, send when there is
  // something to send, otherwise the mic
  const canSend = draft.trim().length > 0 && room > 0;
  const showMic = supported && !canSend;

  const listeningLabel = transcribing
    ? 'Getting your words…'
    : interim ||
      (mode === 'recorded'
        ? 'Listening… tap stop when you finish'
        : 'Listening… go ahead');

  return (
    <div className="flex flex-col h-full bg-[#FFF3D5]">
      <header className="shrink-0 bg-white px-4 py-3 flex items-center gap-3 border-b border-slate-100">
        <button
          onClick={() => navigateTo('home')}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-[#FFF3D5] text-[#101F55] flex items-center justify-center active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">
            arrow_back
          </span>
        </button>

        <BotAvatar />

        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-[#101F55] leading-tight">
            GigEzee AI
          </h1>
          <p className="text-[11px] text-[#4E5C92]">
            Tell me the problem, then show me
          </p>
        </div>

        {chatStarted && !thinking && (
          <button
            onClick={newChat}
            aria-label="Start a new chat"
            title="Start a new chat"
            className="w-9 h-9 rounded-full bg-[#FFF3D5] text-[#101F55] flex items-center justify-center active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">
              restart_alt
            </span>
          </button>
        )}
      </header>

      <div
        role="log"
        aria-live="polite"
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
      >
        {/* ---------- The bot opens ---------- */}
        <BotSays>
          <BotBubble>
            Hi! I'm GigEzee AI. What's the problem at home? Tell me in your
            own words, no need to know what it's called.
          </BotBubble>
          <BotBubble>
            Type it below, or tap the{' '}
            <span className="material-symbols-outlined text-[15px] align-[-3px] text-[#F47B16]">
              mic
            </span>{' '}
            and just say it.
          </BotBubble>
        </BotSays>

        {/* ---------- What they told it ---------- */}
        {notes.map((text, index) => (
          <MeSays key={index}>{text}</MeSays>
        ))}

        {/* ---------- Then it asks to see it ---------- */}
        {notes.length > 0 && !photo && (
          <BotSays>
            <BotBubble>
              Thanks, got it. Now please show me. Take a photo of it,
              standing close enough that the whole thing fits in the
              picture.
            </BotBubble>

            <div className="flex flex-col gap-1.5 w-56 max-w-full">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full py-3 rounded-xl bg-[#FFC928] hover:bg-[#F5B301] text-[#101F55] text-sm font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">
                  photo_camera
                </span>
                Open camera
              </button>

              <button
                onClick={() => galleryInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-[#4E5C92] text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">
                  photo_library
                </span>
                Choose a photo I already have
              </button>
            </div>
          </BotSays>
        )}

        {/* ---------- The photo they sent ---------- */}
        {preview && (
          <div className="flex justify-end">
            <img
              src={preview}
              alt="The problem you photographed"
              className="w-3/5 max-h-64 object-cover rounded-2xl rounded-tr-md border-2 border-[#FFC928] bg-slate-50"
            />
          </div>
        )}

        {thinking && (
          <BotSays>
            <BotBubble>
              <span className="flex items-center gap-2">
                Looking at your photo
                <TypingDots />
              </span>
              <span className="block text-[11px] text-[#4E5C92] mt-0.5">
                This takes a few seconds. Please don't close the app.
              </span>
            </BotBubble>
          </BotSays>
        )}

        {failed && (
          <BotSays>
            <BotBubble>
              Sorry, I couldn't look at that. {failed}
            </BotBubble>

            <div className="flex gap-2">
              <button
                onClick={() => analyse(photo, noteText.slice(0, MAX_NOTE))}
                className="px-4 py-2.5 rounded-xl bg-[#FFC928] hover:bg-[#F5B301] text-[#101F55] text-xs font-bold active:scale-95 transition-all"
              >
                Try again
              </button>
              <button
                onClick={anotherPhoto}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[#101F55] text-xs font-bold active:scale-95 transition-all"
              >
                Send a different photo
              </button>
            </div>
          </BotSays>
        )}

        {/* ---------- The answer ---------- */}
        {result && (
          <div ref={answerRef} className="scroll-mt-2">
            <BotSays wide>
              <BotBubble>Here's what I can see.</BotBubble>

              {/* Anything that could hurt someone comes first */}
              {result.safety_warning && (
                <div className="bg-red-50 rounded-2xl p-3.5 border border-red-200 flex items-start gap-2.5">
                  <span
                    className="material-symbols-outlined text-red-600 text-[22px] shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    warning
                  </span>

                  <div className="min-w-0">
                    <p className="text-sm font-bold text-red-700">
                      Please do this first
                    </p>
                    <p className="text-xs text-red-700 mt-1 leading-relaxed">
                      {result.safety_warning}
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  {diagnosisPhotoUrl(result) && (
                    <img
                      src={diagnosisPhotoUrl(result)}
                      alt="What you sent"
                      className="w-16 aspect-[4/3] object-contain bg-slate-50 rounded-lg shrink-0"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#101F55]">
                      {result.appliance}
                    </p>

                    {urgency && (
                      <span
                        className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${urgency.tone}`}
                      >
                        <span className="material-symbols-outlined text-[12px]">
                          {urgency.icon}
                        </span>
                        {urgency.label}
                      </span>
                    )}
                  </div>
                </div>

                {result.photo_problem && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#FFF7E0]">
                    <span className="material-symbols-outlined text-[#F47B16] text-[16px] shrink-0">
                      info
                    </span>
                    <p className="text-[11px] text-[#4E5C92] leading-relaxed">
                      {result.photo_problem}
                    </p>
                  </div>
                )}

                <div>
                  <h2 className="text-sm font-bold text-[#101F55]">
                    What a helper will check
                  </h2>
                  <p className="text-[11px] text-[#4E5C92]">
                    {confidenceNote(result.confidence)}
                  </p>
                </div>

                {result.likely_causes?.map((cause, index) => (
                  <div
                    key={cause.cause}
                    className="flex items-start gap-3 p-3 rounded-xl bg-[#FFF3D5]"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#FFE7A8] text-[#4E5C92] text-[11px] font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#101F55]">
                        {cause.cause}
                      </p>
                      <p className="text-[11px] text-[#4E5C92] mt-0.5 leading-relaxed">
                        {cause.why}
                      </p>
                      <span className="inline-block mt-1 text-[10px] font-bold text-[#101F55]">
                        {likelihoodLabel(cause.likelihood)}
                      </span>
                    </div>
                  </div>
                ))}

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  These are things to check, not a confirmed fault. The helper
                  will tell you for certain once they see it, and nothing is
                  charged until you agree.
                </p>
              </div>

              {result.questions_for_member?.length > 0 && (
                <div className="bg-[#FFF3D5] rounded-2xl p-3.5 border border-[#FFE7A8] flex flex-col gap-2">
                  <p className="text-sm font-bold text-[#101F55]">
                    The helper may ask you
                  </p>

                  <ul className="flex flex-col gap-1.5">
                    {result.questions_for_member.map((question) => (
                      <li
                        key={question}
                        className="flex items-start gap-2 text-[11px] text-[#101F55]"
                      >
                        <span className="material-symbols-outlined text-[#4E5C92] text-[14px] shrink-0">
                          help
                        </span>
                        {question}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {result.service_title ? (
                  <button
                    onClick={bookSuggestedService}
                    className="w-full py-3.5 rounded-xl bg-[#FFC928] hover:bg-[#F5B301] text-[#101F55] text-sm font-bold active:scale-95 transition-all"
                  >
                    {`Find a ${result.service_title} helper`}
                  </button>
                ) : (
                  <button
                    onClick={() => navigateTo('home')}
                    className="w-full py-3.5 rounded-xl bg-[#FFC928] hover:bg-[#F5B301] text-[#101F55] text-sm font-bold active:scale-95 transition-all"
                  >
                    Pick a service myself
                  </button>
                )}

                <button
                  onClick={anotherPhoto}
                  className="w-full py-3 rounded-xl bg-white border border-slate-200 text-[#101F55] text-xs font-bold active:scale-95 transition-all"
                >
                  Try another photo
                </button>
              </div>
            </BotSays>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* capture="environment" opens the back camera directly */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={choosePhoto}
        className="hidden"
      />

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={choosePhoto}
        className="hidden"
      />

      {/* ---------- Message box, until the photo is sent ---------- */}
      {!photo && (
        <div className="shrink-0 bg-white border-t border-slate-100 px-3 pt-2 pb-3 flex flex-col gap-1.5">
          {listening && (
            <p className="px-1 text-[11px] text-[#101F55] font-semibold truncate">
              {listeningLabel}
            </p>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              sendNote();
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              aria-label="Take a photo"
              title="Take a photo"
              className="w-10 h-10 rounded-full bg-[#FFF3D5] text-[#101F55] flex items-center justify-center shrink-0 active:scale-95"
            >
              <span className="material-symbols-outlined text-[21px]">
                photo_camera
              </span>
            </button>

            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={Math.max(room, 0)}
              disabled={room <= 0}
              enterKeyHint="send"
              aria-label="Message GigEzee AI"
              placeholder={
                room <= 0
                  ? 'Now take a photo'
                  : notes.length
                    ? 'Add more, or take a photo'
                    : 'For example: the AC runs but the room stays warm'
              }
              className="flex-1 min-w-0 h-10 rounded-full border border-slate-200 bg-[#FFF3D5] px-4 text-[13px] text-[#101F55] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFC928]/40 disabled:opacity-60"
            />

            {listening ? (
              <button
                type="button"
                onClick={stop}
                disabled={transcribing}
                aria-label="Stop listening"
                className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 animate-pulse disabled:cursor-wait"
              >
                <span className="material-symbols-outlined text-[21px]">
                  {transcribing ? 'graphic_eq' : 'stop'}
                </span>
              </button>
            ) : showMic ? (
              <button
                type="button"
                onClick={start}
                aria-label="Speak instead of typing"
                title="Speak instead of typing"
                className="w-10 h-10 rounded-full bg-[#FFC928] text-[#101F55] flex items-center justify-center shrink-0 active:scale-95"
              >
                <span className="material-symbols-outlined text-[21px]">
                  mic
                </span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send"
                className="w-10 h-10 rounded-full bg-[#FFC928] hover:bg-[#F5B301] text-[#101F55] flex items-center justify-center shrink-0 active:scale-95 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">
                  send
                </span>
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
};
