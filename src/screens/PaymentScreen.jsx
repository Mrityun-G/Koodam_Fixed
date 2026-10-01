import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

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
    showToast,
    userProfile
  } = useApp();

  // idle → opening (creating the order) → confirming (checking the payment)
  const [status, setStatus] = useState('idle');
  const processing = status !== 'idle';

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

  // Calls the backend and turns its error into a message for the customer
  const postToBackend = async (path, body) => {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.detail || `Payment server error (${response.status})`
      );
    }

    return data;
  };

  // Only marks the job paid once the backend has confirmed the payment
  // with Razorpay
  const confirmPayment = async (response) => {
    setStatus('confirming');

    try {
      await postToBackend('/payments/verify', {
        firebase_order_id: String(activeOrder.orderId),
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature
      });

      markPaymentCompleted(response);
      navigateTo('tracking', 'requests');
    } catch (error) {
      console.error('Payment verification failed:', error);

      showToast(
        `We couldn't confirm your payment: ${error.message} If money was taken, it will be refunded automatically.`
      );
    } finally {
      setStatus('idle');
    }
  };

  const handleRazorpayPayment = async () => {
    if (!totalAmount || !activeOrder?.orderId) {
      showToast('Invalid payment amount.');
      return;
    }

    setStatus('opening');

    try {
      const loaded = await loadRazorpay();

      if (!loaded) {
        showToast('Unable to load Razorpay.');
        setStatus('idle');
        return;
      }

      // The backend creates the order from its own copy of the bill
      const order = await postToBackend('/payments/create-order', {
        firebase_order_id: String(activeOrder.orderId),
        amount: totalAmount
      });

      const options = {
        key: order.key_id,

        order_id: order.razorpay_order_id,

        amount: order.amount,

        currency: order.currency,

        name: 'KOODAM',

        description: `Payment for ${activeOrder.serviceTitle}`,

        handler: confirmPayment,

        // Saves the customer typing details Razorpay would otherwise ask for
        prefill: {
          name:
            activeOrder?.customerName ||
            userProfile?.name ||
            'KOODAM Customer',
          ...(userProfile?.email ? { email: userProfile.email } : {}),
          ...(userProfile?.phone ? { contact: userProfile.phone } : {})
        },

        theme: {
          color: '#ff6a00'
        },

        modal: {
          ondismiss: () => {
            setStatus((current) =>
              current === 'confirming' ? current : 'idle'
            );
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
          setStatus('idle');
        }
      );

      razorpay.open();
    } catch (error) {
      console.error(
        'Razorpay error:',
        error
      );

      showToast(
        error?.message || 'Unable to start Razorpay payment.'
      );

      setStatus('idle');
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

            {status === 'confirming'
              ? 'Confirming payment...'
              : status === 'opening'
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