import React from 'react';
import {
  ArrowRight,
  Briefcase,
  HandCoins,
  HeartHandshake,
  ShieldCheck,
  UserRound,
  Users,
  Wrench
} from 'lucide-react';
import { useApp, PORTAL } from '../context/AppContext';

// Navy and gold. GOLD_TEXT is a darker gold for text on white, where the
// bright gold would be too faint to read.
const NAVY = '#0b1a45';
const GOLD = '#f5b301';
const GOLD_TEXT = '#9a6700';

// Paints the "Ezee" of the brand name gold wherever it appears in a title,
// so every language keeps the two-tone wordmark.
const BrandTitle = ({ text, accent }) => {
  const at = text.indexOf('Ezee');

  if (at === -1) {
    return text;
  }

  return (
    <>
      {text.slice(0, at)}
      <span className={`bg-gradient-to-r ${accent} bg-clip-text text-transparent`}>
        Ezee
      </span>
      {text.slice(at + 4)}
    </>
  );
};

// What each app's card shows. Customers at /, partners at /partner; only
// the copy, icons and destinations differ.
const CARDS = {
  member: {
    icon: 'home',
    accent: 'from-[#ff8a00] to-[#ff6a00]',
    featureIcons: [Wrench, ShieldCheck, Users, HeartHandshake],
    loginIcon: Users,
    keys: { titleLead: 'card1TitleLead', titleAccent: 'card1TitleAccent', desc: 'card1Desc', features: 'card1Features', btn: 'card1Btn', signupLead: 'card1SignupLead' },
    login: 'memberLogin',
    signup: 'memberSignup'
  },
  partner: {
    icon: 'construction',
    accent: 'from-[#f5a300] to-[#c98a00]',
    featureIcons: [Briefcase, Users, HandCoins, ShieldCheck],
    loginIcon: UserRound,
    keys: { titleLead: 'card2TitleLead', titleAccent: 'card2TitleAccent', desc: 'card2Desc', features: 'card2Features', btn: 'card2Btn', signupLead: 'card2SignupLead' },
    login: 'partnerLogin',
    signup: 'partnerSignup'
  }
};

// The login card: the four reasons to use GigEzee in a row, and a navy
// login bar.
const ServiceCard = ({ kind, t, compact, navigateTo }) => {
  const card = CARDS[kind];
  const copy = Object.fromEntries(
    Object.entries(card.keys).map(([field, key]) => [field, t[key]])
  );
  const LoginIcon = card.loginIcon;

  return (
  <div className="relative mt-4 bg-gradient-to-br from-white via-white to-[#fff7e0] rounded-3xl shadow-xl shadow-[#0b1a45]/10 border border-[#e6e9f4] overflow-hidden">
    {/* Gold edge along the top of the card */}
    <div className="absolute z-10 inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0b1a45] via-[#f5b301] to-[#0b1a45]" />
    <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#fff4cc] pointer-events-none" />

    <div className="relative">
      <div className="relative px-5 pt-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md shadow-[#0b1a45]/30"
          style={{ background: `linear-gradient(145deg, #1b3380, ${NAVY})` }}
        >
          <span
            className="material-symbols-outlined text-[30px]"
            style={{ color: GOLD, fontVariationSettings: "'FILL' 1" }}
          >
            {card.icon}
          </span>
        </div>

        <h2 className="mt-4 text-[22px] leading-tight font-extrabold tracking-tight" style={{ color: NAVY }}>
          {copy.titleLead}{' '}
          <span className={`bg-gradient-to-r ${card.accent} bg-clip-text text-transparent`}>
            {copy.titleAccent}
          </span>
        </h2>
        <p className="mt-2 text-[13px] text-[#4e5c92] leading-relaxed">
          {copy.desc}
        </p>
      </div>
    </div>

    <div className="relative px-5 pb-5">
      <ul className="mt-3 grid grid-cols-4 divide-x divide-[#e6e9f4]">
        {copy.features.map((label, index) => {
          const Icon = card.featureIcons[index];

          return (
            <li key={label} className="flex flex-col items-center text-center px-1">
              <span className="w-11 h-11 rounded-2xl bg-[#fff4d6] flex items-center justify-center">
                {/* Outline-only icons (hands, wrench) turn to blobs when filled */}
                <Icon
                  size={22}
                  color={NAVY}
                  fill={[HandCoins, Wrench, HeartHandshake].includes(Icon) ? 'none' : GOLD}
                  strokeWidth={2}
                />
              </span>
              <span
                className={`mt-1.5 w-full leading-tight font-bold [overflow-wrap:anywhere] ${compact ? 'text-[9px]' : 'text-[10.5px]'}`}
                style={{ color: NAVY }}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => navigateTo(card.login)}
        className="group mt-5 w-full py-2 pl-3 pr-2 rounded-full text-white text-[15px] font-bold flex items-center gap-2 shadow-lg shadow-[#0b1a45]/30 border border-[#f5b301]/40 active:scale-98 transition-all"
        style={{ background: `linear-gradient(90deg, ${NAVY}, #1b3380)` }}
        type="button"
      >
        <span className="w-9 h-9 rounded-full flex items-center justify-center">
          <LoginIcon size={22} color={GOLD} fill={GOLD} />
        </span>
        <span className="flex-1 text-center">{copy.btn}</span>
        <span className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-[#ffd65a] to-[#f5b301] transition-transform group-hover:translate-x-0.5">
          <ArrowRight size={20} color={NAVY} strokeWidth={2.5} />
        </span>
      </button>

      <button
        onClick={() => navigateTo(card.signup)}
        className="w-full mt-3 py-1 text-center text-[13px] font-bold"
        style={{ color: NAVY }}
        type="button"
      >
        {copy.signupLead}{' '}
        <span className="underline decoration-2 underline-offset-4 decoration-[#f5b301]" style={{ color: GOLD_TEXT }}>
          {t.signupAction}
        </span>
      </button>
    </div>
  </div>
  );
};

const LANGUAGES = [
  { code: 'en', label: 'English', toast: 'Language changed to English' },
  { code: 'ta', label: 'தமிழ்', toast: 'மொழி தமிழாக மாற்றப்பட்டது' },
  { code: 'kn', label: 'ಕನ್ನಡ', toast: 'ಭಾಷೆಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ' }
];

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
      aidTag: 'Mutual Aid & Care',
      aidTitle: 'People Together. Stronger Communities.',
      aidBody: 'More than an app… it’s a neighborhood family.',
      card1Role: 'Seek Help',
      card1TitleLead: 'I Need Help /',
      card1TitleAccent: 'Book Services',
      card1Features: ['Trusted Helpers', 'Safe & Reliable', 'Local Community', 'Support Each Other'],
      card1Desc: 'Find trusted local helpers, handymen, electricians, and community volunteers.',
      card1Btn: 'Community Member Login',
      card2Role: 'Provide Service',
      card2TitleLead: 'I Want to Help /',
      card2TitleAccent: 'Provide Services',
      card2Features: ['Get Jobs Near You', 'Grow Your Clients', 'Track Earnings', 'Build Trust'],
      card2Desc: 'Offer your skills, grow your local client base, and earn with neighborhood trust.',
      card2Btn: 'Service Partner Login',
      card1SignupLead: 'New here?',
      card2SignupLead: 'New Service Partner?',
      signupAction: 'Create an account'
    },
    ta: {
      community: 'GigEzee சமூக சேவை',
      title: 'GigEzee-க்கு வரவேற்கிறோம்',
      subtitle: 'உங்கள் அக்கம்பக்கத்திலிருந்து நம்பகமான உதவியை முன்பதிவு செய்யுங்கள்.',
      partnerCommunity: 'GigEzee Partner',
      partnerTitle: 'GigEzee Partner-க்கு வரவேற்கிறோம்',
      partnerSubtitle: 'உங்கள் வேலைகள், வருமானம் மற்றும் பணப்பரிமாற்றங்களை நிர்வகிக்கவும்.',
      aidTag: 'பரஸ்பர உதவி & அக்கறை',
      aidTitle: 'மக்கள் ஒன்றாக. வலுவான சமூகங்கள்.',
      aidBody: 'இது ஒரு செயலி மட்டுமல்ல… ஒரு அக்கம்பக்கக் குடும்பம்.',
      card1Role: 'உதவி பெற',
      card1TitleLead: 'எனக்கு உதவி தேவை /',
      card1TitleAccent: 'சேவைகளை பதிவு செய்',
      card1Features: ['நம்பகமான உதவியாளர்கள்', 'பாதுகாப்பானது & நம்பகமானது', 'உள்ளூர் சமூகம்', 'ஒருவருக்கொருவர் உதவி'],
      card1Desc: 'நம்பகமான உள்ளூர் கைவினைஞர்கள், எலக்ட்ரீஷியன்கள் மற்றும் தன்னார்வலர்களைக் கண்டறியவும்.',
      card1Btn: 'சமூக உறுப்பினர் உள்நுழைவு',
      card2Role: 'சேவை வழங்க',
      card2TitleLead: 'நான் உதவ விரும்புகிறேன் /',
      card2TitleAccent: 'சேவை கூட்டாளர்',
      card2Features: ['அருகில் வேலைகள்', 'வாடிக்கையாளர்களை வளர்க்க', 'வருமானத்தைக் கண்காணிக்க', 'நம்பிக்கையை வளர்க்க'],
      card2Desc: 'உங்கள் திறமைகளை வழங்கி, உள்ளூர் வாடிக்கையாளர்களைப் பெற்று, நம்பிக்கையுடன் சம்பாதிக்கவும்.',
      card2Btn: 'சேவைக் கூட்டாளர் உள்நுழைவு',
      card1SignupLead: 'புதியவரா?',
      card2SignupLead: 'புதிய சேவை கூட்டாளரா?',
      signupAction: 'கணக்கு உருவாக்கவும்'
    },
    kn: {
      community: 'GigEzee ಸಮುದಾಯ ಸೇವೆ',
      title: 'GigEzee-ಗೆ ಸುಸ್ವಾಗತ',
      subtitle: 'ನಿಮ್ಮ ನೆರೆಹೊರೆಯ ವಿಶ್ವಾಸಾರ್ಹ ಸಹಾಯವನ್ನು ಬುಕ್ ಮಾಡಿ.',
      partnerCommunity: 'GigEzee Partner',
      partnerTitle: 'GigEzee Partner-ಗೆ ಸುಸ್ವಾಗತ',
      partnerSubtitle: 'ನಿಮ್ಮ ಕೆಲಸಗಳು, ಗಳಿಕೆ ಮತ್ತು ಪಾವತಿಗಳನ್ನು ನಿರ್ವಹಿಸಿ.',
      aidTag: 'ಪರಸ್ಪರ ನೆರವು & ಕಾಳಜಿ',
      aidTitle: 'ಜನರು ಒಟ್ಟಾಗಿ. ಬಲಿಷ್ಠ ಸಮುದಾಯಗಳು.',
      aidBody: 'ಇದು ಕೇವಲ ಆ್ಯಪ್ ಅಲ್ಲ… ಇದು ನೆರೆಹೊರೆಯ ಕುಟುಂಬ.',
      card1Role: 'ಸಹಾಯ ಪಡೆಯಿರಿ',
      card1TitleLead: 'ನನಗೆ ಸಹಾಯ ಬೇಕು /',
      card1TitleAccent: 'ಸೇವೆಗಳನ್ನು ಬುಕ್ ಮಾಡಿ',
      card1Features: ['ವಿಶ್ವಾಸಾರ್ಹ ಸಹಾಯಕರು', 'ಸುರಕ್ಷಿತ & ವಿಶ್ವಾಸಾರ್ಹ', 'ಸ್ಥಳೀಯ ಸಮುದಾಯ', 'ಪರಸ್ಪರ ಬೆಂಬಲ'],
      card1Desc: 'ವಿಶ್ವಾಸಾರ್ಹ ಸ್ಥಳೀಯ ಸಹಾಯಕರು ಮತ್ತು ಎಲೆಕ್ಟ್ರಿಷಿಯನ್ ಗಳನ್ನು ಹುಡುಕಿ.',
      card1Btn: 'ಸಮುದಾಯ ಸದಸ್ಯ ಲಾಗಿನ್',
      card2Role: 'ಸೇವೆ ಒದಗಿಸಿ',
      card2TitleLead: 'ನಾನು ಸಹಾಯ ಮಾಡಲು ಬಯಸುತ್ತೇನೆ /',
      card2TitleAccent: 'ಸೇವೆ ಒದಗಿಸಿ',
      card2Features: ['ಹತ್ತಿರದ ಕೆಲಸಗಳು', 'ಗ್ರಾಹಕರನ್ನು ಬೆಳೆಸಿ', 'ಗಳಿಕೆ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ', 'ನಂಬಿಕೆ ಗಳಿಸಿ'],
      card2Desc: 'ನಿಮ್ಮ ಕೌಶಲ್ಯಗಳನ್ನು ನೀಡಿ ಮತ್ತು ನೆರೆಹೊರೆಯ ನಂಬಿಕೆಯೊಂದಿಗೆ ಗಳಿಸಿ.',
      card2Btn: 'ಸೇವಾ ಪಾಲುದಾರ ಲಾಗಿನ್',
      card1SignupLead: 'ಹೊಸಬರೇ?',
      card2SignupLead: 'ಹೊಸ ಸೇವಾ ಪಾಲುದಾರರೇ?',
      signupAction: 'ಖಾತೆ ರಚಿಸಿ'
    }
  };

  const t = strings[language] || strings.en;
  const isPartnerApp = PORTAL === 'partner';
  const isLatin = !strings[language] || language === 'en';

  return (
    <main className="flex-1 flex flex-col relative w-full min-h-screen overflow-hidden bg-[#f6f7fb]">
      {/* Hero: the brand on the left, the person this app is for on the right.
          Customers get a light, warm hero; partners a navy one. The photo's
          lower edge tucks behind the Mutual Aid card that overlaps the hero. */}
      <section
        className="relative shrink-0 px-5 pt-7 pb-24 text-left overflow-hidden"
        style={{
          background: isPartnerApp
            ? `linear-gradient(160deg, #13286b 0%, ${NAVY} 55%, #071233 100%)`
            : 'linear-gradient(160deg, #ffffff 0%, #fff8ea 55%, #ffeec8 100%)'
        }}
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className={`absolute -top-10 right-0 w-64 h-64 rounded-full blur-3xl ${isPartnerApp ? 'bg-[#f5b301]/25' : 'bg-[#ffd65a]/45'}`} />
          <div className={`absolute top-28 -left-20 w-48 h-48 rounded-full blur-3xl ${isPartnerApp ? 'bg-[#3c5bc4]/40' : 'bg-[#ffe7b0]/70'}`} />
          {/* Thin gold rings, a quiet nod to "coming together" */}
          <div className="absolute -top-24 -left-24 w-60 h-60 rounded-full border border-[#f5b301]/30" />
          <div className="absolute -top-16 -left-16 w-44 h-44 rounded-full border border-[#f5b301]/20" />
        </div>

        <img
          className="absolute bottom-0 -right-6 h-[270px] w-auto pointer-events-none select-none drop-shadow-xl"
          src={isPartnerApp ? '/welcome-partner.png' : '/welcome-member.png'}
          alt=""
          width={isPartnerApp ? 455 : 445}
          height="600"
          decoding="async"
          fetchPriority="high"
        />

        {/* Curved base, so the hero melts into the page instead of ending in a line */}
        <svg
          className="absolute bottom-0 left-0 w-full h-16 pointer-events-none"
          viewBox="0 0 400 64"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 40 C 120 72, 280 8, 400 36 L400 64 L0 64 Z" fill="#f5b301" opacity="0.9" />
          <path d="M0 48 C 120 80, 280 18, 400 46 L400 64 L0 64 Z" fill="#f6f7fb" />
        </svg>

        {/* Tamil and Kannada words run much longer than English ones and
            cannot break, so those get a smaller title and a wider column. */}
        <div className={`relative flex flex-col items-start ${isLatin ? 'w-[52%]' : 'w-[60%]'}`}>
          {/* Logo Pill */}
          <div
            className={`inline-flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 whitespace-nowrap ${
              isPartnerApp
                ? 'bg-white/10 border border-[#f5b301]/40 text-[#ffd65a] backdrop-blur'
                : 'bg-[#ffe7a8] border border-[#f5b301]/50 text-[#7a4e00]'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <img src="/logo.svg" alt="" className="w-4 h-4 rounded-full object-contain" />
            </span>
            <span>{isPartnerApp ? t.partnerCommunity : t.community}</span>
          </div>

          <h1
            className={`${isLatin ? 'text-[30px]' : 'text-[21px]'} leading-[1.15] font-extrabold tracking-tight`}
            style={{ color: isPartnerApp ? '#ffffff' : NAVY }}
          >
            <BrandTitle
              text={isPartnerApp ? t.partnerTitle : t.title}
              accent={isPartnerApp ? 'from-[#ffd65a] to-[#f5b301]' : 'from-[#f5a300] to-[#e07b00]'}
            />
          </h1>

          <span className="w-12 h-1 rounded-full mt-3 bg-gradient-to-r from-[#ffd65a] to-[#f5b301]" />

          <p
            className="text-[13px] font-medium mt-3 leading-relaxed"
            style={{ color: isPartnerApp ? '#c9d3f5' : '#4e5c92' }}
          >
            {isPartnerApp ? t.partnerSubtitle : t.subtitle}
          </p>
        </div>
      </section>

      <div className="relative z-10 flex flex-col w-full px-4 -mt-16 pb-10">
        {/* Social Proof Card */}
        <div className="w-full rounded-2xl overflow-hidden bg-white border border-[#f5b301]/40 shadow-lg shadow-[#0b1a45]/10 flex items-stretch text-left">
          <div className="relative w-[44%] shrink-0 min-h-[124px]">
            <img
              className="absolute inset-0 w-full h-full object-cover object-left"
              alt="A GigEzee helper chatting with a neighbour"
              src="/welcome-community.jpg"
              width="350"
              height="258"
              decoding="async"
            />
            {/* Lets the illustration dissolve into the card instead of ending in a hard edge */}
            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
          </div>

          <div className="flex-1 min-w-0 py-3 pr-3 pl-2.5">
            <div className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: GOLD_TEXT }}>
              <span
                className="material-symbols-outlined text-[15px]"
                style={{ color: GOLD, fontVariationSettings: "'FILL' 1" }}
              >
                favorite
              </span>
              <span>{t.aidTag}</span>
            </div>
            <p className="text-[13px] leading-snug font-extrabold mt-1" style={{ color: NAVY }}>
              {t.aidTitle}
            </p>
            <p className="text-[11px] leading-snug text-[#4e5c92] mt-1">
              {t.aidBody}
            </p>
          </div>
        </div>

        {/* Only this app's card: customers at /, partners at /partner */}
        <ServiceCard kind={isPartnerApp ? 'partner' : 'member'} t={t} compact={!isLatin} navigateTo={navigateTo} />

        {/* Language Selector Pill Tray */}
        <div className="mt-7 flex justify-center">
          <div
            className="inline-flex items-center p-1 rounded-full shadow-lg shadow-[#0b1a45]/20"
            style={{ background: NAVY }}
          >
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                onClick={() => {
                  setLanguage(option.code);
                  showToast(option.toast);
                }}
                aria-pressed={language === option.code}
                className={`px-5 py-2 rounded-full text-sm transition-all ${
                  language === option.code
                    ? 'bg-gradient-to-r from-[#ffd65a] to-[#f5b301] text-[#0b1a45] font-extrabold shadow-sm'
                    : 'text-[#c9d3f5] font-semibold hover:text-white'
                }`}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};
