import React, { useState } from 'react';
import { SubHeader } from '../components/SubHeader';

const faqs = [
  {
    q: 'How do I book a helper?',
    a: 'From the Home screen, browse verified helpers nearby and tap "Quick Book" on any card. Pick a service, date and time, then confirm — your request is sent instantly.'
  },
  {
    q: 'What is the Safety PIN for?',
    a: 'Each booking generates a 4-digit Safety PIN. Share it with your helper only after they arrive, to confirm you are handing over access to the verified person.'
  },
  {
    q: 'How do I cancel or reschedule a booking?',
    a: 'Open the Requests tab to view your active booking, then use the in-app chat or call button to coordinate changes directly with your helper.'
  },
  {
    q: 'How does payment work?',
    a: 'Pricing is shown upfront on the booking screen, including a small trust fee. You can pay via UPI or cash directly with your helper once the job is done.'
  },
  {
    q: 'How do I rate a helper after service?',
    a: 'Once your service is marked "Completed & Verified" on the Live Tracking screen, a rating card appears where you can give 1-5 stars and an optional comment.'
  },
  {
    q: 'How do I become a Service Partner?',
    a: 'Go to your Profile and tap "Switch to Service Partner" to access the Partner Dashboard, where you can go online and start receiving nearby job requests.'
  },
  {
    q: 'Is my personal information safe?',
    a: 'Yes. We only share the details needed to complete a booking. See our Terms & Policy page for the full privacy policy.'
  }
];

export const FAQScreen = () => {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <SubHeader title="FAQ" />

      <main className="flex-1 flex flex-col relative w-full pb-10 px-4 space-y-2 pt-4">
        {faqs.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div key={idx} className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
              <button
                onClick={() => setOpenIndex(isOpen ? -1 : idx)}
                className="w-full flex items-center justify-between gap-3 p-3.5 text-left"
              >
                <span className="text-sm font-bold text-[#0b1c30]">{item.q}</span>
                <span
                  className={`material-symbols-outlined text-[18px] text-[#a14000] shrink-0 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                >
                  expand_more
                </span>
              </button>
              {isOpen && (
                <p className="px-3.5 pb-3.5 text-xs text-slate-600 leading-relaxed">{item.a}</p>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
};
