import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export const PaymentScreen = () => {
  const {
    selectedHelper,
    selectedService,
    trustFee,
    selectedDate,
    selectedTime,
    handleConfirmBooking,
    navigateTo,
    activeOrder,
    markPaymentCompleted,
    showToast
  } = useApp();

  const [processing, setProcessing] = useState(false);

  const isServicePayment =
    activeOrder?.currentStep === 5 &&
    activeOrder?.paymentStatus !== 'PAID';

  const totalAmount = isServicePayment
    ? Number(activeOrder?.totalAmount || 0)
    : Number(selectedService?.price || 0) +
      Number(trustFee || 0);

  const loadRazorpay = () =>
    new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';

      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);

      document.body.appendChild(script);
    });

  const handleRazorpayPayment = async () => {
    if (!totalAmount) {
      showToast('Invalid payment amount.');
      return;
    }

    const razorpayKey =
      import.meta.env.VITE_RAZORPAY_KEY_ID;

    if (!razorpayKey) {
      showToast(
        'Razorpay key is missing. Add VITE_RAZORPAY_KEY_ID to .env'
      );
      return;
    }

    setProcessing(true);

    try {
      const loaded = await loadRazorpay();

      if (!loaded) {
        showToast('Unable to load Razorpay.');
        setProcessing(false);
        return;
      }

      const options = {
        key: razorpayKey,

        amount: Math.round(totalAmount * 100),

        currency: 'INR',

        name: 'KOODAM',

        description: isServicePayment
          ? `Payment for ${activeOrder.serviceTitle}`
          : `${selectedService.title}`,

        handler: async (response) => {
          if (isServicePayment) {
            markPaymentCompleted(response);
            navigateTo('tracking', 'requests');
          }
        },

        prefill: {
          name:
            activeOrder?.customerName ||
            'KOODAM Customer'
        },

        theme: {
          color: '#ff6a00'
        },

        modal: {
          ondismiss: () => {
            setProcessing(false);
          }
        }
      };

      const razorpay =
        new window.Razorpay(options);

      razorpay.on(
        'payment.failed',
        () => {
          showToast(
            'Payment failed. Please try again.'
          );
          setProcessing(false);
        }
      );

      razorpay.open();
    } catch (error) {
      console.error(
        'Razorpay error:',
        error
      );

      showToast(
        'Unable to start Razorpay payment.'
      );

      setProcessing(false);
    }
  };

  /* =========================
     POST-SERVICE PAYMENT
     ========================= */

  if (isServicePayment) {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-[#f8f9ff]">

        <header className="flex h-16 items-center gap-2 border-b border-slate-100 bg-white px-4">

          <button
            type="button"
            aria-label="Go back"
            onClick={() =>
              navigateTo('tracking', 'requests')
            }
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0b1c30] hover:bg-[#eff4ff]"
          >
            <span className="material-symbols-outlined">
              arrow_back
            </span>
          </button>

          <div>
            <p className="text-sm font-bold text-[#0b1c30]">
              Secure Payment
            </p>

            <p className="text-[11px] text-slate-500">
              Complete payment to finish your service
            </p>
          </div>

        </header>

        <main className="flex flex-1 flex-col gap-4 p-4">

          <div className="rounded-3xl bg-[#0b1c30] p-5 text-white">

            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6ffbbe]">
              Service Completed
            </span>

            <h1 className="mt-2 text-3xl font-extrabold">
              ₹{totalAmount}
            </h1>

            <p className="mt-1 text-xs text-slate-300">
              {activeOrder.serviceTitle}
            </p>

          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Partner
              </span>

              <span className="font-bold text-[#0b1c30]">
                {activeOrder.helperName}
              </span>
            </div>

            <div className="my-3 border-t border-slate-100" />

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Service Amount
              </span>

              <span className="font-bold text-[#0b1c30]">
                ₹{totalAmount}
              </span>
            </div>

            <div className="my-3 border-t border-slate-100" />

            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#0b1c30]">
                Total
              </span>

              <span className="text-xl font-extrabold text-[#a14000]">
                ₹{totalAmount}
              </span>
            </div>

          </div>

          <div className="rounded-2xl border border-[#6ffbbe]/50 bg-[#eafff4] p-4 text-xs text-[#006c49]">

            <span className="material-symbols-outlined mr-1 align-middle text-[16px]">
              verified_user
            </span>

            Secure payment powered by Razorpay.
          </div>

        </main>

        <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 p-4 backdrop-blur-xl">

          <button
            type="button"
            disabled={processing}
            onClick={handleRazorpayPayment}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ff6a00] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ff6a00]/30 disabled:opacity-60"
          >

            <span className="material-symbols-outlined text-[18px]">
              payments
            </span>

            {processing
              ? 'Opening Razorpay...'
              : `Pay ₹${totalAmount} with Razorpay`}

          </button>

        </div>

      </div>
    );
  }

  /* =========================
     EXISTING BOOKING PAYMENT
     ========================= */

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#f8f9ff]">

      <header className="flex h-16 items-center gap-2 border-b border-slate-100 bg-white px-4">

        <button
          type="button"
          aria-label="Go back"
          onClick={() =>
            navigateTo('booking')
          }
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#0b1c30] hover:bg-[#eff4ff]"
        >
          <span className="material-symbols-outlined">
            arrow_back
          </span>
        </button>

        <div>
          <p className="text-sm font-bold text-[#0b1c30]">
            Secure payment
          </p>

          <p className="text-[11px] text-slate-500">
            Final review before dispatch
          </p>
        </div>

      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">

        <div className="rounded-3xl bg-[#0b1c30] p-5 text-white">

          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6ffbbe]">
            Ready to dispatch
          </span>

          <h1 className="mt-2 text-2xl font-extrabold">
            ₹{totalAmount}
          </h1>

          <p className="mt-1 text-xs text-slate-300">
            {selectedService.title} with {selectedHelper.name}
          </p>

        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              When
            </span>

            <span className="font-bold text-[#0b1c30]">
              {selectedDate}, {selectedTime}
            </span>
          </div>

          <div className="my-3 border-t border-slate-100" />

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Service
            </span>

            <span className="font-bold text-[#0b1c30]">
              ₹{selectedService.price}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Trust Shield
            </span>

            <span className="font-bold text-[#0b1c30]">
              ₹{trustFee}
            </span>
          </div>

        </div>

        <div className="rounded-2xl border border-[#6ffbbe]/50 bg-[#eafff4] p-4 text-xs text-[#006c49]">
          <span className="material-symbols-outlined mr-1 align-middle text-[16px]">
            lock
          </span>
          Booking payment flow remains unchanged.
        </div>

      </main>

      <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 p-4 backdrop-blur-xl">

        <button
          type="button"
          onClick={handleConfirmBooking}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ff6a00] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ff6a00]/30"
        >
          <span className="material-symbols-outlined text-[18px]">
            verified
          </span>

          Confirm request and continue
        </button>

      </div>

    </div>
  );
};