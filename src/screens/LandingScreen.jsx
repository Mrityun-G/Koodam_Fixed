import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp, PORTAL } from '../context/AppContext';

export const LandingScreen = () => {
  const { language, navigateTo } = useApp();
  const isPartnerApp = PORTAL === 'partner';

  // The hero is a photograph over a slow network. Until it arrives the box
  // holds a warm gradient rather than a white hole, and the photo fades in
  // on top of it instead of snapping into place.
  const [heroLoaded, setHeroLoaded] = useState(false);

  // The headline is split so its last phrase can be picked out in orange.
  const strings = {
    en: {
      name: 'GigEzee',
      quoteLead: 'People Helping People, Stronger',
      quoteAccent: 'Together',
      blurb: 'Your neighborhood platform to hire trusted local service providers and support each other in daily needs.',
      partnerBlurb: 'Earn by serving your neighbourhood',
      cta: 'Get Started',
      offline: 'No smartphone? Book by phone call'
    },
    ta: {
      name: 'GigEzee',
      quoteLead: 'மக்கள் மக்களுக்கு உதவுகிறோம்,',
      quoteAccent: 'ஒன்றாக வலிமையாக',
      blurb: 'நம்பகமான உள்ளூர் சேவை வழங்குநர்களை அமர்த்தவும், அன்றாடத் தேவைகளில் ஒருவருக்கொருவர் உதவவும் உங்கள் அக்கம்பக்கத் தளம்.',
      partnerBlurb: 'உங்கள் அக்கம்பக்கத்திற்குச் சேவை செய்து சம்பாதியுங்கள்',
      cta: 'தொடங்குங்கள்',
      offline: 'ஸ்மார்ட்போன் இல்லையா? தொலைபேசி அழைப்பில் முன்பதிவு செய்யுங்கள்'
    },
    kn: {
      name: 'GigEzee',
      quoteLead: 'ಜನರು ಜನರಿಗೆ ಸಹಾಯ,',
      quoteAccent: 'ಒಟ್ಟಿಗೆ ಬಲಿಷ್ಠ',
      blurb: 'ವಿಶ್ವಾಸಾರ್ಹ ಸ್ಥಳೀಯ ಸೇವಾ ಪೂರೈಕೆದಾರರನ್ನು ನೇಮಿಸಲು ಮತ್ತು ದಿನನಿತ್ಯದ ಅಗತ್ಯಗಳಲ್ಲಿ ಪರಸ್ಪರ ಬೆಂಬಲಿಸಲು ನಿಮ್ಮ ನೆರೆಹೊರೆಯ ವೇದಿಕೆ.',
      partnerBlurb: 'ನಿಮ್ಮ ನೆರೆಹೊರೆಗೆ ಸೇವೆ ಸಲ್ಲಿಸಿ ಗಳಿಸಿ',
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
    <main className="flex-1 flex flex-col relative w-full bg-white min-h-full overflow-hidden">
      {/* Warm sweep in the top-left corner, echoing the orange wave below */}
      <div className="absolute -top-24 -left-24 w-56 h-56 rounded-full border-[18px] border-[#ffb36b]/50 pointer-events-none" />

      {/* Headline */}
      <div className="relative flex flex-col items-center text-center px-6 pt-8 pb-2 shrink-0 bg-gradient-to-b from-[#fff6ee] to-[#fdf8f3]">
        <div
          className="flex items-center gap-2 mb-5 animate-pop-in"
          style={step(60)}
        >
          <img
            src="/logo.svg"
            alt=""
            width="28"
            height="28"
            className="w-7 h-7 rounded-lg"
          />
          <span className="text-sm font-extrabold tracking-tight text-[#0b1c30]">
            {t.name}
            {isPartnerApp && <span className="text-[#1b2a5e]"> Partner</span>}
          </span>
        </div>

        <h1
          className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-[#0b1c30] max-w-[320px] animate-fade-up"
          style={step(180)}
        >
          {t.quoteLead}{' '}
          <span className="text-[#ff6a00]">{t.quoteAccent}</span>
        </h1>

        <span
          className="w-16 h-1 bg-[#ff6a00] rounded-full mt-3 animate-fade-in origin-center"
          style={step(300)}
        />

        <p
          className="text-sm leading-relaxed text-slate-500 mt-3 max-w-[290px] animate-fade-up"
          style={step(380)}
        >
          {isPartnerApp ? t.partnerBlurb : t.blurb}
        </p>
      </div>

      {/* Hero Image. The artwork ends in its own white wave, so it sits
          straight on the white panel holding the buttons. flex-1 lets it take
          the slack on tall screens; object-bottom keeps the wave and skyline
          in frame and trims sky first when the box is short. */}
      <div
        className="relative flex-1 min-h-[260px] w-full overflow-hidden bg-gradient-to-b from-[#fdf8f3] via-[#ffdbcc] to-white animate-fade-in"
        style={step(420)}
      >
        <img
          className={`absolute inset-0 w-full h-full object-cover object-bottom transition-opacity duration-700 ${
            heroLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          alt="A GigEzee helper and a neighbour going over a job together"
          src="/hero-helpers.jpg"
          width="786"
          height="870"
          decoding="async"
          fetchPriority="high"
          onLoad={() => setHeroLoaded(true)}
        />

        {/* Blends the top edge of the photo into the headline panel */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#fdf8f3] to-transparent pointer-events-none" />
      </div>

      {/* CTA below the image */}
      <div className="w-full px-6 pt-3 pb-6 shrink-0 bg-white">
        <button
          onClick={() => navigateTo('welcome')}
          className="w-full py-3.5 px-4 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff9a56] text-white text-base font-bold shadow-lg shadow-[#ff6a00]/30 flex items-center justify-center gap-2 active:scale-98 transition-all animate-fade-up"
          style={step(560)}
          type="button"
        >
          {t.cta}
          <ArrowRight size={20} />
        </button>

        {/* Offline mode: customers without a smartphone book by calling */}
        {!isPartnerApp && (
          <button
            onClick={() => navigateTo('offline')}
            className="w-full mt-2.5 py-3 px-4 rounded-full border border-[#ffcf9f] bg-white text-[#0b1c30] text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all animate-fade-up"
            style={step(660)}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px] text-[#ff6a00]">call</span>
            {t.offline}
          </button>
        )}
      </div>
    </main>
  );
};
