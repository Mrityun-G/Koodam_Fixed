import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  ShieldCheck,
  Wrench,
  Wallet,
  CheckCircle2,
  ArrowRight,
  Phone,
  Languages
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { phoneProblem, isValidPhone } from '../lib/validators';

// What happens straight after someone signs up.
//
// Before this, a new member landed on Home with no address saved and no
// idea what to do, and a new partner landed on a dashboard with no
// services listed — so they could not be booked by anyone and usually
// left. Three short steps each, skippable, shown once.

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'kn', label: 'ಕನ್ನಡ' }
];

const StepDots = ({ total, current }) => (
  <div className="flex items-center justify-center gap-1.5">
    {Array.from({ length: total }).map((_, index) => (
      <span
        key={index}
        className={`h-1.5 rounded-full transition-all ${
          index === current
            ? 'w-6 bg-[#ff6a00]'
            : index < current
            ? 'w-1.5 bg-[#ff9a56]'
            : 'w-1.5 bg-slate-200'
        }`}
      />
    ))}
  </div>
);

const StepShell = ({ icon: Icon, tint, title, blurb, children }) => (
  <div className="flex flex-1 flex-col">
    <div
      className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${tint}`}
    >
      <Icon size={30} />
    </div>

    <h2 className="text-center text-lg font-extrabold text-[#0b1c30]">
      {title}
    </h2>

    <p className="mx-auto mt-1.5 max-w-xs text-center text-xs leading-relaxed text-[#4e5c92]">
      {blurb}
    </p>

    <div className="mt-5 flex-1">{children}</div>
  </div>
);

export const OnboardingScreen = () => {
  const {
    role,
    userProfile,
    partnerProfile,
    language,
    setLanguage,
    location,
    setLocation,
    detectLocation,
    updateUserProfile,
    updatePartnerProfile,
    completeOnboarding,
    navigateTo,
    showToast
  } = useApp();

  const isPartner = role === 'partner';
  const profile = isPartner ? partnerProfile : userProfile;

  const [step, setStep] = useState(0);
  const [area, setArea] = useState(location || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const phoneError = phone ? phoneProblem(phone) : '';

  const finish = async () => {
    setSaving(true);

    try {
      if (area.trim()) {
        setLocation(area.trim());
      }

      // A reachable number is the one thing the other side of a booking
      // genuinely needs, so it is saved even if everything else is skipped
      if (isValidPhone(phone) && phone !== profile?.phone) {
        const save = isPartner ? updatePartnerProfile : updateUserProfile;
        await save({
          name: profile?.name,
          phone: phone.trim(),
          avatar: profile?.avatar ?? null
        });
      }

      completeOnboarding();

      if (isPartner) {
        showToast('You’re set up. Add your services to start getting jobs.');
        navigateTo('partner', 'services');
      } else {
        showToast('All set — find help near you.');
        navigateTo('home', 'home');
      }
    } catch (error) {
      console.error('Onboarding save failed:', error);
      showToast(error.message || 'Could not save that. You can finish this later from Profile.');
      completeOnboarding();
      navigateTo(isPartner ? 'partner' : 'home', 'home');
    } finally {
      setSaving(false);
    }
  };

  const useMyLocation = async () => {
    setLocating(true);

    try {
      const detected = await detectLocation?.();

      if (detected) {
        setArea(detected);
      } else {
        showToast('Could not find your location. Please type your area.');
      }
    } finally {
      setLocating(false);
    }
  };

  // ---------------------------------------------------------------
  // Steps
  // ---------------------------------------------------------------

  const languageStep = (
    <StepShell
      icon={Languages}
      tint="bg-[#d3e4fe] text-[#354479]"
      title="Pick your language"
      blurb="KOODAM works in English, Tamil and Kannada. You can change this any time in Settings."
    >
      <div className="space-y-2.5">
        {LANGUAGES.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => setLanguage(option.code)}
            className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all ${
              language === option.code
                ? 'border-[#ff6a00] bg-[#fff3ea]'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="text-sm font-bold text-[#0b1c30]">
              {option.label}
            </span>

            {language === option.code && (
              <CheckCircle2 size={20} className="text-[#ff6a00]" />
            )}
          </button>
        ))}
      </div>
    </StepShell>
  );

  const contactStep = (
    <StepShell
      icon={Phone}
      tint="bg-[#6ffbbe]/60 text-[#005236]"
      title="How can we reach you?"
      blurb={
        isPartner
          ? 'Customers call this number when they book you. It is only shared once a job is confirmed.'
          : 'Your helper calls this number when they are on the way. It is only shared once you book.'
      }
    >
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Mobile number
        </span>

        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+91 98765 43210"
          className={`mt-1.5 w-full rounded-full border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
            phoneError
              ? 'border-red-300 bg-red-50/60 focus:ring-red-300/50'
              : 'border-slate-200 bg-[#f8f9ff] focus:ring-[#ff6a00]/40'
          }`}
        />

        {phoneError && (
          <span className="mt-1 block text-[10px] font-semibold text-red-500">
            {phoneError}
          </span>
        )}
      </label>
    </StepShell>
  );

  const areaStep = (
    <StepShell
      icon={MapPin}
      tint="bg-[#ffdbcc] text-[#7b2f00]"
      title={isPartner ? 'Where do you work?' : 'Where do you need help?'}
      blurb={
        isPartner
          ? 'We show your jobs from this area first. You can set how far you travel from your dashboard.'
          : 'We use this to show helpers closest to you. You can change it from the top of the Home screen.'
      }
    >
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Your area
        </span>

        <input
          type="text"
          value={area}
          onChange={(event) => setArea(event.target.value)}
          placeholder="e.g. Anna Nagar, Chennai"
          className="mt-1.5 w-full rounded-full border border-slate-200 bg-[#f8f9ff] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
        />
      </label>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[#ff6a00]/30 bg-[#fff3ea] py-2.5 text-xs font-bold text-[#a14000] disabled:opacity-60"
      >
        <Navigation size={15} />
        {locating ? 'Finding you…' : 'Use my current location'}
      </button>
    </StepShell>
  );

  const partnerReadyStep = (
    <StepShell
      icon={Wrench}
      tint="bg-[#d3e4fe] text-[#354479]"
      title="Two things left"
      blurb="Finish these and customers can start booking you. Both live in your dashboard."
    >
      <div className="space-y-2.5">
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
          <Wrench size={18} className="mt-0.5 shrink-0 text-[#354479]" />
          <div>
            <p className="text-xs font-bold text-[#0b1c30]">
              List your services
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#4e5c92]">
              Pick the work you do and what you charge. Until you add one,
              you will not appear in search.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
          <Wallet size={18} className="mt-0.5 shrink-0 text-[#005236]" />
          <div>
            <p className="text-xs font-bold text-[#0b1c30]">
              Add your payout details
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#4e5c92]">
              Where your earnings are sent after each completed job.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-xs font-bold text-[#0b1c30]">
              Your documents are in review
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[#4e5c92]">
              KOODAM checks every partner. You can start taking jobs while
              this is in progress.
            </p>
          </div>
        </div>
      </div>
    </StepShell>
  );

  const memberReadyStep = (
    <StepShell
      icon={ShieldCheck}
      tint="bg-[#6ffbbe]/60 text-[#005236]"
      title="How KOODAM keeps you safe"
      blurb="Three things worth knowing before your first booking."
    >
      <div className="space-y-2.5">
        {[
          {
            title: 'Every helper is verified',
            body: 'We check identity documents before anyone can take a job.'
          },
          {
            title: 'Share your PIN only at the door',
            body: 'Give the 4-digit safety PIN to your helper when they have arrived — never before.'
          },
          {
            title: 'The price you see is the price you pay',
            body: 'Extra parts are only added if you approve them in the app.'
          }
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-xs font-bold text-[#0b1c30]">{item.title}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[#4e5c92]">
                {item.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </StepShell>
  );

  const steps = isPartner
    ? [languageStep, contactStep, areaStep, partnerReadyStep]
    : [languageStep, contactStep, areaStep, memberReadyStep];

  const isLast = step === steps.length - 1;

  // Nothing on these steps is required: a wrong number is worse than a
  // missing one, so the contact step blocks only while it is invalid.
  const blocked = step === 1 && Boolean(phone) && Boolean(phoneError);

  const skip = () => {
    completeOnboarding();
    navigateTo(isPartner ? 'partner' : 'home', 'home');
  };

  return (
    <div className="flex w-full flex-1 flex-col bg-gradient-to-b from-[#fff3ea] via-[#f8f9ff] to-[#f8f9ff]">
      <header className="flex shrink-0 items-center justify-between px-4 pt-5 pb-2">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="KOODAM" className="h-5 w-5 object-contain" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7b2f00]">
            Getting started
          </span>
        </div>

        <button
          type="button"
          onClick={skip}
          className="text-[11px] font-bold text-[#4e5c92] hover:underline"
        >
          Skip
        </button>
      </header>

      <main className="flex flex-1 flex-col px-5 pt-3 pb-5">
        {steps[step]}

        <div className="mt-5 shrink-0 space-y-3.5">
          <StepDots total={steps.length} current={step} />

          <button
            type="button"
            disabled={blocked || saving}
            onClick={() => (isLast ? finish() : setStep((value) => value + 1))}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff9a56] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ff6a00]/30 transition-all active:scale-98 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            <span>
              {saving
                ? 'Saving…'
                : isLast
                ? isPartner
                  ? 'Go to my dashboard'
                  : 'Find help near me'
                : 'Continue'}
            </span>
            {!saving && <ArrowRight size={18} />}
          </button>

          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((value) => value - 1)}
              className="w-full text-center text-[11px] font-bold text-[#4e5c92] hover:underline"
            >
              Back
            </button>
          )}
        </div>
      </main>
    </div>
  );
};
