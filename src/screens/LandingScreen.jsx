import React from 'react';
import { useApp } from '../context/AppContext';

export const LandingScreen = () => {
  const { language, navigateTo } = useApp();

  const strings = {
    en: {
      name: 'KOODAM',
      tagline: 'Neighborhood Mutual Aid & Services',
      quote: 'People Helping People, Stronger Together',
      cta: 'Get Started'
    },
    ta: {
      name: 'KOODAM',
      tagline: 'சமூக பரஸ்பர உதவி & சேவைகள்',
      quote: 'மக்கள் மக்களுக்கு உதவுகிறோம், ஒன்றாக வலிமையாக',
      cta: 'தொடங்குங்கள்'
    },
    kn: {
      name: 'KOODAM',
      tagline: 'ನೆರೆಹೊರೆ ಪರಸ್ಪರ ನೆರವು & ಸೇವೆಗಳು',
      quote: 'ಜನರು ಜನರಿಗೆ ಸಹಾಯ, ಒಟ್ಟಿಗೆ ಬಲಿಷ್ಠ',
      cta: 'ಪ್ರಾರಂಭಿಸಿ'
    }
  };

  const t = strings[language] || strings.en;

  return (
    <main className="flex-1 flex flex-col relative w-full bg-white h-full">
      {/* Top Brand Section */}
      <div className="flex flex-col items-center text-center px-6 pt-8 pb-5 shrink-0">
        <div className="p-1.5 rounded-2xl bg-white shadow-md mb-3">
          <img src="/logo.svg" alt="KOODAM" className="w-16 h-16 rounded-xl" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#0b1c30]">{t.name}</h1>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1.5 max-w-[220px]">
          {t.tagline}
        </p>
        <p className="italic text-base text-[#1b2a5e] font-semibold mt-2.5 max-w-[240px]">
          {t.quote}
        </p>
        <span className="w-16 h-0.5 bg-[#ff6a00] rounded-full mt-2"></span>
      </div>

      {/* Hero Image */}
      <div className="relative flex-1 min-h-0 w-full rounded-t-[40px] overflow-hidden shadow-[0_-10px_30px_rgba(0,0,0,0.08)]">
        <img
          className="w-full h-full object-cover object-top"
          alt="Neighbors helping each other"
          src="/hero-koodam.jpeg"
        />
      </div>

      {/* CTA below the image */}
      <div className="w-full px-6 pt-4 pb-6 shrink-0 bg-white">
        <button
          onClick={() => navigateTo('welcome')}
          className="w-full py-3.5 px-4 rounded-2xl bg-[#ff6a00] hover:bg-[#a14000] text-white text-base font-bold shadow-lg active:scale-98 transition-all"
          type="button"
        >
          {t.cta}
        </button>
      </div>
    </main>
  );
};
