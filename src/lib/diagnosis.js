// GigEzee AI: the member photographs what is broken and the AI says
// what a partner should check. Built for members who can't name the
// fault - most often an older person working it out on their own.

import { auth } from './firebase';
import { BACKEND_URL } from './authorizedFetch';

// Phone cameras produce 3-8 MB photos. The AI reads detail, so keep
// more of it than a thumbnail, but not the full sensor image.
const MAX_SIDE = 1600;
const QUALITY = 0.85;

export const URGENCY = {
  urgent: {
    label: 'Needs attention now',
    tone: 'bg-red-50 text-red-600',
    icon: 'priority_high'
  },
  soon: {
    label: 'Book soon',
    tone: 'bg-amber-100 text-amber-700',
    icon: 'schedule'
  },
  routine: {
    label: 'Not urgent',
    tone: 'bg-[#6ffbbe]/30 text-[#006c49]',
    icon: 'check_circle'
  }
};

export const urgencyInfo = (value) => URGENCY[value] || URGENCY.routine;

export const LIKELIHOOD_LABEL = {
  high: 'Most likely',
  medium: 'Possible',
  low: 'Less likely'
};

export const likelihoodLabel = (value) =>
  LIKELIHOOD_LABEL[value] || LIKELIHOOD_LABEL.medium;

export const CONFIDENCE_NOTE = {
  high: 'The photo was clear enough to be fairly sure.',
  medium: 'A helper will confirm this when they see it.',
  low: "The photo wasn't very clear, so treat this as a starting point."
};

export const confidenceNote = (value) =>
  CONFIDENCE_NOTE[value] || CONFIDENCE_NOTE.medium;

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't a photo we can read."));
    };

    image.src = url;
  });

// Shrink before sending: the member is often on a slow connection and
// waiting on the answer
export const shrinkForDiagnosis = async (file) => {
  const image = await loadImage(file);

  const scale = Math.min(
    1,
    MAX_SIDE / Math.max(image.width, image.height)
  );

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);

  canvas
    .getContext('2d')
    .drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Couldn't prepare that photo.")),
      'image/jpeg',
      QUALITY
    );
  });
};

const authHeader = async () => {
  const user = auth?.currentUser;

  if (!user) {
    throw new Error('Please sign in again.');
  }

  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

// Whether the backend has GigEzee AI switched on. A failure here just
// hides the camera; it never blocks the app.
export const checkDiagnosisAvailable = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/diagnosis/available`);

    if (!response.ok) return false;

    return Boolean((await response.json())?.available);
  } catch (error) {
    console.error('Could not check GigEzee AI:', error);
    return false;
  }
};

// The answer names a service by title; the app needs that service's id
// to show its helpers, so the bookable list is looked up here.
export const fetchServices = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/services/`);

    if (!response.ok) return [];

    return await response.json();
  } catch (error) {
    console.error('Could not load the services list:', error);
    return [];
  }
};

export const requestDiagnosis = async (file, note, language) => {
  const blob = await shrinkForDiagnosis(file);

  const formData = new FormData();
  formData.append('file', blob, 'problem.jpg');
  formData.append('note', (note || '').slice(0, 500));
  // The answer comes back in the language the member reads
  formData.append('language', language || 'en');

  const response = await fetch(`${BACKEND_URL}/diagnosis`, {
    method: 'POST',
    // No Content-Type: the browser sets the multipart boundary
    headers: await authHeader(),
    body: formData
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      body?.detail || `GigEzee AI couldn't answer (${response.status})`
    );
  }

  return body;
};

// Tie the diagnosis to the booking so the partner sees the same photo
export const attachDiagnosisToOrder = async (diagnosisId, orderId) => {
  const formData = new FormData();
  formData.append('order_id', orderId);

  const response = await fetch(
    `${BACKEND_URL}/diagnosis/${diagnosisId}/booking`,
    { method: 'POST', headers: await authHeader(), body: formData }
  );

  if (!response.ok) {
    throw new Error('Could not attach the diagnosis to the booking.');
  }

  return true;
};

export const fetchDiagnosisForOrder = async (orderId) => {
  const response = await fetch(
    `${BACKEND_URL}/diagnosis/for-order/${encodeURIComponent(orderId)}`,
    { headers: await authHeader() }
  );

  if (!response.ok) return null;

  return response.json();
};

export const diagnosisPhotoUrl = (result) =>
  result?.photo_path ? `${BACKEND_URL}${result.photo_path}` : '';
