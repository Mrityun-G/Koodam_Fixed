import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Mail,
  Phone,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  FileText,
  ArrowRight,
  ShieldCheck,
  Zap,
  Shield,
  BadgeCheck,
  Wallet,
  Clock,
  Home,
  Wrench,
  CreditCard,
  Fingerprint,
  Vote
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SubHeader } from '../components/SubHeader';
import { isValidDocumentFile, documentFileError } from '../lib/validators';

const copy = {
  member: {
    title: 'Community Member',
    loginHeadline: 'Welcome back, neighbor!',
    loginSub: 'Log in to book trusted local help.',
    signupHeadline: 'Join your neighborhood',
    signupSub: 'Create a free account to start booking verified local helpers.',
    badgeIcon: Home,
    trustChips: [
      { icon: ShieldCheck, label: 'Verified Helpers', bg: 'bg-[#6ffbbe]/60', color: 'text-[#005236]' },
      { icon: Zap, label: 'Instant Booking', bg: 'bg-[#ffdbcc]', color: 'text-[#7b2f00]' },
      { icon: Shield, label: 'Safe & Secure', bg: 'bg-[#d3e4fe]', color: 'text-[#354479]' }
    ]
  },
  partner: {
    title: 'Service Partner',
    loginHeadline: 'Welcome back, partner!',
    loginSub: 'Log in to manage your jobs and earnings.',
    signupHeadline: 'Become a Service Partner',
    signupSub: 'Sign up to offer your skills and start earning locally.',
    badgeIcon: Wrench,
    trustChips: [
      { icon: Wallet, label: 'Zero Commission', bg: 'bg-amber-400/20', color: 'text-amber-200' },
      { icon: Clock, label: 'Flexible Hours', bg: 'bg-sky-400/20', color: 'text-sky-200' },
      { icon: BadgeCheck, label: 'Trusted Network', bg: 'bg-emerald-400/20', color: 'text-emerald-200' }
    ]
  }
};

const FieldInput = ({ icon: Icon, label, type, value, onChange, placeholder, isPartner, endAdornment, valid, error, maxLength }) => (
  <label className="block">
    <span className={`text-[11px] font-bold uppercase tracking-wide ${isPartner ? 'text-white/60' : 'text-slate-500'}`}>
      {label}
    </span>
    <div className="relative mt-1.5">
      <Icon
        size={18}
        className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
          isPartner ? 'text-white/40' : 'text-slate-400'
        }`}
      />
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`w-full rounded-full border pl-10 ${endAdornment || valid ? 'pr-11' : 'pr-4'} py-2.5 text-sm transition-all focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-300 bg-red-50/60 text-red-900 placeholder:text-red-300 focus:ring-red-300/50'
            : valid
            ? 'border-emerald-300 focus:ring-emerald-300/50 ' + (isPartner ? 'bg-emerald-400/10 text-white' : 'bg-emerald-50/60 text-[#0b1c30]')
            : isPartner
            ? 'border-white/15 bg-white/10 text-white placeholder:text-white/35 focus:ring-[#b3c1ff]/50 focus:bg-white/15'
            : 'border-slate-200 bg-[#f8f9ff] text-[#0b1c30] placeholder:text-slate-400 focus:ring-[#ff6a00]/40 focus:bg-white'
        }`}
      />
      {valid && !endAdornment && (
        <CheckCircle2 size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500" />
      )}
      {endAdornment}
    </div>
    {error && <span className="mt-1 block text-[10px] font-semibold text-red-500">{error}</span>}
  </label>
);

const PasswordToggle = ({ shown, onToggle, isPartner }) => {
  const Icon = shown ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${
        isPartner ? 'text-white/50 hover:text-white' : 'text-slate-400 hover:text-[#a14000]'
      }`}
    >
      <Icon size={18} />
    </button>
  );
};

const formatFileSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Distinct accent per document type so the KYC section reads as colorful, not one flat block.
const DOCUMENT_ACCENTS = {
  sky: {
    icon: 'text-sky-300',
    badge: 'bg-sky-400/20',
    border: 'border-sky-400/30 bg-sky-400/5 hover:border-sky-400/60 hover:bg-sky-400/10'
  },
  emerald: {
    icon: 'text-emerald-300',
    badge: 'bg-emerald-400/20',
    border: 'border-emerald-400/30 bg-emerald-400/5 hover:border-emerald-400/60 hover:bg-emerald-400/10'
  },
  violet: {
    icon: 'text-violet-300',
    badge: 'bg-violet-400/20',
    border: 'border-violet-400/30 bg-violet-400/5 hover:border-violet-400/60 hover:bg-violet-400/10'
  }
};

// Upload card for a single KYC document — only ever rendered on the dark
// Service Partner sign-up form, so it's styled for that theme directly.
// No `capture` attribute on the file input: leaving it off keeps both the
// camera AND the photo gallery available on mobile, instead of forcing camera-only.
const DocumentUpload = ({ icon: Icon, label, accent, file, onSelect, onRemove, error }) => {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const accentCfg = DOCUMENT_ACCENTS[accent];

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
    return undefined;
  }, [file]);

  return (
    <div>
      <span className="text-[11px] font-bold uppercase tracking-wide text-white/60">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] || null)}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`mt-1.5 w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-5 transition-all ${
            error ? 'border-red-400/50 bg-red-500/5' : accentCfg.border
          }`}
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${accentCfg.badge}`}>
            <Icon size={22} className={accentCfg.icon} />
          </div>
          <span className="text-xs font-semibold text-white/80">Tap to upload {label.toLowerCase()}</span>
          <span className="text-[10px] text-white/40">Camera or Gallery · JPG, PNG or PDF · up to 5MB</span>
        </button>
      ) : (
        <div
          className={`mt-1.5 w-full flex items-center gap-3 rounded-2xl border p-2.5 ${
            error ? 'border-red-400/50 bg-red-500/5' : 'border-emerald-400/40 bg-emerald-400/5'
          }`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={label} className="w-11 h-11 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <FileText size={20} className="text-white/70" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{file.name}</p>
            <p className="text-[10px] text-white/50">{formatFileSize(file.size)}</p>
          </div>
          {!error && <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && <span className="mt-1 block text-[10px] font-semibold text-red-400">{error}</span>}
    </div>
  );
};

export const AuthScreen = () => {
  const { currentScreen, navigateTo, signUp, signIn, requestPasswordReset, authLoading } = useApp();

  const role = currentScreen.startsWith('partner') ? 'partner' : 'member';
  const isSignup = currentScreen.toLowerCase().endsWith('signup');
  const isPartner = role === 'partner';
  const c = copy[role];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Service Partner KYC (identity verification) — uploaded document files
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [voterIdFile, setVoterIdFile] = useState(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const aadhaarError = documentFileError(aadhaarFile);
  const panError = documentFileError(panFile);
  const voterIdError = documentFileError(voterIdFile);

  const kycValid =
    !isPartner || (isValidDocumentFile(aadhaarFile) && isValidDocumentFile(panFile) && isValidDocumentFile(voterIdFile));

  const canSubmit = isSignup
    ? Boolean(name.trim()) &&
      emailValid &&
      Boolean(phone.trim()) &&
      password.length >= 6 &&
      password === confirmPassword &&
      agreedToTerms &&
      kycValid
    : emailValid && password.length > 0;

  // Explains in plain language why the submit button is still disabled, so the user
  // isn't left staring at a greyed-out button with no idea what to fix.
  const blockingReason = (() => {
    if (!isSignup) return null;
    if (!name.trim()) return 'Enter your full name.';
    if (!emailValid) return 'Enter a valid email address.';
    if (!phone.trim()) return 'Enter your phone number.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (!agreedToTerms) return 'Please agree to the Terms & Policy.';
    if (!kycValid) return 'Upload valid Aadhaar, PAN & Voter ID documents.';
    return null;
  })();
  const hasStartedForm = Boolean(name.trim() || email || phone.trim() || password || confirmPassword);

  const handleSubmit = () => {
    if (!canSubmit || authLoading) return;
    if (isSignup) {
      signUp(role, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        ...(isPartner ? { aadhaarFile, panFile, voterIdFile } : {})
      });
    } else {
      signIn(role, { email: email.trim(), password });
    }
  };

  const themeBg = isPartner
    ? 'bg-gradient-to-b from-[#141f47] via-[#0f1a3d] to-[#0b1430]'
    : 'bg-gradient-to-b from-[#fff3ea] via-[#f8f9ff] to-[#f8f9ff]';

  return (
    <div className={`flex-1 flex flex-col relative w-full ${themeBg}`}>
      <SubHeader title={isSignup ? `${c.title} Sign Up` : `${c.title} Log In`} backScreen="welcome" backTab="home" />

      <main className={`flex-1 flex flex-col relative w-full pb-10 px-4 pt-5 space-y-4 ${themeBg}`}>
        {/* Decorative hero */}
        <div className="relative flex flex-col items-center text-center gap-3 mb-1 pt-2 pb-1">
          <div
            className={`absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-2xl pointer-events-none ${
              isPartner ? 'bg-[#4e5c92]/30' : 'bg-[#ffdbcc]/50'
            }`}
          ></div>
          <div
            className={`absolute -bottom-8 -right-6 w-36 h-36 rounded-full blur-2xl pointer-events-none ${
              isPartner ? 'bg-[#00ae78]/20' : 'bg-[#b3c1ff]/30'
            }`}
          ></div>

          <div
            className={`relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-xs ${
              isPartner ? 'bg-white/15 text-[#dce1ff]' : 'bg-[#ffdbcc] text-[#7b2f00]'
            }`}
          >
            <img src="/logo.svg" alt="KOODAM" className="w-4 h-4 object-contain" />
            <span>KOODAM Community</span>
          </div>

          <div
            className={`relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
              isPartner
                ? 'bg-gradient-to-br from-[#4e5c92] to-[#1b2a5e] text-white'
                : 'bg-gradient-to-br from-[#ff9a56] to-[#ff6a00] text-white'
            }`}
          >
            <c.badgeIcon size={30} />
          </div>

          <div className="relative z-10">
            <h1 className={`text-xl font-extrabold ${isPartner ? 'text-white' : 'text-[#0b1c30]'}`}>
              {isSignup ? c.signupHeadline : c.loginHeadline}
            </h1>
            <p className={`text-xs max-w-xs mx-auto mt-1 ${isPartner ? 'text-[#dce1ff]' : 'text-[#4e5c92]'}`}>
              {isSignup ? c.signupSub : c.loginSub}
            </p>
          </div>

          <div className="relative z-10 flex items-center justify-center gap-1.5 flex-wrap px-2">
            {c.trustChips.map((chip) => (
              <span
                key={chip.label}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${chip.bg} ${chip.color}`}
              >
                <chip.icon size={12} />
                {chip.label}
              </span>
            ))}
          </div>
        </div>

        {/* Gradient-bordered form card */}
        <div
          className={`p-[1.5px] rounded-2xl shadow-lg ${
            isPartner
              ? 'bg-gradient-to-br from-[#b3c1ff]/70 via-[#4e5c92]/60 to-[#00ae78]/40'
              : 'bg-gradient-to-br from-[#ffb694] via-[#ff6a00] to-[#ffdbcc]'
          }`}
        >
          <div className={`rounded-2xl p-4 space-y-3.5 ${isPartner ? 'bg-[#101c42]' : 'bg-white'}`}>
            {isSignup && (
              <FieldInput
                icon={User}
                label="Full Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                isPartner={isPartner}
              />
            )}

            <FieldInput
              icon={Mail}
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              isPartner={isPartner}
            />

            {isSignup && (
              <FieldInput
                icon={Phone}
                label="Phone Number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                isPartner={isPartner}
              />
            )}

            {isSignup && isPartner && (
              <div className="space-y-3.5 pt-1 border-t border-white/10">
                <div className="flex items-center gap-1.5 pt-2">
                  <ShieldCheck size={16} className="text-[#b3c1ff]" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-white/60">
                    Identity Verification (KYC)
                  </span>
                </div>

                <DocumentUpload
                  icon={Fingerprint}
                  label="Aadhaar Card"
                  accent="sky"
                  file={aadhaarFile}
                  onSelect={setAadhaarFile}
                  onRemove={() => setAadhaarFile(null)}
                  error={aadhaarError}
                />

                <DocumentUpload
                  icon={CreditCard}
                  label="PAN Card"
                  accent="emerald"
                  file={panFile}
                  onSelect={setPanFile}
                  onRemove={() => setPanFile(null)}
                  error={panError}
                />

                <DocumentUpload
                  icon={Vote}
                  label="Voter ID Card"
                  accent="violet"
                  file={voterIdFile}
                  onSelect={setVoterIdFile}
                  onRemove={() => setVoterIdFile(null)}
                  error={voterIdError}
                />

                <p className="text-[10px] text-[#dce1ff]/70 leading-relaxed">
                  Used only to verify your identity as a service partner. Your documents are never shared with
                  members.
                </p>
              </div>
            )}

            <FieldInput
              icon={Lock}
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? 'At least 6 characters' : 'Enter your password'}
              isPartner={isPartner}
              endAdornment={
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} isPartner={isPartner} />
              }
            />

            {isSignup && (
              <FieldInput
                icon={KeyRound}
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                isPartner={isPartner}
                error={confirmPassword && password !== confirmPassword ? 'Passwords do not match.' : undefined}
                valid={Boolean(confirmPassword) && password === confirmPassword}
                endAdornment={
                  <PasswordToggle
                    shown={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((s) => !s)}
                    isPartner={isPartner}
                  />
                }
              />
            )}

            {!isSignup && (
              <button
                type="button"
                onClick={() => requestPasswordReset(email.trim())}
                className={`text-xs font-bold hover:underline ${isPartner ? 'text-[#b3c1ff]' : 'text-[#a14000]'}`}
              >
                Forgot password?
              </button>
            )}

            {isSignup && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-[#ff6a00]"
                />
                <span className={`text-xs ${isPartner ? 'text-[#dce1ff]' : 'text-[#5a4136]'}`}>
                  I agree to the{' '}
                  <button type="button" onClick={() => navigateTo('terms')} className="font-bold underline">
                    Terms & Policy
                  </button>
                </span>
              </label>
            )}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || authLoading}
          className={`w-full py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all ${
            isPartner
              ? 'bg-gradient-to-r from-white to-[#eef1ff] hover:from-slate-100 hover:to-white text-[#05164b] shadow-[#b3c1ff]/30 disabled:from-white/10 disabled:to-white/10 disabled:text-white/40 disabled:shadow-none'
              : 'bg-gradient-to-r from-[#ff6a00] to-[#ff9a56] hover:from-[#a14000] hover:to-[#ff6a00] text-white shadow-[#ff6a00]/30 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none'
          }`}
        >
          <span>{authLoading ? 'Please wait…' : isSignup ? 'Create Account' : 'Log In'}</span>
          {!authLoading && <ArrowRight size={18} />}
        </button>

        {isSignup && blockingReason && hasStartedForm && (
          <p className={`-mt-2 text-center text-xs font-semibold ${isPartner ? 'text-amber-300' : 'text-red-500'}`}>
            {blockingReason}
          </p>
        )}

        <div className={`text-center text-xs ${isPartner ? 'text-[#dce1ff]' : 'text-[#4e5c92]'}`}>
          {isSignup ? 'Already have an account?' : 'New to KOODAM?'}{' '}
          <button
            type="button"
            onClick={() => navigateTo(isSignup ? `${role}Login` : `${role}Signup`)}
            className={`font-bold hover:underline ${isPartner ? 'text-white' : 'text-[#a14000]'}`}
          >
            {isSignup ? 'Log In' : 'Sign Up'}
          </button>
        </div>

        <div className={`text-center text-[11px] ${isPartner ? 'text-[#dce1ff]/70' : 'text-slate-400'}`}>
          {isPartner ? 'Looking for local help instead?' : 'Want to offer services instead?'}{' '}
          <button
            type="button"
            onClick={() => navigateTo(isPartner ? 'memberLogin' : 'partnerLogin')}
            className="font-bold hover:underline"
          >
            {isPartner ? 'Community Member Login' : 'Service Partner Login'}
          </button>
        </div>
      </main>
    </div>
  );
};
