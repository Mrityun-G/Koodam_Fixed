import React from 'react';
import { useApp, PORTAL } from '../context/AppContext';

export const WelcomeScreen = () => {
  const { language, setLanguage, navigateTo, showToast } = useApp();

  // Multi-lingual copy dictionary
  const strings = {
    en: {
      community: 'GigEzee Community',
      title: 'Welcome to GigEzee',
      subtitle: 'Book trusted local help from your neighbourhood.',
      partnerCommunity: 'GigEzee Partner',
      partnerTitle: 'Welcome to GigEzee Partner',
      partnerSubtitle: 'Manage your jobs, earnings and payouts.',
      card1Role: 'Seek Help',
      card1Title: 'I Need Help / Book Services',
      card1Desc: 'Find trusted local helpers, handymen, electricians, and community volunteers.',
      card1Btn: 'Community Member Login',
      card2Role: 'Provide Service',
      card2Title: 'I Want to Help / Provide Services',
      card2Desc: 'Offer your skills, grow your local client base, and earn with neighborhood trust.',
      card2Btn: 'Service Partner Login',
      card1SignupLink: 'New here? Create an account',
      card2SignupLink: 'New Service Partner? Create an account'
    },
    ta: {
      community: 'GigEzee சமூக சேவை',
      title: 'GigEzee-க்கு வரவேற்கிறோம்',
      subtitle: 'உங்கள் அக்கம்பக்கத்திலிருந்து நம்பகமான உதவியை முன்பதிவு செய்யுங்கள்.',
      partnerCommunity: 'GigEzee Partner',
      partnerTitle: 'GigEzee Partner-க்கு வரவேற்கிறோம்',
      partnerSubtitle: 'உங்கள் வேலைகள், வருமானம் மற்றும் பணப்பரிமாற்றங்களை நிர்வகிக்கவும்.',
      card1Role: 'உதவி பெற',
      card1Title: 'எனக்கு உதவி தேவை / சேவைகளை பதிவு செய்',
      card1Desc: 'நம்பகமான உள்ளூர் கைவினைஞர்கள், எலக்ட்ரீஷியன்கள் மற்றும் தன்னார்வலர்களைக் கண்டறியவும்.',
      card1Btn: 'சமூக உறுப்பினர் உள்நுழைவு',
      card2Role: 'சேவை வழங்க',
      card2Title: 'நான் உதவ விரும்புகிறேன் / சேவை கூட்டாளர்',
      card2Desc: 'உங்கள் திறமைகளை வழங்கி, உள்ளூர் வாடிக்கையாளர்களைப் பெற்று, நம்பிக்கையுடன் சம்பாதிக்கவும்.',
      card2Btn: 'சேவைக் கூட்டாளர் உள்நுழைவு',
      card1SignupLink: 'புதியவரா? கணக்கு உருவாக்கவும்',
      card2SignupLink: 'புதிய சேவை கூட்டாளரா? கணக்கு உருவாக்கவும்'
    },
    kn: {
      community: 'GigEzee ಸಮುದಾಯ ಸೇವೆ',
      title: 'GigEzee-ಗೆ ಸುಸ್ವಾಗತ',
      subtitle: 'ನಿಮ್ಮ ನೆರೆಹೊರೆಯ ವಿಶ್ವಾಸಾರ್ಹ ಸಹಾಯವನ್ನು ಬುಕ್ ಮಾಡಿ.',
      partnerCommunity: 'GigEzee Partner',
      partnerTitle: 'GigEzee Partner-ಗೆ ಸುಸ್ವಾಗತ',
      partnerSubtitle: 'ನಿಮ್ಮ ಕೆಲಸಗಳು, ಗಳಿಕೆ ಮತ್ತು ಪಾವತಿಗಳನ್ನು ನಿರ್ವಹಿಸಿ.',
      card1Role: 'ಸಹಾಯ ಪಡೆಯಿರಿ',
      card1Title: 'ನನಗೆ ಸಹಾಯ ಬೇಕು / ಸೇವೆಗಳನ್ನು ಬುಕ್ ಮಾಡಿ',
      card1Desc: 'ವಿಶ್ವಾಸಾರ್ಹ ಸ್ಥಳೀಯ ಸಹಾಯಕರು ಮತ್ತು ಎಲೆಕ್ಟ್ರಿಷಿಯನ್ ಗಳನ್ನು ಹುಡುಕಿ.',
      card1Btn: 'ಸಮುದಾಯ ಸದಸ್ಯ ಲಾಗಿನ್',
      card2Role: 'ಸೇವೆ ಒದಗಿಸಿ',
      card2Title: 'ನಾನು ಸೇವೆಗಳನ್ನು ಒದಗಿಸಲು ಬಯಸುತ್ತೇನೆ',
      card2Desc: 'ನಿಮ್ಮ ಕೌಶಲ್ಯಗಳನ್ನು ನೀಡಿ ಮತ್ತು ನೆರೆಹೊರೆಯ ನಂಬಿಕೆಯೊಂದಿಗೆ ಗಳಿಸಿ.',
      card2Btn: 'ಸೇವಾ ಪಾಲುದಾರ ಲಾಗಿನ್',
      card1SignupLink: 'ಹೊಸಬರೇ? ಖಾತೆ ರಚಿಸಿ',
      card2SignupLink: 'ಹೊಸ ಸೇವಾ ಪಾಲುದಾರರೇ? ಖಾತೆ ರಚಿಸಿ'
    }
  };

  const t = strings[language] || strings.en;
  const isPartnerApp = PORTAL === 'partner';

  return (
    <main className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <div className="flex flex-col w-full pb-10">
        {/* Top Hero Brand Area */}
        <div className="relative px-4 pt-6 pb-2 flex flex-col items-center text-center">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#ffdbcc]/40 rounded-full blur-3xl pointer-events-none -z-10"></div>
          
          {/* Logo Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ffdbcc] text-[#7b2f00] text-[11px] font-bold uppercase tracking-wider mb-3 shadow-xs">
            <img src="/logo.svg" alt="GigEzee" className="w-4 h-4 object-contain" />
            <span>{isPartnerApp ? t.partnerCommunity : t.community}</span>
          </div>

          <h1 className="text-2xl font-extrabold text-[#0b1c30] tracking-tight mb-1">
            {isPartnerApp ? t.partnerTitle : t.title}
          </h1>
          <p className="text-sm text-[#4e5c92] font-medium max-w-xs">
            {isPartnerApp ? t.partnerSubtitle : t.subtitle}
          </p>

          {/* Social Proof Card */}
          <div className="w-full mt-4 mb-2 rounded-2xl overflow-hidden shadow-xs bg-[#eff4ff] p-3 flex items-center gap-3.5 text-left border border-slate-100">
            <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-[#d3e4fe]">
              <img
                className="w-full h-full object-cover"
                alt="Community Gathering"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDnDV0CZCF2_gbatjjMaZx9IeGkTOV0CjVhq2ZgoS0398QUdBhkAGGrdXujvFGSiHI4wzD9mjnlYIYMka0dw7K-WKPnTbE8CBgc1rRjLhfKyQdIMaJUsCPKkyP_MXM6RmeeIMCFZc5DyOVuAFo_MgQvjJtlvX2qvYQBhLSr4oJQjCtCOHw_mMALqVttwuVAsNzVTePpqUCdg97RavBTH5yqw7RJEPgP9EUaUGMxR0mUWEWezI2mcOKEAA"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1 text-[#a14000] text-[11px] font-bold">
                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>
                  favorite
                </span>
                <span>Mutual Aid & Care</span>
              </div>
              <p className="text-xs text-[#0b1c30] truncate font-bold">
                People Together. Stronger Communities.
              </p>
              <p className="text-[11px] text-[#4e5c92] truncate">
                More than an app... it's a neighborhood family.
              </p>
            </div>
          </div>
        </div>

        {/* Only this app's card: customers at /, partners at /partner */}
        <div className="px-4 flex flex-col gap-4 mt-2">
          {!isPartnerApp && (
          <div className="relative bg-white rounded-2xl p-4 shadow-md flex flex-col transition-all duration-200 hover:shadow-lg border border-slate-100 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#ffdbcc]/30 rounded-bl-full pointer-events-none -z-0"></div>
            
            <div className="relative z-10 flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-2xl bg-[#ff6a00]/15 flex items-center justify-center text-[#ff6a00] shadow-xs">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  roofing
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#ff6a00] text-white text-[11px] font-bold shadow-xs">
                {t.card1Role}
              </span>
            </div>

            <div className="relative z-10">
              <h2 className="text-lg font-bold text-[#0b1c30] mb-1">
                {t.card1Title}
              </h2>
              <p className="text-xs text-[#5a4136] mb-4 leading-relaxed">
                {t.card1Desc}
              </p>

              <button
                onClick={() => navigateTo('memberLogin')}
                className="w-full py-3.5 px-4 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
                type="button"
              >
                <span>{t.card1Btn}</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>

              <button
                onClick={() => navigateTo('memberSignup')}
                className="w-full mt-2 text-center text-xs text-[#a14000] font-bold hover:underline"
                type="button"
              >
                {t.card1SignupLink}
              </button>
            </div>
          </div>
          )}

          {isPartnerApp && (
          <div className="relative bg-[#1b2a5e] text-white rounded-2xl p-4 shadow-md flex flex-col transition-all duration-200 hover:shadow-lg overflow-hidden border border-slate-700">
            <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-[#b3c1ff]/20 rounded-full pointer-events-none"></div>
            
            <div className="relative z-10 flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-[#dce1ff] shadow-xs">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  handyman
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#b3c1ff] text-[#404e83] text-[11px] font-bold">
                {t.card2Role}
              </span>
            </div>

            <div className="relative z-10">
              <h2 className="text-lg font-bold text-white mb-1">
                {t.card2Title}
              </h2>
              <p className="text-xs text-[#dce1ff] mb-4 leading-relaxed opacity-90">
                {t.card2Desc}
              </p>

              <button
                onClick={() => navigateTo('partnerLogin')}
                className="w-full py-3.5 px-4 rounded-full bg-white hover:bg-slate-100 text-[#05164b] text-sm font-bold flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                type="button"
              >
                <span>{t.card2Btn}</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>

              <button
                onClick={() => navigateTo('partnerSignup')}
                className="w-full mt-2 text-center text-xs text-[#dce1ff] font-bold hover:underline"
                type="button"
              >
                {t.card2SignupLink}
              </button>
            </div>
          </div>
          )}
        </div>

        <div className="px-4 mt-6 flex flex-col items-center gap-4 text-center">
          {/* Language Selector Pill Tray */}
          <div className="inline-flex items-center p-1 rounded-full bg-[#eff4ff] shadow-xs border border-slate-200">
            <button
              onClick={() => {
                setLanguage('en');
                showToast('Language changed to English');
              }}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                language === 'en'
                  ? 'bg-white text-[#0b1c30] font-bold shadow-xs'
                  : 'text-[#4e5c92] font-medium hover:text-[#0b1c30]'
              }`}
              type="button"
            >
              English
            </button>
            <button
              onClick={() => {
                setLanguage('ta');
                showToast('மொழி தமிழாக மாற்றப்பட்டது');
              }}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                language === 'ta'
                  ? 'bg-white text-[#0b1c30] font-bold shadow-xs'
                  : 'text-[#4e5c92] font-medium hover:text-[#0b1c30]'
              }`}
              type="button"
            >
              தமிழ்
            </button>
            <button
              onClick={() => {
                setLanguage('kn');
                showToast('ಭಾಷೆಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ');
              }}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                language === 'kn'
                  ? 'bg-white text-[#0b1c30] font-bold shadow-xs'
                  : 'text-[#4e5c92] font-medium hover:text-[#0b1c30]'
              }`}
              type="button"
            >
              ಕನ್ನಡ
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
