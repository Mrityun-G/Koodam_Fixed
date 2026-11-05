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
import {
  isValidDocumentFile,
  documentFileError,
  isValidEmail,
  isValidPhone,
  phoneProblem,
  passwordProblem,
  passwordStrength,
  nameProblem
} from '../lib/validators';

const copy = {
  member: {
    title: 'Community Member',
    loginHeadline: 'Welcome back, neighbor!',
    loginSub: 'Log in to book trusted local help.',
    signupHeadline: 'Join your neighborhood',
    signupSub: 'Create a free account to start booking verified local helpers.',
    badgeIcon: Home,
    trustChips: [
      { icon: ShieldCheck, label: 'Verified Helpers', bg: 'bg-[#FFE7A8]/60', color: 'text-[#101F55]' },
      { icon: Zap, label: 'Instant Booking', bg: 'bg-[#FFE7A8]', color: 'text-[#101F55]' },
      { icon: Shield, label: 'Safe & Secure', bg: 'bg-[#FFE7A8]', color: 'text-[#101F55]' }
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
      { icon: Wallet, label: 'Low Commission', bg: 'bg-[#FFC928]/20', color: 'text-[#F5B301]' },
      { icon: Clock, label: 'Flexible Hours', bg: 'bg-[#101F55]/20', color: 'text-[#FFD65A]' },
      { icon: BadgeCheck, label: 'Trusted Network', bg: 'bg-[#101F55]/20', color: 'text-[#FFD65A]' }
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
            ? 'border-[#FFE7A8] focus:ring-[#FFE7A8]/50 ' + (isPartner ? 'bg-[#101F55]/10 text-white' : 'bg-[#FFF7E0]/60 text-[#101F55]')
            : isPartner
            ? 'border-white/15 bg-white/10 text-white placeholder:text-white/35 focus:ring-[#FFD65A]/50 focus:bg-white/15'
            : 'border-slate-200 bg-[#FFF3D5] text-[#101F55] placeholder:text-slate-400 focus:ring-[#FFC928]/40 focus:bg-white'
        }`}
      />
      {valid && !endAdornment && (
        <CheckCircle2 size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#101F55]" />
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
        isPartner ? 'text-white/50 hover:text-white' : 'text-slate-400 hover:text-[#101F55]'
      }`}
    >
      <Icon size={18} />
    </button>
  );
};

// Official multi-colour Google "G" mark
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

// Four segments that fill as the password gets harder to guess. Gives
// people a reason to go past the minimum instead of stopping at it.
const STRENGTH_COLORS = ['bg-red-400', 'bg-red-400', 'bg-[#FFC928]', 'bg-[#101F55]', 'bg-[#101F55]'];

const PasswordStrength = ({ strength, isPartner }) => (
  <div className="-mt-2 flex items-center gap-2" aria-live="polite">
    <div className="flex flex-1 gap-1">
      {[1, 2, 3, 4].map((step) => (
        <span
          key={step}
          className={`h-1 flex-1 rounded-full transition-colors ${
            strength.score >= step
              ? STRENGTH_COLORS[strength.score]
              : isPartner
              ? 'bg-white/15'
              : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
    <span
      className={`text-[10px] font-bold ${
        strength.score >= 3
          ? 'text-[#101F55]'
          : strength.score === 2
          ? 'text-[#F5B301]'
          : 'text-red-400'
      }`}
    >
      {strength.label}
    </span>
  </div>
);

const formatFileSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Distinct accent per document type so the KYC section reads as colorful, not one flat block.
const DOCUMENT_ACCENTS = {
  sky: {
    icon: 'text-[#FFD65A]',
    badge: 'bg-[#101F55]/20',
    border: 'border-[#101F55]/30 bg-[#101F55]/5 hover:border-[#101F55]/60 hover:bg-[#101F55]/10'
  },
  emerald: {
    icon: 'text-[#FFD65A]',
    badge: 'bg-[#101F55]/20',
    border: 'border-[#101F55]/30 bg-[#101F55]/5 hover:border-[#101F55]/60 hover:bg-[#101F55]/10'
  },
  violet: {
    icon: 'text-[#FFD65A]',
    badge: 'bg-[#101F55]/20',
    border: 'border-[#101F55]/30 bg-[#101F55]/5 hover:border-[#101F55]/60 hover:bg-[#101F55]/10'
  },
  amber: {
    icon: 'text-[#F5B301]',
    badge: 'bg-[#FFC928]/20',
    border: 'border-[#FFC928]/30 bg-[#FFC928]/5 hover:border-[#FFC928]/60 hover:bg-[#FFC928]/10'
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
          <span className="text-xs font-semibold text-white/80">{`Tap to upload ${label.toLowerCase()}`}</span>
          <span className="text-[10px] text-white/40">Camera or Gallery · JPG, PNG or PDF · up to 5MB</span>
        </button>
      ) : (
        <div
          className={`mt-1.5 w-full flex items-center gap-3 rounded-2xl border p-2.5 ${
            error ? 'border-red-400/50 bg-red-500/5' : 'border-[#101F55]/40 bg-[#101F55]/5'
          }`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={label} className="w-14 aspect-[4/3] object-contain bg-white/10 shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <FileText size={20} className="text-white/70" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{file.name}</p>
            <p className="text-[10px] text-white/50">{formatFileSize(file.size)}</p>
          </div>
          {!error && <CheckCircle2 size={20} className="text-[#101F55] shrink-0" />}
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
  const { currentScreen, navigateTo, signUp, signIn, signInWithGoogle, requestPasswordReset, authLoading } = useApp();

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
  // Optional at sign-up; it can also be uploaded later from the partner Profile
  const [policeFile, setPoliceFile] = useState(null);

  const emailValid = isValidEmail(email);

  // Shown under each field once there is something to correct, so the
  // person isn't told what is wrong only when they press the button
  const nameError = name ? nameProblem(name) : '';
  const phoneError = phone ? phoneProblem(phone) : '';
  const passwordError = isSignup && password ? passwordProblem(password) : '';
  const strength = isSignup ? passwordStrength(password) : { score: 0, label: '' };

  const aadhaarError = documentFileError(aadhaarFile);
  const panError = documentFileError(panFile);
  const voterIdError = documentFileError(voterIdFile);
  const policeError = documentFileError(policeFile);

  const kycValid =
    !isPartner ||
    (isValidDocumentFile(aadhaarFile) &&
      isValidDocumentFile(panFile) &&
      isValidDocumentFile(voterIdFile) &&
      (!policeFile || isValidDocumentFile(policeFile)));

  const canSubmit = isSignup
    ? Boolean(name.trim()) &&
      !nameProblem(name) &&
      emailValid &&
      isValidPhone(phone) &&
      !passwordProblem(password) &&
      password === confirmPassword &&
      agreedToTerms &&
      kycValid
    : emailValid && password.length > 0;

  // Explains in plain language why the submit button is still disabled, so the user
  // isn't left staring at a greyed-out button with no idea what to fix.
  const blockingReason = (() => {
    if (!isSignup) return null;
    if (nameProblem(name)) return nameProblem(name);
    if (!emailValid) return 'Enter a valid email address.';
    if (phoneProblem(phone)) return phoneProblem(phone);
    if (passwordProblem(password)) return passwordProblem(password);
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (!agreedToTerms) return 'Please agree to the Terms & Policy.';
    if (!kycValid) return policeError
      ? 'Upload a valid police clearance certificate, or remove it.'
      : 'Upload valid Aadhaar, PAN & Voter ID documents.';
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
        ...(isPartner ? { aadhaarFile, panFile, voterIdFile, policeFile } : {})
      });
    } else {
      signIn(role, { email: email.trim(), password });
    }
  };

  const themeBg = isPartner
    ? 'bg-gradient-to-b from-[#13286B] via-[#101F55] to-[#071233]'
    : 'bg-gradient-to-b from-[#FFF3D5] via-[#FFF3D5] to-[#FFF3D5]';

  return (
    <div className={`flex-1 flex flex-col relative w-full ${themeBg}`}>
      <SubHeader title={isSignup ? `${c.title} Sign Up` : `${c.title} Log In`} backScreen="welcome" backTab="home" />

      <main className={`flex-1 flex flex-col relative w-full pb-10 px-4 pt-5 space-y-4 ${themeBg}`}>
        {/* Decorative hero */}
        <div className="relative flex flex-col items-center text-center gap-3 mb-1 pt-2 pb-1">
          <div
            className={`absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-2xl pointer-events-none ${
              isPartner ? 'bg-[#FFC928]/15' : 'bg-[#FFE7A8]/50'
            }`}
          ></div>
          <div
            className={`absolute -bottom-8 -right-6 w-36 h-36 rounded-full blur-2xl pointer-events-none ${
              isPartner ? 'bg-[#1B3380]/50' : 'bg-[#FFD65A]/30'
            }`}
          ></div>

          <div
            className={`relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-xs ${
              isPartner ? 'bg-white/15 text-[#C9D3F5]' : 'bg-[#FFE7A8] text-[#101F55]'
            }`}
          >
            <img src="/logo.svg" alt="GigEzee" className="w-4 h-4 object-contain" />
            <span>{isPartner ? 'GigEzee Partner' : 'GigEzee Community'}</span>
          </div>

          <div
            className={`relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
              isPartner
                ? 'bg-gradient-to-br from-[#1B3380] to-[#101F55] text-[#FFC928] ring-1 ring-[#FFC928]/40'
                : 'bg-gradient-to-br from-[#FFD65A] to-[#FFC928] text-[#101F55]'
            }`}
          >
            <c.badgeIcon size={30} />
          </div>

          <div className="relative z-10">
            <h1 className={`text-xl font-extrabold ${isPartner ? 'text-white' : 'text-[#101F55]'}`}>
              {isSignup ? c.signupHeadline : c.loginHeadline}
            </h1>
            <p className={`text-xs max-w-xs mx-auto mt-1 ${isPartner ? 'text-[#C9D3F5]' : 'text-[#4E5C92]'}`}>
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

        {/* Google sign-in (Supabase OAuth) */}
        {!isSignup && (
          <>
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              disabled={authLoading}
              className={`w-full py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-3 shadow-lg border active:scale-98 transition-all disabled:opacity-60 ${
                isPartner
                  ? 'bg-white text-[#101F55] border-white hover:bg-slate-100'
                  : 'bg-white text-[#101F55] border-slate-200 hover:bg-slate-50'
              }`}
            >
              <GoogleLogo />
              <span>{authLoading ? 'Please wait…' : 'Continue with Google'}</span>
            </button>

            <p className={`text-center text-[11px] ${isPartner ? 'text-[#C9D3F5]/70' : 'text-slate-400'}`}>
              Log in securely with your Google account
            </p>

            <div className="flex items-center gap-3">
              <div className={`flex-1 h-px ${isPartner ? 'bg-white/15' : 'bg-slate-200'}`}></div>
              <span className={`text-[11px] font-bold uppercase tracking-wide ${isPartner ? 'text-white/50' : 'text-slate-400'}`}>
                or log in with email
              </span>
              <div className={`flex-1 h-px ${isPartner ? 'bg-white/15' : 'bg-slate-200'}`}></div>
            </div>
          </>
        )}

        {/* Email & password form (sign-up and login) */}
        <>
        {/* Gradient-bordered form card */}
        <div
          className={`p-[1.5px] rounded-2xl shadow-lg ${
            isPartner
              ? 'bg-gradient-to-br from-[#FFD65A]/70 via-[#1B3380]/60 to-[#13286B]/40'
              : 'bg-gradient-to-br from-[#FFD65A] via-[#FFC928] to-[#FFE7A8]'
          }`}
        >
          <div className={`rounded-2xl p-4 space-y-3.5 ${isPartner ? 'bg-[#13286B]' : 'bg-white'}`}>
            {isSignup && (
              <FieldInput
                icon={User}
                label="Full Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                isPartner={isPartner}
                error={nameError || undefined}
                valid={Boolean(name) && !nameError}
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
              error={
                isSignup && email && !emailValid
                  ? 'Enter a valid email address.'
                  : undefined
              }
              valid={isSignup && emailValid}
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
                error={phoneError || undefined}
                valid={Boolean(phone) && !phoneError}
              />
            )}

            {isSignup && isPartner && (
              <div className="space-y-3.5 pt-1 border-t border-white/10">
                <div className="flex items-center gap-1.5 pt-2">
                  <ShieldCheck size={16} className="text-[#C9D3F5]" />
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

                <DocumentUpload
                  icon={ShieldCheck}
                  label="Police Clearance Certificate"
                  accent="amber"
                  file={policeFile}
                  onSelect={setPoliceFile}
                  onRemove={() => setPoliceFile(null)}
                  error={policeError}
                />

                <p className="-mt-1 text-[10px] text-[#F5B301]/80 leading-relaxed">
                  Optional now — you can also upload it later from your Profile. Partners
                  with a verified certificate get a Police Verified badge.
                </p>

                <p className="text-[10px] text-[#C9D3F5]/70 leading-relaxed">
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
              placeholder={
                isSignup ? '8+ characters, with a number' : 'Enter your password'
              }
              isPartner={isPartner}
              error={passwordError || undefined}
              endAdornment={
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} isPartner={isPartner} />
              }
            />

            {isSignup && password && (
              <PasswordStrength strength={strength} isPartner={isPartner} />
            )}

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
                className={`text-xs font-bold hover:underline ${isPartner ? 'text-[#C9D3F5]' : 'text-[#101F55]'}`}
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
                  className="mt-0.5 w-4 h-4 rounded accent-[#FFC928]"
                />
                <span className={`text-xs ${isPartner ? 'text-[#C9D3F5]' : 'text-[#4E5C92]'}`}>
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
              ? 'bg-gradient-to-r from-white to-[#FFF7E0] hover:from-slate-100 hover:to-white text-[#101F55] shadow-[#FFD65A]/30 disabled:from-white/10 disabled:to-white/10 disabled:text-white/40 disabled:shadow-none'
              : 'bg-gradient-to-r from-[#FFC928] to-[#FFD65A] hover:from-[#F5B301] hover:to-[#FFC928] text-[#101F55] shadow-[#FFC928]/30 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none'
          }`}
        >
          <span>{authLoading ? 'Please wait…' : isSignup ? 'Create Account' : 'Log In'}</span>
          {!authLoading && <ArrowRight size={18} />}
        </button>
        </>

        {isSignup && blockingReason && hasStartedForm && (
          <p className={`-mt-2 text-center text-xs font-semibold ${isPartner ? 'text-[#F5B301]' : 'text-red-500'}`}>
            {blockingReason}
          </p>
        )}

        <div className={`text-center text-xs ${isPartner ? 'text-[#C9D3F5]' : 'text-[#4E5C92]'}`}>
          {isSignup ? 'Already have an account?' : 'New to GigEzee?'}{' '}
          <button
            type="button"
            onClick={() => navigateTo(isSignup ? `${role}Login` : `${role}Signup`)}
            className={`font-bold hover:underline ${isPartner ? 'text-white' : 'text-[#101F55]'}`}
          >
            {isSignup ? 'Log In' : 'Sign Up'}
          </button>
        </div>
      </main>
    </div>
  );
};
