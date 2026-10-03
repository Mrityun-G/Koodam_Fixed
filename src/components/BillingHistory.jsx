import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ComplaintPanel } from './ComplaintPanel';

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

// Bills shown before "View more"
const RECENT_BILLS = 3;

const EXTRA_STATUS_LABELS = {
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  PENDING: 'Awaiting approval'
};

// Bills, newest first.
// - viewer="customer": what the customer paid. partnerId limits it to the
//   work one partner did.
// - viewer="partner": what the partner earned from each job.
//   customerId limits it to the jobs for one customer.
// onBillsLoaded receives the bills (for totals).
export const BillingHistory = ({
  viewer = 'customer',
  partnerId = null,
  customerId = null,
  onBillsLoaded
}) => {
  const { userProfile, partnerProfile, authUser } = useApp();

  const isPartnerView = viewer === 'partner';

  const ownerId = isPartnerView
    ? partnerProfile?.id
    : userProfile?.id || authUser?.uid;

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openBillId, setOpenBillId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  // Bumped after a complaint changes, to reload the bills
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const url = isPartnerView
      ? `${BACKEND_URL}/bookings/partner-billing/${encodeURIComponent(ownerId)}` +
        (customerId ? `?customer_id=${encodeURIComponent(customerId)}` : '')
      : `${BACKEND_URL}/bookings/billing/${encodeURIComponent(ownerId)}` +
        (partnerId ? `?partner_id=${encodeURIComponent(partnerId)}` : '');

    setLoading(true);
    setError('');

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Billing request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setBills(data);
        // Keep the bill that's open open across a reload
        setOpenBillId((current) =>
          data.some((bill) => bill.booking_id === current)
            ? current
            : data[0]?.booking_id || null
        );
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
  }, [ownerId, isPartnerView, partnerId, customerId, reloadKey]);

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
          {isPartnerView
            ? "No jobs yet. They'll appear here once you accept a booking."
            : "No bills yet. They'll appear here once a partner accepts your booking."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(showAll ? bills : bills.slice(0, RECENT_BILLS)).map((bill) => {
        const status = getBillStatus(bill);
        const isOpen = openBillId === bill.booking_id;
        const isPaid = bill.payment_status === 'PAID';
        const balance = Math.max(0, (bill.total_amount || 0) - (bill.amount_paid || 0));

        // Name the other person: the partner to a customer, and vice versa
        const otherName = isPartnerView ? bill.customer_name : bill.partner_name;

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
              {/* A service icon, not a face: next to a photo, the service
                  name reads like that person's job title */}
              <div className="w-10 h-10 rounded-xl shrink-0 bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">
                  home_repair_service
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30] truncate">
                  <span>{bill.service_title}</span> <span>service</span>
                </p>
                {/* Say who the other person is, so a customer's name under
                    "Plumber" isn't mistaken for the plumber */}
                <p className="text-[11px] text-slate-500 truncate">
                  {`${isPartnerView ? 'Customer' : 'Partner'}: ${otherName} • ${formatDate(bill.completed_at || bill.booking_time)}`}
                </p>
                <span className={`inline-flex items-center gap-0.5 mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status.tone}`}>
                  <span className="material-symbols-outlined text-[12px]">{status.icon}</span>
                  {status.label}
                </span>
                {bill.complaint?.status === 'OPEN' && (
                  <span className="inline-flex items-center gap-0.5 mt-1 ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                    <span className="material-symbols-outlined text-[12px]">report</span>
                    {isPartnerView ? 'Reply needed' : 'Problem reported'}
                  </span>
                )}
              </div>

              <div className="text-right shrink-0">
                {isPartnerView && (
                  <p className="text-[9px] font-bold text-slate-400 uppercase">
                    You get
                  </p>
                )}
                <p className={`text-sm font-extrabold ${isPartnerView ? 'text-[#006c49]' : 'text-[#a14000]'}`}>
                  {formatRupees(isPartnerView ? bill.partner_payout : bill.total_amount)}
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
                    {isPartnerView ? 'Job price' : bill.service_title}
                  </span>
                  <span className="font-bold text-[#0b1c30] shrink-0">
                    {formatRupees(bill.service_price)}
                  </span>
                </div>

                {isPartnerView ? (
                  <div className="flex justify-between gap-3">
                    <span className="text-[#5a4136]">
                      {`KOODAM commission (${bill.commission_percent}%)`}
                    </span>
                    <span className="font-bold text-red-500 shrink-0">
                      {`− ${formatRupees(bill.commission)}`}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between gap-3">
                    <span className="text-[#5a4136]">Trust Shield fee</span>
                    <span className="font-bold text-[#0b1c30] shrink-0">
                      {formatRupees(bill.trust_fee)}
                    </span>
                  </div>
                )}

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
                            {isPartnerView && isApproved
                              ? `+ ${formatRupees(charge.amount)}`
                              : formatRupees(charge.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isPartnerView ? (
                  <>
                    <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-slate-100">
                      <span className="font-bold text-[#0b1c30]">You receive</span>
                      <span className="font-extrabold text-[#006c49]">
                        {formatRupees(bill.partner_payout)}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400">
                      {`Customer's total bill: ${formatRupees(bill.total_amount)} (includes ${formatRupees(bill.trust_fee)} trust fee paid to KOODAM). Extra parts are never commissioned.`}
                    </p>
                  </>
                ) : (
                  <>
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
                  </>
                )}

                {isPaid ? (
                  <div className="mt-2 rounded-xl bg-[#c8f7e1]/50 p-2.5 space-y-0.5">
                    <p className="text-[11px] font-bold text-[#006c49] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">verified</span>
                      {isPartnerView ? 'Customer has paid' : 'Payment complete'}
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
                      {isPartnerView
                        ? "Waiting for the customer's payment"
                        : `Balance due: ${formatRupees(balance)}`}
                    </p>
                  </div>
                )}

                <ComplaintPanel
                  bill={bill}
                  viewer={viewer}
                  onChanged={() => setReloadKey((key) => key + 1)}
                />
              </div>
            )}
          </div>
        );
      })}

      {bills.length > RECENT_BILLS && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-1 text-xs font-bold text-[#a14000] bg-white border border-slate-100 rounded-2xl py-2.5 active:scale-95 transition-all"
        >
          {showAll ? 'Show less' : `View more (${bills.length - RECENT_BILLS})`}
          <span className="material-symbols-outlined text-[16px]">
            {showAll ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      )}
    </div>
  );
};
