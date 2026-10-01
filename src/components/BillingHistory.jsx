import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2
  })}`;

const formatDate = (iso, withTime = false) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {})
      })
    : '';

// Paid, waiting for payment, or work not finished yet
const getBillStatus = (bill) => {
  if (bill.payment_status === 'PAID') {
    return { label: 'Paid', icon: 'check_circle', tone: 'bg-[#c8f7e1] text-[#006c49]' };
  }

  if (bill.status === 'COMPLETED') {
    return { label: 'Payment pending', icon: 'schedule', tone: 'bg-amber-100 text-amber-700' };
  }

  return { label: 'Work in progress', icon: 'construction', tone: 'bg-[#dce1ff] text-[#4e5c92]' };
};

const EXTRA_STATUS_LABELS = {
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  PENDING: 'Awaiting approval'
};

// The customer's bills, newest first. Pass partnerId to show only the work
// one partner did. onBillsLoaded receives the bills (for totals).
export const BillingHistory = ({ partnerId = null, onBillsLoaded }) => {
  const { userProfile, authUser } = useApp();

  const customerId = userProfile?.id || authUser?.uid;

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openBillId, setOpenBillId] = useState(null);

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const query = partnerId
      ? `?partner_id=${encodeURIComponent(partnerId)}`
      : '';

    setLoading(true);
    setError('');

    fetch(`${BACKEND_URL}/bookings/billing/${encodeURIComponent(customerId)}${query}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Billing request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setBills(data);
        setOpenBillId(data[0]?.booking_id || null);
        onBillsLoaded?.(data);
      })
      .catch((fetchError) => {
        console.error('Failed to load billing history:', fetchError);
        if (!cancelled) {
          setError("Couldn't load your bills. Check your connection and try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // onBillsLoaded is a callback for the parent, not an input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, partnerId]);

  if (loading) {
    return (
      <div className="py-8 flex flex-col items-center text-slate-400">
        <span className="material-symbols-outlined animate-spin text-[#ff6a00] text-2xl">
          progress_activity
        </span>
        <p className="text-xs mt-2">Loading bills...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-red-100 text-center">
        <p className="text-xs text-red-500">{error}</p>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-slate-100 text-center">
        <span className="material-symbols-outlined text-slate-300 text-3xl">receipt_long</span>
        <p className="text-xs text-slate-400 mt-1">
          No bills yet. They'll appear here once a partner accepts your booking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bills.map((bill) => {
        const status = getBillStatus(bill);
        const isOpen = openBillId === bill.booking_id;
        const isPaid = bill.payment_status === 'PAID';
        const balance = Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0));

        return (
          <div
            key={bill.booking_id}
            className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden"
          >
            {/* Summary row */}
            <button
              type="button"
              onClick={() => setOpenBillId(isOpen ? null : bill.booking_id)}
              className="w-full p-3.5 flex items-center gap-3 text-left"
            >
              <img
                src={bill.partner_avatar || '/logo.svg'}
                alt={bill.partner_name}
                className="w-10 h-10 rounded-xl object-cover shrink-0 bg-[#eff4ff]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30] truncate">
                  {bill.service_title}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {bill.partner_name} • {formatDate(bill.completed_at || bill.booking_time)}
                </p>
                <span className={`inline-flex items-center gap-0.5 mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status.tone}`}>
                  <span className="material-symbols-outlined text-[12px]">{status.icon}</span>
                  {status.label}
                </span>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-extrabold text-[#a14000]">
                  {formatRupees(bill.total_amount)}
                </p>
                <span className="material-symbols-outlined text-[18px] text-slate-300">
                  {isOpen ? 'expand_less' : 'expand_more'}
                </span>
              </div>
            </button>

            {/* Full bill */}
            {isOpen && (
              <div className="px-3.5 pb-3.5 pt-3 border-t border-dashed border-slate-200 space-y-1.5 text-xs">

                <div className="flex justify-between gap-3">
                  <span className="text-[#5a4136]">
                    {`${bill.service_title} (incl. trust fee)`}
                  </span>
                  <span className="font-bold text-[#0b1c30] shrink-0">
                    {formatRupees(bill.base_amount)}
                  </span>
                </div>

                {bill.extra_charges.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      Extra parts & work
                    </p>

                    {bill.extra_charges.map((charge, index) => {
                      const isApproved = charge.status === 'APPROVED';

                      return (
                        <div
                          key={`${charge.item}-${index}`}
                          className="flex justify-between gap-3 mt-1"
                        >
                          <span className="min-w-0">
                            <span className={isApproved ? 'text-[#5a4136]' : 'text-slate-400 line-through'}>
                              {charge.item}
                            </span>
                            {!isApproved && (
                              <span className="ml-1 text-[10px] text-slate-400">
                                ({EXTRA_STATUS_LABELS[charge.status] || charge.status})
                              </span>
                            )}
                          </span>
                          <span className={`shrink-0 ${isApproved ? 'font-bold text-[#0b1c30]' : 'text-slate-400 line-through'}`}>
                            {formatRupees(charge.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-slate-100">
                  <span className="font-bold text-[#0b1c30]">Total</span>
                  <span className="font-extrabold text-[#0b1c30]">
                    {formatRupees(bill.total_amount)}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-[#5a4136]">Amount paid</span>
                  <span className={`font-bold ${isPaid ? 'text-[#006c49]' : 'text-[#0b1c30]'}`}>
                    {formatRupees(bill.amount_paid)}
                  </span>
                </div>

                {isPaid ? (
                  <div className="mt-2 rounded-xl bg-[#c8f7e1]/50 p-2.5 space-y-0.5">
                    <p className="text-[11px] font-bold text-[#006c49] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">verified</span>
                      Payment complete
                    </p>
                    {bill.paid_at && (
                      <p className="text-[10px] text-[#006c49]">
                        {`Paid on ${formatDate(bill.paid_at, true)}`}
                      </p>
                    )}
                    {bill.razorpay_payment_id && (
                      <p className="text-[10px] text-[#006c49] break-all">
                        {`Payment ID: ${bill.razorpay_payment_id}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-xl bg-amber-50 p-2.5">
                    <p className="text-[11px] font-bold text-amber-700">
                      {`Balance due: ${formatRupees(balance)}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
