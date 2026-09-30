import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Header } from '../components/Header';
import { NavigationBar } from '../components/NavigationBar';
import { LiveMap } from '../components/LiveMap';

export const LiveTrackingScreen = () => {
  const {
    activeOrder,
    advanceOrderStatus,
    verifyCompletionOtp,
    submitRating,
    navigateTo,
    setIsChatOpen,
    setChatPartner,
    showToast,
    partnerLocation,
    destinationCoords,
    liveDistanceKm,
    liveEtaMinutes
  } = useApp();

  // Fall back to the simulated ETA until the partner's real device starts sharing GPS
  const displayEtaMinutes = liveEtaMinutes ?? activeOrder.etaMinutes;
  const displayDistanceLabel = liveDistanceKm != null
    ? `${liveDistanceKm.toFixed(1)} km away`
    : activeOrder.currentRoad;

  const [copied, setCopied] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [completionInput, setCompletionInput] = useState('');

  const handleSubmitRating = () => {
    if (selectedStar === 0) return;
    submitRating(selectedStar, feedbackText.trim());
  };

  const handleVerifyCompletion = () => {
    if (completionInput.length !== 4) return;
    if (verifyCompletionOtp(completionInput)) setCompletionInput('');
  };

  const handleCopyPin = () => {
    navigator.clipboard?.writeText(activeOrder.safetyPin);
    setCopied(true);
    showToast(`Safety PIN ${activeOrder.safetyPin} copied to clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    {
      id: 1,
      title: 'Booking Confirmed',
      time: '10:15 AM',
      desc: 'Request accepted automatically by Indiranagar Hub.'
    },
    {
      id: 2,
      title: 'Helper Assigned',
      time: '10:18 AM',
      desc: `${activeOrder.helperName} (4.9★) locked in your slot.`
    },
    {
      id: 3,
      title: 'Helper En Route',
      time: 'Now',
      desc: activeOrder.currentStep === 3
        ? `${displayEtaMinutes} mins away${liveDistanceKm != null ? ` (${liveDistanceKm.toFixed(1)} km)` : ''} • Share your arrival code once they reach you`
        : `${displayEtaMinutes} mins away${liveDistanceKm != null ? ` (${liveDistanceKm.toFixed(1)} km)` : ''} • ${partnerLocation ? 'Live GPS' : 'Smooth traffic on 100 Feet Rd'}`
    },
    {
      id: 4,
      title: 'Service in Progress',
      time: 'Pending',
      desc: 'Diagnostics and circuit switchboard check. Enter the completion code once done.'
    },
    {
      id: 5,
      title: 'Service Completed & Verified',
      time: 'Pending',
      desc: 'Digital invoice generated and warranty active.'
    }
  ];

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff]">
      <Header subtitle="Requests" />

      <main className="flex-1 flex flex-col relative w-full pb-6">
        <div className="px-4 pt-3 pb-6 flex flex-col gap-3.5">
          {/* Top Status Banner */}
          <div className="bg-[#eff4ff] rounded-2xl p-4 shadow-xs flex items-start justify-between gap-3 relative overflow-hidden border border-slate-100">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-[#ffdbcc]/40 rounded-full blur-xl pointer-events-none"></div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] text-[#a14000] font-extrabold uppercase tracking-wider">
                  Order Reference
                </span>
                <span className="text-[10px] text-slate-400">•</span>
                <span className="text-xs text-[#0b1c30] font-bold">{activeOrder.orderId}</span>
              </div>
              <h1 className="text-xl font-extrabold text-[#0b1c30] tracking-tight">
                {activeOrder.currentStep === 3
                  ? `${activeOrder.helperName} is on the way!`
                  : activeOrder.currentStep === 4
                  ? `${activeOrder.helperName} is repairing now`
                  : activeOrder.currentStep === 5
                  ? 'Service Completed & Verified!'
                  : 'Order Processing'}
              </h1>
              <p className="text-xs text-[#5a4136] mt-0.5 font-medium">
                {activeOrder.currentStep === 3
                  ? `Estimated arrival in ~${displayEtaMinutes} mins${partnerLocation ? ' (live GPS)' : ''}`
                  : activeOrder.currentStep === 4
                  ? 'Work in progress. Safe verification active.'
                  : activeOrder.currentStep === 5
                  ? 'Payment completed via UPI. Rate your experience!'
                  : 'Matching nearest verified technician.'}
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-[#ffdbcc] text-[#7b2f00] rounded-full text-xs font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#ff6a00] animate-ping"></span>
              <span>
                {activeOrder.currentStep === 3
                  ? 'En Route'
                  : activeOrder.currentStep === 4
                  ? 'In Progress'
                  : activeOrder.currentStep === 5
                  ? 'Done'
                  : 'Confirmed'}
              </span>
            </div>
          </div>

          {/* Payment Required After Completion */}
{activeOrder.currentStep === 5 &&
  activeOrder.paymentStatus !== 'PAID' && (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#ff6a00]/30 flex flex-col gap-3">

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">
          <span className="material-symbols-outlined">
            payments
          </span>
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-bold text-[#0b1c30]">
            Service Completed
          </h3>

          <p className="text-[11px] text-slate-500">
            Completion code verified. Complete payment to finish the booking.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between bg-[#eff4ff] rounded-xl px-4 py-3">
        <span className="text-xs font-medium text-slate-500">
          Amount to Pay
        </span>

        <span className="text-lg font-extrabold text-[#0b1c30]">
          ₹{activeOrder.totalAmount || 0}
        </span>
      </div>

      <button
        onClick={() => navigateTo('payment')}
        className="w-full py-3 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-sm font-bold shadow-md active:scale-95 transition-all"
      >
        Pay Now with Razorpay
      </button>
    </div>
)}

          {/* Rate Your Experience Card (shown once service is completed) */}
          {activeOrder.currentStep === 5 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
              {activeOrder.rating ? (
                <div className="flex flex-col items-center text-center gap-1 py-2">
                  <div className="w-11 h-11 rounded-full bg-[#00ae78]/15 text-[#006c49] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[22px]">task_alt</span>
                  </div>
                  <h3 className="text-sm font-bold text-[#0b1c30]">Thanks for rating {activeOrder.helperName}!</h3>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <span
                        key={i}
                        className={`material-symbols-outlined text-[20px] ${
                          i <= activeOrder.rating ? 'text-[#ff6a00]' : 'text-slate-200'
                        }`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        star
                      </span>
                    ))}
                  </div>
                  {activeOrder.feedback && (
                    <p className="text-xs text-slate-500 mt-1">"{activeOrder.feedback}"</p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-bold text-[#0b1c30]">Rate your experience</h3>
                    <p className="text-[11px] text-slate-500">
                      How was the service by {activeOrder.helperName}?
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-1.5 py-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <button
                        key={i}
                        aria-label={`Rate ${i} star${i > 1 ? 's' : ''}`}
                        onClick={() => setSelectedStar(i)}
                        onMouseEnter={() => setHoverStar(i)}
                        onMouseLeave={() => setHoverStar(0)}
                        className="active:scale-90 transition-transform"
                      >
                        <span
                          className={`material-symbols-outlined text-[32px] ${
                            i <= (hoverStar || selectedStar) ? 'text-[#ff6a00]' : 'text-slate-200'
                          }`}
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Add a comment (optional)"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-[#f8f9ff] p-2.5 text-xs text-[#0b1c30] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
                  />

                  <button
                    onClick={handleSubmitRating}
                    disabled={selectedStar === 0}
                    className="w-full py-2.5 rounded-full bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold active:scale-95 transition-all shadow-md"
                  >
                    Submit Rating
                  </button>
                </>
              )}
            </div>
          )}

          {/* Live Helper Card with Safety PIN */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3 relative overflow-hidden border border-slate-100">
            {/* Profile row */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <img
                  className="w-14 h-14 rounded-2xl object-cover shadow-xs"
                  alt={activeOrder.helperName}
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJFP-hU-FEvoiJVzKzRp5W3wJOlmXvEIgsYb8I9Nmnf3XEq3dbTrQZ-NUDt5Cae6rToq_UsMM47w7oI4k31EWKotizKHaHa6paxpDCLq86tWj_0lR9U4DWJo4S5marrKLXymEKlXE1p9hioIBsUxdzwrwiQoNPjVq1YSg_qmiN58moH7YnlnV0w1FiNYrNcQzllBVwnvN640h9SbhbmRFpTLl6OBH6OWKG_RLEd2Z_WyLrjXVY5faO4w"
                />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#00ae78] text-white flex items-center justify-center shadow-xs">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                </div>
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h2 className="text-sm font-bold text-[#0b1c30] truncate">
                    {activeOrder.helperName}
                  </h2>
                  <div className="flex items-center gap-0.5 bg-[#eff4ff] px-2 py-0.5 rounded-full shrink-0">
                    <span
                      className="material-symbols-outlined text-[13px] text-[#ff6a00]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                    <span className="text-xs font-bold text-[#0b1c30]">4.92</span>
                  </div>
                </div>

                <p className="text-xs text-[#5a4136] flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-[14px] text-[#00ae78]">
                    electric_bolt
                  </span>
                  Certified Senior Electrician
                </p>

                <div className="flex items-center gap-1 text-[#5a4136] text-[11px] mt-1 bg-[#eff4ff] px-2 py-0.5 rounded-md self-start font-medium">
                  <span className="material-symbols-outlined text-[13px]">two_wheeler</span>
                  <span className="font-semibold text-[#0b1c30]">TVS Jupiter</span>
                  <span>• KA-03-HM-4122</span>
                </div>
              </div>
            </div>

            {/* Action Buttons: Call & Chat */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href="tel:+919876543210"
                className="h-10 px-3 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[17px] text-[#a14000]">call</span>
                <span>Call Arun</span>
              </a>

              <button
                onClick={() => {
                  setChatPartner(activeOrder.helperName);
                  setIsChatOpen(true);
                }}
                className="h-10 px-3 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[17px]">chat_bubble</span>
                <span>In-App Chat</span>
              </button>
            </div>

            {/* Verification PIN Box */}
            <div className="bg-[#dce9ff]/70 rounded-2xl p-3 flex items-center justify-between gap-2 border border-slate-200/60">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    {activeOrder.currentStep >= 4 ? 'verified' : 'lock'}
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Arrival Safety Code
                  </span>
                  <span className="text-xs text-[#0b1c30] font-medium truncate">
                    {activeOrder.currentStep >= 4 ? 'Verified — work has started' : 'Share only upon arrival'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-xl shadow-xs border border-slate-100">
                <span className="text-base tracking-widest text-[#a14000] font-extrabold font-mono">
                  {activeOrder.safetyPin}
                </span>
                <button
                  onClick={handleCopyPin}
                  className="ml-1 text-slate-400 hover:text-[#a14000] flex items-center p-0.5"
                  title="Copy code"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copied ? 'done' : 'content_copy'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Completion Verification Card — shown once the partner has started work */}
          {activeOrder.currentStep === 4 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-[#6ffbbe]/40 text-[#006c49] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">task_alt</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#0b1c30]">Confirm Job Completion</h3>
                  <p className="text-[11px] text-slate-500">
                    Once you're happy with the work, ask {activeOrder.helperName} for the completion code.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={completionInput}
                  onChange={(e) => setCompletionInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Enter 4-digit code"
                  inputMode="numeric"
                  className="flex-1 rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 text-sm font-mono tracking-widest text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
                />
                <button
                  onClick={handleVerifyCompletion}
                  disabled={completionInput.length !== 4}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold active:scale-95 transition-all"
                >
                  Verify & Pay
                </button>
              </div>
            </div>
          )}

          {/* Live GPS Map Card */}
          <div className="relative w-full h-36 rounded-2xl overflow-hidden shadow-xs flex flex-col justify-end p-3 border border-slate-200">
            <LiveMap partnerLocation={partnerLocation} destination={destinationCoords} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1c30]/90 via-[#0b1c30]/10 to-transparent pointer-events-none"></div>

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <div className="w-7 h-7 rounded-full bg-[#ff6a00] text-white flex items-center justify-center shadow-md animate-bounce">
                  <span className="material-symbols-outlined text-[16px]">near_me</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">
                    {partnerLocation
                      ? `${activeOrder.helperName} • Live GPS`
                      : `${activeOrder.helperName} is at ${activeOrder.currentRoad?.split(' (')[0] || 'en route'}`}
                  </span>
                  <span className="text-[10px] text-white/80">{displayDistanceLabel}</span>
                </div>
              </div>

              <button
                onClick={() => showToast(partnerLocation ? 'Zoomed into live GPS map' : 'Waiting for partner to start sharing live GPS')}
                className="px-3 py-1 rounded-full bg-white text-[#a14000] text-xs font-bold shadow-md hover:bg-slate-100 transition-colors flex items-center gap-1 active:scale-95"
              >
                <span>Zoom Map</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            </div>
          </div>

          {/* Interactive Status Stepper */}
          <div className="bg-white rounded-2xl p-4 shadow-xs flex flex-col gap-3 border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0b1c30]">Timeline Progress</h3>
                <p className="text-[11px] text-slate-500">Tap to simulate real-time stage advance</p>
              </div>
              {activeOrder.currentStep === 3 ? (
                <span className="text-[11px] font-bold text-slate-400">Waiting for arrival code…</span>
              ) : activeOrder.currentStep === 4 ? (
                <span className="text-[11px] font-bold text-slate-400">Waiting for completion code…</span>
              ) : (
                <button
                  onClick={advanceOrderStatus}
                  className="text-[11px] font-bold bg-[#eff4ff] text-[#a14000] hover:bg-[#dce9ff] px-2.5 py-1 rounded-full border border-slate-200 active:scale-95 transition-all"
                >
                  Simulate Next Step ▶
                </button>
              )}
            </div>

            <div className="relative flex flex-col mt-1">
              {steps.map((step, idx) => {
                const isPassed = activeOrder.currentStep > step.id;
                const isCurrent = activeOrder.currentStep === step.id;
                const isFuture = activeOrder.currentStep < step.id;
                const isLast = idx === steps.length - 1;

                return (
                  <div key={step.id} className={`flex gap-3 relative ${!isLast ? 'pb-5' : ''}`}>
                    {/* Connecting line */}
                    {!isLast && (
                      <div
                        className={`absolute top-6 left-3.5 -bottom-0 w-0.5 ${
                          isPassed ? 'bg-[#00ae78]' : isCurrent ? 'bg-[#ff6a00]' : 'bg-slate-200'
                        }`}
                      ></div>
                    )}

                    {/* Node circle */}
                    <div className="relative w-7 h-7 shrink-0 z-10 flex items-center justify-center">
                      {isCurrent && (
                        <span className="absolute inset-0 rounded-full bg-[#ff6a00] opacity-40 animate-ping"></span>
                      )}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shadow-xs text-xs font-bold ${
                          isPassed
                            ? 'bg-[#00ae78] text-white'
                            : isCurrent
                            ? 'bg-[#ff6a00] text-white'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {isPassed ? (
                          <span className="material-symbols-outlined text-[15px]">check</span>
                        ) : isCurrent ? (
                          <span className="material-symbols-outlined text-[15px]">navigation</span>
                        ) : (
                          <span>{step.id}</span>
                        )}
                      </div>
                    </div>

                    {/* Step details */}
                    <div
                      className={`flex flex-col min-w-0 flex-1 pt-0.5 rounded-xl p-2 transition-all ${
                        isCurrent ? 'bg-[#eff4ff] border border-[#dce9ff]' : ''
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`text-xs font-bold ${
                            isCurrent
                              ? 'text-[#a14000]'
                              : isPassed
                              ? 'text-[#0b1c30]'
                              : 'text-slate-400'
                          }`}
                        >
                          {step.title}
                        </span>
                        <span
                          className={`text-[10px] font-semibold ${
                            isCurrent ? 'text-[#ff6a00]' : 'text-slate-400'
                          }`}
                        >
                          {step.time}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] mt-0.5 ${
                          isFuture ? 'text-slate-400' : 'text-[#5a4136]'
                        }`}
                      >
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <NavigationBar />
    </div>
  );
};
