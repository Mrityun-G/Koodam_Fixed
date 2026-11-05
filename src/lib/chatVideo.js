// Video clips in the booking chat: the member shows the leak or the noise,
// the partner shows the finished work. Clips go to Firebase Storage under
// chatVideos/<order key>/ (see firebase/storage.rules) and the chat
// message carries the link.
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL
} from 'firebase/storage';
import { storage, isStorageConfigured } from './firebase';

// About half a minute of phone video; enough to show a problem, small
// enough to send on mobile data
export const MAX_CHAT_VIDEO_MB = 50;

const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|3gp|mkv)$/i;

// Some Android cameras hand over a clip with no type; the name says it
const videoType = (file) =>
  file?.type?.startsWith('video/')
    ? file.type
    : VIDEO_EXTENSION.test(file?.name || '')
      ? 'video/mp4'
      : '';

// What is wrong with the clip, or '' when it can be sent
export const chatVideoProblem = (file) => {
  if (!file || !videoType(file)) {
    return 'Please choose a video.';
  }

  if (file.size > MAX_CHAT_VIDEO_MB * 1024 * 1024) {
    return `That video is too big. Please send one under ${MAX_CHAT_VIDEO_MB} MB (about 30 seconds).`;
  }

  return '';
};

export const canShareVideos = () => Boolean(isStorageConfigured && storage);

// Uploads the clip and resolves with its link. onProgress gets 0..1.
export const uploadChatVideo = (file, orderKey, onProgress) =>
  new Promise((resolve, reject) => {
    if (!canShareVideos()) {
      reject(new Error("Video sharing isn't set up yet."));
      return;
    }

    const contentType = videoType(file);
    const extension =
      (file.name?.match(VIDEO_EXTENSION)?.[1] || contentType.split('/')[1] || 'mp4')
        .toLowerCase();

    const task = uploadBytesResumable(
      storageRef(storage, `chatVideos/${orderKey}/${Date.now()}.${extension}`),
      file,
      { contentType }
    );

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes) {
          onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
        }
      },
      (error) => {
        console.error('Chat video upload failed:', error);
        reject(new Error("Couldn't send the video. Please check your connection and try again."));
      },
      async () => {
        try {
          resolve({
            url: await getDownloadURL(task.snapshot.ref),
            contentType
          });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
