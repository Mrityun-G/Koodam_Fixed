import React from 'react';
import { SubHeader } from '../components/SubHeader';

const sections = [
  {
    title: 'Terms of Service',
    points: [
      'KOODAM connects residents with verified local service partners for household help. We are a booking platform, not the employer of any service partner.',
      'Bookings, once confirmed, form a direct agreement between the member and the service partner. Pricing shown at booking time is final unless additional work is agreed upon on-site.',
      'The Safety PIN system exists to confirm identity at arrival. Do not share it before the helper physically arrives at your location.',
      'Ratings and reviews must reflect genuine experiences. Misuse of the rating system may result in account restrictions.'
    ]
  },
  {
    title: 'Privacy Policy',
    points: [
      'We collect only the information needed to facilitate bookings: name, contact details, location and service history.',
      'Your phone number and address are shared with a service partner only after a booking is confirmed.',
      'We do not sell personal data to third parties. Data may be used internally to improve safety, matching and support.',
      'You may request an update or deletion of your profile data at any time from the Edit Profile screen.'
    ]
  },
  {
    title: 'Cancellations & Refunds',
    points: [
      'Bookings may be cancelled before a service partner arrives via in-app chat or call.',
      'The trust fee is non-refundable once a service partner has been assigned to your request.',
      'Disputes over completed work can be raised through in-app chat with your service partner.'
    ]
  }
];

export const TermsScreen = () => {
  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <SubHeader title="Terms & Policy" />

      <main className="flex-1 flex flex-col relative w-full pb-10 px-4 space-y-3.5 pt-4">
        <p className="text-[11px] text-slate-400">Last updated: September 2026</p>

        {sections.map((section, idx) => (
          <section key={idx} className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100">
            <h2 className="text-sm font-bold text-[#0b1c30] mb-2">{section.title}</h2>
            <ul className="space-y-2">
              {section.points.map((point, i) => (
                <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                  <span className="text-[#ff6a00] shrink-0">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
};
