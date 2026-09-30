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
