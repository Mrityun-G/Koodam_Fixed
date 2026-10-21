import React, { useState } from 'react';
import { useApp, PORTAL } from '../context/AppContext';

export const LandingScreen = () => {
  const { language, navigateTo } = useApp();
  const isPartnerApp = PORTAL === 'partner';

  // The hero is a photograph over a slow network. Until it arrives the box
  // holds a warm gradient rather than a white hole, and the photo fades in
  // on top of it instead of snapping into place.
  const [heroLoaded, setHeroLoaded] = useState(false);

  const strings = {
    en: {
      name: 'GigEzee',
      tagline: 'Neighborhood Mutual Aid & Services',
      partnerTagline: 'Earn by serving your neighbourhood',
      quote: 'People Helping People, Stronger Together',
      cta: 'Get Started',
      offline: 'No smartphone? Book by phone call'
    },
    ta: {
      name: 'GigEzee',
      tagline: 'சமூக பரஸ்பர உதவி & சேவைகள்',
      partnerTagline: 'உங்கள் அக்கம்பக்கத்திற்குச் சேவை செய்து சம்பாதியுங்கள்',
      quote: 'மக்கள் மக்களுக்கு உதவுகிறோம், ஒன்றாக வலிமையாக',
      cta: 'தொடங்குங்கள்',
      offline: 'ஸ்மார்ட்போன் இல்லையா? தொலைபேசி அழைப்பில் முன்பதிவு செய்யுங்கள்'
    },
    kn: {
      name: 'GigEzee',
      tagline: 'ನೆರೆಹೊರೆ ಪರಸ್ಪರ ನೆರವು & ಸೇವೆಗಳು',
      partnerTagline: 'ನಿಮ್ಮ ನೆರೆಹೊರೆಗೆ ಸೇವೆ ಸಲ್ಲಿಸಿ ಗಳಿಸಿ',
      quote: 'ಜನರು ಜನರಿಗೆ ಸಹಾಯ, ಒಟ್ಟಿಗೆ ಬಲಿಷ್ಠ',
      cta: 'ಪ್ರಾರಂಭಿಸಿ',
      offline: 'ಸ್ಮಾರ್ಟ್‌ಫೋನ್ ಇಲ್ಲವೇ? ಫೋನ್ ಕರೆಯಲ್ಲಿ ಬುಕ್ ಮಾಡಿ'
    }
  };

  const t = strings[language] || strings.en;

  // Each piece arrives just after the one above it, so the screen assembles
  // top to bottom instead of flashing in all at once.
  const step = (ms) => ({ animationDelay: `${ms}ms` });

  return (
    // min-h-full, not h-full: on a short phone the content keeps its real
    // height and the frame scrolls, rather than crushing the photo.
    <main className="flex-1 flex flex-col relative w-full bg-white min-h-full">
      {/* Top Brand Section */}
      <div className="flex flex-col items-center text-center px-6 pt-8 pb-5 shrink-0">
        <div
          className="p-1.5 rounded-2xl bg-white shadow-md mb-3 animate-pop-in"
          style={step(60)}
        >
          <img
            src="/logo.svg"
            alt="GigEzee"
            width="64"
            height="64"
            className="w-16 h-16 rounded-xl animate-float-soft motion-reduce:animate-none"
          />
        </div>

        <h1
          className="text-3xl font-extrabold tracking-tight text-[#0b1c30] animate-fade-up"
          style={step(180)}
        >
          {t.name}
          {isPartnerApp && <span className="text-[#1b2a5e]"> Partner</span>}
        </h1>

        <p
          className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1.5 max-w-[220px] animate-fade-up"
          style={step(280)}
        >
          {isPartnerApp ? t.partnerTagline : t.tagline}
        </p>

        <p
          className="italic text-base text-[#1b2a5e] font-semibold mt-2.5 max-w-[240px] animate-fade-up"
          style={step(380)}
        >
          {t.quote}
        </p>

        <span
          className="w-16 h-0.5 bg-[#ff6a00] rounded-full mt-2 animate-fade-in origin-center"
          style={step(480)}
        />
      </div>

      {/* Hero Image. The photo is 862x1600, far taller than the box it sits
          in, so object-cover always discards a third of it. min-h keeps the
          surviving slice tall enough to read on short screens; flex-1 lets it
          take the slack on tall ones. */}
      <div
        className="relative flex-1 min-h-[240px] w-full rounded-t-[40px] overflow-hidden shadow-[0_-10px_30px_rgba(0,0,0,0.08)] bg-gradient-to-br from-[#ffdbcc] via-[#ffb694] to-[#ff9a62] animate-fade-in"
        style={step(420)}
      >
        <picture>
          {/* WebP is ~47% of the JPEG here, and this is the first screen
              anyone sees. Browsers without it fall through to the img. */}
          <source srcSet="/hero-gigezee.webp" type="image/webp" />
          <img
            /* The two women and the bouquet sit at 36-64% of the photo's
               height. Anchoring the crop there instead of at the top keeps
               them in frame at every box height, and clear of the fade. */
            className={`absolute inset-0 w-full h-full object-cover object-[50%_58%] transition-opacity duration-700 motion-reduce:animate-none ${
              heroLoaded ? 'opacity-100 animate-ken-burns' : 'opacity-0'
            }`}
            alt="Neighbors helping each other"
            src="/hero-gigezee.jpeg"
            width="862"
            height="1240"
            decoding="async"
            fetchPriority="high"
            onLoad={() => setHeroLoaded(true)}
          />
        </picture>

        {/* Blends the photo into the white panel holding the buttons */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/80 to-transparent pointer-events-none" />
      </div>

      {/* CTA below the image */}
      <div className="w-full px-6 pt-4 pb-6 shrink-0 bg-white">
        <button
          onClick={() => navigateTo('welcome')}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#ff6a00] hover:bg-[#a14000] text-white text-base font-bold shadow-lg active:scale-98 transition-all animate-fade-up"
          style={step(560)}
          type="button"
        >
          {t.cta}
        </button>

        {/* Offline mode: customers without a smartphone book by calling */}
        {!isPartnerApp && (
          <button
            onClick={() => navigateTo('offline')}
            className="w-full mt-2.5 py-3 px-4 rounded-2xl border border-[#ffdbcc] bg-[#fff8f4] text-[#a14000] text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all animate-fade-up"
            style={step(660)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">call</span>
            {t.offline}
          </button>
        )}
      </div>
    </main>
  );
};
