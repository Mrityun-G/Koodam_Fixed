import React from 'react';

// The "Verified Partner" tag customers see. Shown only for a partner
// whose Aadhaar, PAN and Voter ID were all uploaded and then approved
// by GigEzee staff (partners.is_verified, set by the admin console).
// One component so it reads the same on every screen.
export const VerifiedTag = ({ size = 'md', className = '' }) => {
  const small = size === 'sm';

  return (
    <span
      title="ID documents checked and approved by GigEzee"
      className={`inline-flex items-center gap-0.5 shrink-0 rounded-full bg-[#FFC928] text-[#101F55] shadow-sm shadow-[#FFC928]/40 font-bold leading-none ${
        small ? 'pl-1 pr-1.5 py-0.5 text-[9px]' : 'pl-1.5 pr-2 py-1 text-[10px]'
      } ${className}`}
    >
      <span
        className={`material-symbols-outlined ${small ? 'text-[12px]' : 'text-[13px]'}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
        aria-hidden="true"
      >
        verified
      </span>
      Verified Partner
    </span>
  );
};
