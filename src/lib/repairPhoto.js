import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

import { auth, storage, isStorageConfigured } from './firebase';
import { BACKEND_URL } from './authorizedFetch';

// Phone cameras produce 3-8 MB photos; the customer only needs to see
// the part or the finished repair, so shrink before uploading.
const MAX_SIDE = 1280;
const QUALITY = 0.75;

// Used only when Storage isn't set up or the upload fails: the photo is
// kept on the order itself, so it has to be small
const FALLBACK_MAX_SIDE = 640;
const FALLBACK_QUALITY = 0.6;

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
      reject(new Error('That file is not a photo we can read.'));
    };

    image.src = url;
  });

const drawScaled = (image, maxSide) => {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
};

const toBlob = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the photo.'))),
      'image/jpeg',
      quality
    );
  });

const uploadToBackend = async (blob, orderKey, label) => {
  const user = auth?.currentUser;

  if (!user) {
    throw new Error('Not signed in');
  }

  const form = new FormData();
  form.append('file', blob, `${label}.jpg`);
  form.append('order_id', orderKey);
  // "part-<id>" style labels are stored as plain "part"
  form.append('label', label.startsWith('part') ? 'part' : 'repair');

  const response = await fetch(`${BACKEND_URL}/photos`, {
    method: 'POST',
    // No Content-Type: the browser sets the multipart boundary
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    body: form
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.path) {
    throw new Error(body?.detail || `Upload failed (${response.status})`);
  }

  return `${BACKEND_URL}${body.path}`;
};

/**
 * Uploads a repair photo for an order and returns a URL to show it.
 * `folder` is the order's database key; `label` names the file
 * (e.g. "repair" or "part-<chargeId>").
 */
export const uploadRepairPhoto = async (file, folder, label) => {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Please choose a photo.');
  }

  const image = await loadImage(file);
  const blob = await toBlob(drawScaled(image, MAX_SIDE), QUALITY);

  // KOODAM's backend keeps it in the database with the booking
  try {
    return await uploadToBackend(blob, folder, label);
  } catch (error) {
    console.warn('Saving the photo to KOODAM failed, trying Firebase Storage:', error);
  }

  if (isStorageConfigured && storage) {
    try {
      const fileRef = storageRef(
        storage,
        `repairPhotos/${folder}/${label}-${Date.now()}.jpg`
      );

      await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
      return await getDownloadURL(fileRef);
    } catch (error) {
      console.warn('Repair photo upload failed, keeping a small copy instead:', error);
    }
  }

  return drawScaled(image, FALLBACK_MAX_SIDE).toDataURL('image/jpeg', FALLBACK_QUALITY);
};

// Only real links are kept in the permanent record; an inline fallback
// copy lives on the live order only
export const isHostedPhoto = (url) => /^https?:\/\//i.test(String(url || ''));
