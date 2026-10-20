// Service Partner KYC document uploads (Aadhaar, PAN, Voter ID) — client-side
// file checks only (type + size). No OCR/number extraction or government
// verification is performed; that would require a licensed KYC API.
export const MAX_DOCUMENT_SIZE_MB = 5;
export const ACCEPTED_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const isValidDocumentFile = (file) => {
  if (!file) return false;
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) return false;
  if (file.size > MAX_DOCUMENT_SIZE_MB * 1024 * 1024) return false;
  return true;
};

export const documentFileError = (file) => {
  if (!file) return '';
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) return 'Upload a JPG, PNG or PDF file.';
  if (file.size > MAX_DOCUMENT_SIZE_MB * 1024 * 1024) return `File must be under ${MAX_DOCUMENT_SIZE_MB}MB.`;
  return '';
};


// =========================================================
// EMAIL
// =========================================================

export const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());


// =========================================================
// PHONE
// Indian mobile numbers: ten digits starting 6-9, optionally written
// with +91, 0091 or a leading 0, and with spaces or dashes anywhere.
// The form used to accept any non-empty string, so a booking could be
// saved with a number nobody could call.
// =========================================================

export const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length === 13 && digits.startsWith('091')) {
    return digits.slice(3);
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  return digits;
};

export const isValidPhone = (phone) => /^[6-9]\d{9}$/.test(normalizePhone(phone));

export const phoneProblem = (phone) => {
  const value = String(phone || '').trim();

  if (!value) return 'Enter your phone number.';

  const digits = normalizePhone(value);

  if (digits.length < 10) return 'That number is too short — enter all 10 digits.';
  if (digits.length > 10) return 'That number is too long — enter 10 digits.';
  if (!/^[6-9]/.test(digits)) return 'An Indian mobile number starts with 6, 7, 8 or 9.';

  return '';
};

// +91XXXXXXXXXX, which is what the IVR and SMS providers expect
export const toE164 = (phone) => {
  const digits = normalizePhone(phone);

  return isValidPhone(digits) ? `+91${digits}` : '';
};


// =========================================================
// PASSWORDS
// Firebase's own floor is 6 characters, which lets through "123456".
// Eight plus a letter and a digit is still easy to remember and takes a
// guessing attack from seconds to impractical.
// =========================================================

export const MIN_PASSWORD_LENGTH = 8;

// The handful that get tried first in any credential-stuffing attempt
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwerty123', 'abc12345', 'iloveyou', 'admin123',
  'welcome1', 'koodam123', 'india123', 'letmein1'
]);

export const passwordProblem = (password) => {
  const value = String(password || '');

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!/[a-zA-Z]/.test(value)) {
    return 'Password must include at least one letter.';
  }

  if (!/\d/.test(value)) {
    return 'Password must include at least one number.';
  }

  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return 'That password is too easy to guess. Please pick another.';
  }

  return '';
};

// For the strength meter under the password field
export const passwordStrength = (password) => {
  const value = String(password || '');

  if (!value) return { score: 0, label: '' };

  let score = 0;

  if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;

  if (passwordProblem(value)) {
    return { score: Math.min(score, 1), label: 'Too weak' };
  }

  if (score <= 2) return { score: 2, label: 'Okay' };
  if (score === 3) return { score: 3, label: 'Good' };

  return { score: 4, label: 'Strong' };
};


// =========================================================
// NAMES
// =========================================================

export const nameProblem = (name) => {
  const value = String(name || '').trim();

  if (!value) return 'Enter your full name.';
  if (value.length < 2) return 'Please enter your full name.';
  if (value.length > 80) return 'That name is too long.';
  if (!/[a-zA-Z஀-௿ಀ-೿]/.test(value)) {
    return 'Please enter your name in letters.';
  }

  return '';
};
