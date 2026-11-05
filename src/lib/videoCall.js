// Live video calls between a member and the partner on their booking.
//
// The call itself is peer to peer (WebRTC): video and sound go straight
// between the two phones. Firebase only carries the handshake, at
//
//   calls/<order key> = { id, from, fromName, status, offer, answer,
//                         createdAt, answeredAt }
//   calls/<order key>/candidates/<member|partner>/<id> = network routes
//
// status: ringing -> active -> ended, or declined / missed / cancelled.
// One call per booking at a time; a new call replaces the old record.

// STUN lets most phones find a direct route. On some mobile networks
// that isn't possible and the call needs a relay (TURN) server, set with
// VITE_TURN_URLS (comma separated), VITE_TURN_USERNAME and
// VITE_TURN_CREDENTIAL. Without one, those calls fail to connect.
const turnUrls = (import.meta.env.VITE_TURN_URLS || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ...(turnUrls.length
    ? [
        {
          urls: turnUrls,
          username: import.meta.env.VITE_TURN_USERNAME || '',
          credential: import.meta.env.VITE_TURN_CREDENTIAL || ''
        }
      ]
    : [])
];

// How long a call rings before it counts as missed
export const RING_TIMEOUT_MS = 45 * 1000;

// Statuses after which nothing more happens on a call
export const FINISHED_STATUSES = ['ended', 'declined', 'missed', 'cancelled'];

// Realtime Database keys can't contain ".", "#", "$", "[", "]"
export const callKeyOf = (orderId) =>
  String(orderId).replace(/[.#$[\]]/g, '');

export const newCallId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const canVideoCall = () =>
  typeof window !== 'undefined' &&
  Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);

// Camera and microphone, kept small: a 640x480 picture is plenty on a
// phone screen and goes through on a weak connection
export const getCallMedia = (facingMode = 'user') =>
  navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: {
      facingMode,
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  });

export const mediaErrorMessage = (error) =>
  error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
    ? 'Please allow the camera and microphone to make video calls.'
    : error?.name === 'NotFoundError'
      ? 'No camera was found on this device.'
      : error?.name === 'NotReadableError'
        ? 'The camera is being used by another app.'
        : "Couldn't start the camera. Please try again.";

// "3:07"
export const formatCallDuration = (totalSeconds) => {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// The chat's video-call button and the call screen are in different
// parts of the app; the button asks, the call screen answers
const callRequests = new Set();

export const onVideoCallRequest = (listener) => {
  callRequests.add(listener);
  return () => callRequests.delete(listener);
};

export const requestVideoCall = () => {
  callRequests.forEach((listener) => listener());
  return callRequests.size > 0;
};
