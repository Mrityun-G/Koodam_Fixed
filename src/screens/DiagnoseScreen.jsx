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

// Show us the problem: the member photographs what is broken, GigEzee AI
// says what a helper should check, and they book from the answer.
//
// Three steps, one screen: capture -> thinking -> answer.
export const DiagnoseScreen = () => {
  const {
    navigateTo,
    showToast,
    setSelectedService,
    setDiagnosis,
    language
  } = useApp();

  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState(null);

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
  const noteRef = useRef(null);

  // Speaking is easier than typing for most members this is built for.
  // Each finished phrase is added to what is already there, so they can
  // talk, stop to think, and carry on.
  const { listening, interim, start, stop, supported } = useSpeechInput({
    language,
    onFinal: (phrase) =>
      setNote((current) => {
        const next = current ? `${current.trim()} ${phrase}` : phrase;
        return next.slice(0, 500);
      }),
    onError: showToast
  });

  // Drop the preview's object URL when it is replaced or the screen closes
  useEffect(() => {
    if (!preview) return undefined;

    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    // Let the same photo be picked again after clearing it
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please choose a photo.');
      return;
    }

    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
  };

  const startOver = () => {
    stop();
    setPhoto(null);
    setPreview('');
    setNote('');
    setResult(null);
  };

  const askGigEzeeAI = async () => {
    if (!photo || thinking) return;

    // Whatever they were still saying gets added before we send
    stop();
    setThinking(true);

    try {
      setResult(await requestDiagnosis(photo, note, language));
    } catch (error) {
      console.error('GigEzee AI failed:', error);
      showToast(error.message || "GigEzee AI couldn't answer. Please try again.");
    } finally {
      setThinking(false);
    }
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

  return (
    <div className="flex flex-col h-full bg-[#f8f9ff]">
      <header className="shrink-0 bg-white px-4 py-3 flex items-center gap-3 border-b border-slate-100">
        <button
          onClick={() => navigateTo('home')}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#0b1c30] flex items-center justify-center active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">
            arrow_back
          </span>
        </button>

        <div className="min-w-0">
          <h1 className="text-base font-bold text-[#0b1c30]">
            Show us the problem
          </h1>
          <p className="text-[11px] text-[#5a4136]">
            No need to know what it is called
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {/* ---------- Step 1: the photo ---------- */}
        {!result && (
          <>
            {preview ? (
              <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-100 flex flex-col gap-3">
                <img
                  src={preview}
                  alt="The problem you photographed"
                  className="w-full max-h-72 object-contain bg-slate-50"
                />

                <button
                  onClick={startOver}
                  className="self-start text-[11px] font-bold text-[#a14000] hover:underline"
                >
                  Take a different photo
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[32px]">
                    photo_camera
                  </span>
                </div>

                <div>
                  <p className="text-sm font-bold text-[#0b1c30]">
                    Take a photo of the problem
                  </p>
                  <p className="text-[11px] text-[#5a4136] mt-1 leading-relaxed">
                    Stand close enough that the whole appliance fits in the
                    picture. GigEzee AI will work out what is likely wrong.
                  </p>
                </div>

                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-3.5 rounded-xl bg-[#ff6a00] hover:bg-[#a14000] text-white text-sm font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    photo_camera
                  </span>
                  Open camera
                </button>

                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="text-[11px] font-bold text-[#4e5c92] hover:underline"
                >
                  Choose a photo I already have
                </button>
              </div>
            )}

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

            {/* ---------- Step 2: what they noticed ---------- */}
            {preview && (
              <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex flex-col gap-2">
                <label
                  htmlFor="diagnosis-note"
                  className="text-sm font-bold text-[#0b1c30]"
                >
                  What did you notice?
                </label>

                <p className="text-[11px] text-[#5a4136]">
                  Say it or type it, in your own words. This helps more than
                  the photo alone.
                </p>

                {supported && (
                  <button
                    type="button"
                    onClick={listening ? stop : start}
                    aria-pressed={listening}
                    className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all ${
                      listening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-[#eff4ff] text-[#0b1c30] hover:bg-[#dce9ff]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {listening ? 'graphic_eq' : 'mic'}
                    </span>
                    {listening ? 'Listening… tap to stop' : 'Speak instead of typing'}
                  </button>
                )}

                {listening && (
                  <p className="text-[11px] text-[#5a4136] text-center min-h-[16px]">
                    {interim || 'Go ahead, I am listening…'}
                  </p>
                )}

                <textarea
                  id="diagnosis-note"
                  ref={noteRef}
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 500))}
                  placeholder="For example: the AC runs but the room stays warm"
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 text-xs text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40 resize-none"
                />

                {note && (
                  <button
                    type="button"
                    onClick={() => setNote('')}
                    className="self-end text-[11px] font-bold text-[#a14000] hover:underline"
                  >
                    Clear what I said
                  </button>
                )}

                <button
                  onClick={askGigEzeeAI}
                  disabled={thinking}
                  className="w-full py-3.5 rounded-xl bg-[#ff6a00] hover:bg-[#a14000] disabled:opacity-60 text-white text-sm font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {thinking ? (
                    <>
                      <span className="material-symbols-outlined text-[20px] animate-spin">
                        progress_activity
                      </span>
                      GigEzee AI is looking…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">
                        auto_awesome
                      </span>
                      Ask GigEzee AI
                    </>
                  )}
                </button>

                {thinking && (
                  <p className="text-[11px] text-center text-[#5a4136]">
                    This takes a few seconds. Please don't close the app.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ---------- Step 3: the answer ---------- */}
        {result && (
          <>
            {/* Anything that could hurt someone comes first */}
            {result.safety_warning && (
              <div className="bg-red-50 rounded-2xl p-4 border border-red-200 flex items-start gap-3">
                <span
                  className="material-symbols-outlined text-red-600 text-[24px] shrink-0"
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

            <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                {diagnosisPhotoUrl(result) && (
                  <img
                    src={diagnosisPhotoUrl(result)}
                    alt="What you sent"
                    className="w-20 aspect-[4/3] object-contain bg-slate-50 shrink-0"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#0b1c30]">
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
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#fff8f4]">
                  <span className="material-symbols-outlined text-[#a14000] text-[16px] shrink-0">
                    info
                  </span>
                  <p className="text-[11px] text-[#5a4136] leading-relaxed">
                    {result.photo_problem}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#0b1c30]">
                  What a helper will check
                </h2>
                <p className="text-[11px] text-[#5a4136]">
                  {confidenceNote(result.confidence)}
                </p>
              </div>

              {result.likely_causes?.map((cause, index) => (
                <div
                  key={cause.cause}
                  className="flex items-start gap-3 p-3 rounded-xl bg-[#f8f9ff]"
                >
                  <div className="w-6 h-6 rounded-full bg-[#dce1ff] text-[#4e5c92] text-[11px] font-bold flex items-center justify-center shrink-0">
                    {index + 1}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#0b1c30]">
                      {cause.cause}
                    </p>
                    <p className="text-[11px] text-[#5a4136] mt-0.5 leading-relaxed">
                      {cause.why}
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-bold text-[#a14000]">
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
              <div className="bg-[#eff4ff] rounded-2xl p-4 border border-[#dce1ff] flex flex-col gap-2">
                <p className="text-sm font-bold text-[#0b1c30]">
                  The helper may ask you
                </p>

                <ul className="flex flex-col gap-1.5">
                  {result.questions_for_member.map((question) => (
                    <li
                      key={question}
                      className="flex items-start gap-2 text-[11px] text-[#0b1c30]"
                    >
                      <span className="material-symbols-outlined text-[#4e5c92] text-[14px] shrink-0">
                        help
                      </span>
                      {question}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-2 pb-2">
              {result.service_title ? (
                <button
                  onClick={bookSuggestedService}
                  className="w-full py-3.5 rounded-xl bg-[#ff6a00] hover:bg-[#a14000] text-white text-sm font-bold active:scale-95 transition-all"
                >
                  {`Find a ${result.service_title} helper`}
                </button>
              ) : (
                <button
                  onClick={() => navigateTo('home')}
                  className="w-full py-3.5 rounded-xl bg-[#ff6a00] hover:bg-[#a14000] text-white text-sm font-bold active:scale-95 transition-all"
                >
                  Pick a service myself
                </button>
              )}

              <button
                onClick={startOver}
                className="w-full py-3 rounded-xl bg-white border border-slate-200 text-[#0b1c30] text-xs font-bold active:scale-95 transition-all"
              >
                Try another photo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
