import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Header } from '../components/Header';
import { NavigationBar } from '../components/NavigationBar';
import { Avatar } from '../components/Avatar';
import { LiveMap } from '../components/LiveMap';
import { RepairBill } from '../components/RepairBill';
import { useSecondsLeft } from '../lib/useSecondsLeft';

export const LiveTrackingScreen = () => {
  const {
    activeOrder,
    verifyCompletionOtp,
    submitRating,
    navigateTo,
    setIsChatOpen,
    setChatPartner,
    showToast,
    partnerLocation,
    destinationCoords,
    liveDistanceKm,
    liveEtaMinutes,
    respondToExtraCharge,
    cancelBookingRequest,
    trustFee
  } = useApp();

  const extraCharges = Object.entries(activeOrder.extraCharges || {}).sort(
    ([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0)
  );
  const hasPendingExtraCharges = extraCharges.some(
    ([, charge]) => charge.status === 'PENDING'
  );
  // The job can be completed once the repair photo is in and every extra
  // cost has an answer
  const isReadyToComplete =
    Boolean(activeOrder.repairPhotoUrl) && !hasPendingExtraCharges;

  // Only show an ETA once the partner's device is sharing real GPS
  const liveDistanceLabel = liveDistanceKm != null
    ? `${liveDistanceKm.toFixed(1)} km away`
    : '';
  const liveEtaLabel = liveEtaMinutes != null
    ? `${liveEtaMinutes} mins away${liveDistanceKm != null ? ` (${liveDistanceKm.toFixed(1)} km)` : ''}`
    : null;

  const helperName = activeOrder.helperName || 'Your partner';
  const isPaid = activeOrder.paymentStatus === 'PAID';
  const isWithdrawn = activeOrder.bookingStatus === 'WITHDRAWN';
  const isClosed = ['DECLINED', 'EXPIRED', 'CANCELLED', 'WITHDRAWN'].includes(
    activeOrder.bookingStatus
  );
  const canCancel = activeOrder.bookingStatus === 'PENDING';
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelRequest = async () => {
    if (!window.confirm(`Cancel your request to ${helperName}?`)) return;
    setIsCancelling(true);
    await cancelBookingRequest();
    setIsCancelling(false);
  };

  // Once paid, the last step counts as done too
  const progressStep = activeOrder.currentStep === 5 && isPaid
    ? 6
    : activeOrder.currentStep;

  const pinSecondsLeft = useSecondsLeft(
    activeOrder.currentStep < 4 ? activeOrder.safetyPinExpiresAt : null
  );

  const helperFirstName = (activeOrder.helperName || 'Partner').trim().split(/\s+/)[0];

  const [copied, setCopied] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [completionInput, setCompletionInput] = useState('');

  const handleSubmitRating = () => {
    if (selectedStar === 0) return;
    submitRating(selectedStar, feedbackText.trim());
  };

  const handleVerifyCompletion = async () => {
    if (completionInput.length !== 4) return;
    if (await verifyCompletionOtp(completionInput)) setCompletionInput('');
  };

  const handleCopyPin = () => {
    navigator.clipboard?.writeText(activeOrder.safetyPin);
    setCopied(true);
    showToast(`Safety PIN ${activeOrder.safetyPin} copied to clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  // Times come from the order itself (numbers or ISO strings)
  const formatClock = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  };

  const steps = [
    {
      id: 1,
      title: 'Request Sent',
      time: formatClock(activeOrder.createdAt),
      desc: isWithdrawn
        ? 'You cancelled this request.'
        : isClosed
        ? `${helperName} couldn't take this request.`
        : activeOrder.currentStep <= 1
        ? `Waiting for ${helperName} to accept your request.`
        : `Request sent to ${helperName}.`
    },
    {
      id: 2,
      title: 'Partner Accepted',
      time: formatClock(activeOrder.acceptedAt),
      desc: activeOrder.currentStep >= 2
        ? `${helperName} accepted and locked in your slot.`
        : 'Waiting for acceptance.'
    },
    {
      id: 3,
      title: 'Partner On the Way',
      time: activeOrder.currentStep === 3 ? 'Now' : '',
      desc: liveEtaLabel
        ? `${liveEtaLabel} • Share your arrival code once they reach you`
        : 'Share your arrival code once they reach you.'
    },
    {
      id: 4,
      title: 'Service in Progress',
      time: activeOrder.currentStep === 4 ? 'Now' : '',
      desc: `${activeOrder.serviceTitle || 'Your service'} in progress. Ask for the completion code once done.`
    },
    {
      id: 5,
      title: 'Service Completed',
      time: formatClock(activeOrder.completedAt),
      desc: isPaid
        ? `Paid ₹${activeOrder.totalPaid || activeOrder.totalAmount}. Your bill is in Billing History.`
        : 'Complete the payment to finish the booking.'
    }
  ];

  // No booking yet (or it was cleared): don't show an empty order
  if (!activeOrder.orderId) {
    return (
      <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff]">
        <Header subtitle="Requests" />

        <main className="flex-1 flex flex-col items-center justify-center gap-3 px-6 pb-6 text-center">
          <div className="w-14 h-14 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px]">fact_check</span>
          </div>
          <h1 className="text-base font-extrabold text-[#0b1c30]">No active booking</h1>
          <p className="text-xs text-slate-500">
            Book a helper from Home and you can follow the job here. Past bills are in Profile → Billing History.
          </p>
          <button
            onClick={() => navigateTo('home', 'home')}
            className="mt-1 px-5 py-2.5 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold shadow-md active:scale-95 transition-all"
          >
            Find a helper
          </button>
        </main>

        <NavigationBar />
      </div>
    );
  }

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
                {isWithdrawn
                  ? 'Request cancelled'
                  : isClosed
                  ? 'Request not accepted'
                  : activeOrder.currentStep === 3
                  ? `${helperName} is on the way!`
                  : activeOrder.currentStep === 4
                  ? `${helperName} is working on it`
                  : activeOrder.currentStep === 5
                  ? 'Service Completed!'
                  : `Waiting for ${helperName}`}
              </h1>
              <p className="text-xs text-[#5a4136] mt-0.5 font-medium">
                {isWithdrawn
                  ? 'You cancelled this request. Book again whenever you are ready.'
                  : isClosed
                  ? `${helperName} couldn't take this booking. Please book another helper.`
                  : activeOrder.currentStep === 3
                  ? (liveEtaMinutes != null
                    ? `Estimated arrival in ~${liveEtaMinutes} mins (live GPS)`
                    : 'Share your arrival code when they arrive.')
                  : activeOrder.currentStep === 4
                  ? 'Work in progress. Safe verification active.'
                  : activeOrder.currentStep === 5
                  ? (isPaid
                    ? 'Payment received. Rate your experience!'
                    : 'Complete the payment to finish the booking.')
                  : "Your request has been sent. We'll tell you when they accept."}
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-[#ffdbcc] text-[#7b2f00] rounded-full text-xs font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#ff6a00] animate-ping"></span>
              <span>
                {isWithdrawn
                  ? 'Cancelled'
                  : isClosed
                  ? 'Closed'
                  : activeOrder.currentStep === 3
                  ? 'En Route'
                  : activeOrder.currentStep === 4
                  ? 'In Progress'
                  : activeOrder.currentStep === 5
                  ? (isPaid ? 'Done' : 'Payment due')
                  : 'Requested'}
              </span>
            </div>
          </div>

          {canCancel && (
            <button
              onClick={handleCancelRequest}
              disabled={isCancelling}
              className="self-end flex items-center gap-1 px-4 py-2 rounded-full border border-red-200 bg-white text-red-500 hover:bg-red-50 text-xs font-bold active:scale-95 transition-all disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              {isCancelling ? 'Cancelling…' : 'Cancel request'}
            </button>
          )}

          {/* Extra Parts Cost requested by the partner during the work */}
          {extraCharges.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200 flex flex-col gap-3">

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">build</span>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#0b1c30]">Extra Parts Cost</h3>
                  <p className="text-[11px] text-slate-500">
                    {activeOrder.helperName || 'Your partner'} found parts needed for the job. Approved costs are added to your bill.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {extraCharges.map(([chargeId, charge]) => (
                  <div key={chargeId} className="bg-[#f8f9ff] rounded-xl px-3 py-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0b1c30] truncate">{charge.item}</span>
                      <span className="text-sm font-extrabold text-[#0b1c30] shrink-0">₹{charge.amount}</span>
                    </div>

                    {charge.photoUrl && (
                      <a href={charge.photoUrl} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={charge.photoUrl}
                          alt={charge.item}
                          className="w-full max-h-40 rounded-lg object-cover"
                        />
                      </a>
                    )}

                    {charge.status === 'PENDING' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => respondToExtraCharge(chargeId, false)}
                          className="flex-1 py-2 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 text-xs font-bold active:scale-95 transition-all"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => respondToExtraCharge(chargeId, true)}
                          className="flex-1 py-2 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold active:scale-95 transition-all"
                        >
                          Approve
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          charge.status === 'APPROVED'
                            ? 'bg-[#00ae78]/15 text-[#006c49]'
                            : 'bg-red-50 text-red-500'
                        }`}
                      >
                        {charge.status === 'APPROVED' ? 'Approved • added to bill' : 'Declined'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Finished repair: the partner's photo with the bill so far */}
          {activeOrder.currentStep === 4 && activeOrder.repairPhotoUrl && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#6ffbbe]/40 text-[#006c49] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">photo_camera</span>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#0b1c30]">Repair Finished</h3>
                  <p className="text-[11px] text-slate-500">
                    {`Check the work and the bill. If you're happy, ask ${helperFirstName} for the completion code below.`}
                  </p>
                </div>
              </div>

              <RepairBill order={activeOrder} fallbackTrustFee={trustFee} />

              {hasPendingExtraCharges && (
                <p className="text-[11px] font-medium text-amber-700 text-center">
                  Approve or decline the extra parts cost above first.
                </p>
              )}
            </div>
          )}

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

      <RepairBill order={activeOrder} fallbackTrustFee={trustFee} />

      {hasPendingExtraCharges && (
        <p className="text-[11px] font-medium text-amber-700 text-center">
          Approve or decline the extra parts cost above before paying.
        </p>
      )}

      <button
        onClick={() => navigateTo('payment')}
        disabled={hasPendingExtraCharges}
        className="w-full py-3 rounded-full bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold shadow-md active:scale-95 transition-all"
      >
        Pay Now with Razorpay
      </button>
    </div>
)}

          {/* Rate Your Experience Card (shown once the job is paid for) */}
          {activeOrder.currentStep === 5 && isPaid && (
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
                <Avatar
                  src={activeOrder.helperAvatar}
                  name={activeOrder.helperName}
                  className="w-14 h-14 rounded-2xl"
                  textClassName="text-xl"
                />
                {activeOrder.helperVerified && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#00ae78] text-white flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-[13px]">verified</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h2 className="text-sm font-bold text-[#0b1c30] truncate">
                    {activeOrder.helperName}
                  </h2>
                  {activeOrder.helperRating > 0 && (
                    <div className="flex items-center gap-0.5 bg-[#eff4ff] px-2 py-0.5 rounded-full shrink-0">
                      <span
                        className="material-symbols-outlined text-[13px] text-[#ff6a00]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        star
                      </span>
                      <span className="text-xs font-bold text-[#0b1c30]">
                        {Number(activeOrder.helperRating).toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#5a4136] flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-[14px] text-[#00ae78]">
                    home_repair_service
                  </span>
                  <span>{activeOrder.serviceTitle}</span> <span>partner</span>
                </p>

                {(activeOrder.helperVehicle || activeOrder.helperVehicleNumber) && (
                  <div className="flex items-center gap-1 text-[#5a4136] text-[11px] mt-1 bg-[#eff4ff] px-2 py-0.5 rounded-md self-start font-medium">
                    <span className="material-symbols-outlined text-[13px]">two_wheeler</span>
                    {activeOrder.helperVehicle && (
                      <span className="font-semibold text-[#0b1c30]">{activeOrder.helperVehicle}</span>
                    )}
                    {activeOrder.helperVehicleNumber && (
                      <span>{activeOrder.helperVehicle ? '• ' : ''}{activeOrder.helperVehicleNumber}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons: Call & Chat */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={activeOrder.helperPhone ? `tel:${activeOrder.helperPhone}` : undefined}
                onClick={(event) => {
                  if (!activeOrder.helperPhone) {
                    event.preventDefault();
                    showToast('This partner has not added a phone number. Use In-App Chat instead.');
                  }
                }}
                className="h-10 px-3 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0b1c30] text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[17px] text-[#a14000]">call</span>
                <span>Call</span> <span>{helperFirstName}</span>
              </a>

              <button
                onClick={() => {
                  setChatPartner({
                    name: activeOrder.helperName,
                    avatar: activeOrder.helperAvatar || '',
                    partnerId: activeOrder.partnerId
                  });
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
                    {activeOrder.currentStep < 4 && pinSecondsLeft != null && (
                      <span> · <span>changes in</span> {pinSecondsLeft}s</span>
                    )}
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
                    {!activeOrder.repairPhotoUrl
                      ? `Waiting for ${helperName} to upload a photo of the finished repair.`
                      : hasPendingExtraCharges
                      ? 'Answer the extra parts cost first.'
                      : `Once you're happy with the work, ask ${helperName} for the completion code.`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={completionInput}
                  onChange={(e) => setCompletionInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Enter 4-digit code"
                  inputMode="numeric"
                  disabled={!isReadyToComplete}
                  className="flex-1 min-w-0 disabled:opacity-50 rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 text-sm font-mono tracking-widest text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
                />
                <button
                  onClick={handleVerifyCompletion}
                  disabled={completionInput.length !== 4 || !isReadyToComplete}
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
                      ? `${helperName} • Live GPS`
                      : activeOrder.currentStep < 3
                      ? 'Waiting for the partner to accept'
                      : activeOrder.currentStep === 3
                      ? `${helperName} hasn't shared live location yet`
                      : `${helperName} is at your location`}
                  </span>
                  <span className="text-[10px] text-white/80">{liveDistanceLabel}</span>
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
                <p className="text-[11px] text-slate-500">Live status of your booking</p>
              </div>
              {activeOrder.currentStep === 3 ? (
                <span className="text-[11px] font-bold text-slate-400">Waiting for arrival code…</span>
              ) : activeOrder.currentStep === 4 ? (
                <span className="text-[11px] font-bold text-slate-400">Waiting for completion code…</span>
              ) : activeOrder.currentStep <= 1 && !isClosed ? (
                <span className="text-[11px] font-bold text-slate-400">Waiting for acceptance…</span>
              ) : null}
            </div>

            <div className="relative flex flex-col mt-1">
              {steps.map((step, idx) => {
                const isPassed = progressStep > step.id;
                const isCurrent = progressStep === step.id;
                const isFuture = progressStep < step.id;
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
