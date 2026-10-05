import React from 'react';
import { useApp } from '../context/AppContext';

// What happens on a phone booking, in the order the customer hears it
// (used until the steps stored by KOODAM staff load)
const DEFAULT_STEPS = [
  { icon: 'translate', title: 'Call and choose your language', desc: 'Tamil, Kannada or English. Your phone number is your account.' },
  { icon: 'handyman', title: 'Pick a service and enter your pincode', desc: 'Press the number for the service, then type your 6-digit area pincode.' },
  { icon: 'verified_user', title: 'Hear the price and confirm', desc: 'We find the nearest serviceman. Note down the 4-digit safety code we read out.' },
  { icon: 'call', title: 'The serviceman calls you', desc: 'They call for your address. Give them the safety code only when they reach your home.' },
  { icon: 'build', title: 'Extra parts need your approval', desc: 'If they need a part, call the same number to approve or decline it.' },
  { icon: 'payments', title: 'Pay cash after the work', desc: 'Pay the serviceman the total you heard. Call again to rate them or report a problem.' }
];

/**
 * Offline mode: customers without a smartphone or internet book by
 * calling KOODAM. Servicemen keep using the app as usual.
 */
export const OfflineModeScreen = () => {
  const { navigateTo, phoneBookingNumber, appContent } = useApp();
  const steps = appContent.offline_steps?.length ? appContent.offline_steps : DEFAULT_STEPS;

  return (
    <div className="flex-1 flex flex-col w-full bg-[#f8f9ff] min-h-screen">
      <header className="flex h-16 items-center gap-2 border-b border-slate-100 bg-white px-4 shrink-0">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigateTo('landing')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#0b1c30] hover:bg-[#eff4ff]"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>

        <div>
          <p className="text-sm font-bold text-[#0b1c30]">Offline mode</p>
          <p className="text-[11px] text-slate-500">For customers without a smartphone</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-4 p-4 pb-8">
        <div className="rounded-3xl bg-[#0b1c30] p-5 text-white flex flex-col gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6ffbbe]">
            Book by phone call
          </span>

          <h1 className="text-xl font-extrabold leading-tight">
            No smartphone or internet? Call KOODAM from any phone.
          </h1>

          {phoneBookingNumber ? (
            <a
              href={`tel:${phoneBookingNumber.replace(/\s/g, '')}`}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#ff6a00] hover:bg-[#a14000] py-3.5 text-base font-extrabold active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">call</span>
              <span data-no-translate>{phoneBookingNumber}</span>
            </a>
          ) : (
            <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-center">
              Phone booking number coming soon
            </p>
          )}

          <p className="text-[11px] text-slate-300">
            Works on basic keypad phones. You pay in cash after the work. No app or sign-up needed.
          </p>
        </div>

        <section className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col gap-3.5">
          <h2 className="text-sm font-extrabold text-[#0b1c30]">How it works</h2>

          {steps.map((step, index) => (
            <div key={step.title} className="flex items-start gap-3">
              <div className="relative w-9 h-9 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">{step.icon}</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0b1c30] text-white text-[9px] font-bold flex items-center justify-center">
                  {index + 1}
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold text-[#0b1c30]">{step.title}</p>
                <p className="text-[11px] text-slate-500">{step.desc}</p>
              </div>
            </div>
          ))}
        </section>

        <div className="rounded-2xl border border-[#6ffbbe]/50 bg-[#eafff4] p-4 text-[11px] text-[#006c49] flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] shrink-0">info</span>
          <span>
            Offline mode is for customers only. Servicemen receive phone bookings in the KOODAM app like any other job.
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigateTo('welcome')}
          className="w-full py-3 rounded-full border border-slate-200 bg-white text-sm font-bold text-[#0b1c30] active:scale-95 transition-all"
        >
          Have a smartphone? Use the app
        </button>
      </main>
    </div>
  );
};
