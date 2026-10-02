import React, { useEffect, useState } from 'react';

// Background colours for initials; a name always gets the same one
const INITIAL_COLOURS = [
  'bg-[#2e7d32]',
  'bg-[#1b2a5e]',
  'bg-[#a14000]',
  'bg-[#006c49]',
  'bg-[#4e5c92]',
  'bg-[#7b2f00]'
];

const colourFor = (name) => {
  const text = String(name || '');
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) sum += text.charCodeAt(i);
  return INITIAL_COLOURS[sum % INITIAL_COLOURS.length];
};

/**
 * A person's photo, or their initial when there's no photo or it fails
 * to load. Photos are requested without a referrer: Google profile
 * photos (lh3.googleusercontent.com) are often refused when another
 * site embeds them with one.
 *
 * className sets the size and shape (e.g. "w-14 h-14 rounded-2xl");
 * textClassName sizes the initial.
 */
export const Avatar = ({
  src,
  name,
  className = 'w-10 h-10 rounded-full',
  textClassName = 'text-base'
}) => {
  // The KOODAM logo was used as a stand-in photo; treat it as no photo
  const photo = src && src !== '/logo.svg' ? src : null;
  const [failed, setFailed] = useState(false);

  // A different photo gets a fresh chance to load
  useEffect(() => setFailed(false), [photo]);

  if (photo && !failed) {
    return (
      <img
        className={`${className} object-cover shadow-xs`}
        alt={name || 'Profile photo'}
        src={photo}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      aria-label={name || 'Profile'}
      className={`${className} ${colourFor(name)} text-white font-bold flex items-center justify-center shadow-xs ${textClassName}`}
    >
      {(String(name || 'K').trim().charAt(0) || 'K').toUpperCase()}
    </div>
  );
};
