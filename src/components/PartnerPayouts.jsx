import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { authorizedFetch, BACKEND_URL } from '../lib/authorizedFetch';

const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2
  })}`;

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';

const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
  'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

const ACCOUNT_STATUS = {
  NOT_SET: {
    label: 'Add your bank account to get paid',
    tone: 'bg-amber-100 text-amber-700',
    icon: 'account_balance'
  },
  UNDER_REVIEW: {
    label: 'Razorpay is verifying your bank account',
    tone: 'bg-[#dce1ff] text-[#4e5c92]',
    icon: 'hourglass_top'
  },
  NEEDS_CLARIFICATION: {
    label: 'Razorpay needs more details',
    tone: 'bg-red-100 text-red-600',
    icon: 'error'
  },
  SUSPENDED: {
    label: 'Payouts are paused by Razorpay',
    tone: 'bg-red-100 text-red-600',
    icon: 'block'
  },
  ACTIVATED: {
    label: 'Payouts active',
    tone: 'bg-[#c8f7e1] text-[#006c49]',
    icon: 'verified'
  }
};

const PAYOUT_STATUS = {
  SETTLED: { label: 'In your bank', tone: 'bg-[#c8f7e1] text-[#006c49]', icon: 'check_circle' },
  SENT: { label: 'On the way', tone: 'bg-[#dce1ff] text-[#4e5c92]', icon: 'schedule_send' },
  WAITING_FOR_ACCOUNT: { label: 'In your balance', tone: 'bg-amber-100 text-amber-700', icon: 'account_balance_wallet' },
  FAILED: { label: 'Transfer failed', tone: 'bg-red-100 text-red-600', icon: 'error' },
  CASH_COLLECTED: { label: 'Collected in cash', tone: 'bg-[#ffdbcc] text-[#7b2f00]', icon: 'payments' },
  WITHDRAWAL_REQUESTED: { label: 'Withdrawal requested', tone: 'bg-[#dce1ff] text-[#4e5c92]', icon: 'hourglass_top' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'bg-[#c8f7e1] text-[#006c49]', icon: 'check_circle' }
};

const WITHDRAWAL_STATUS = {
  REQUESTED: { label: 'Waiting to be paid', tone: 'bg-[#dce1ff] text-[#4e5c92]', icon: 'hourglass_top' },
  PROCESSING: { label: 'On the way', tone: 'bg-[#dce1ff] text-[#4e5c92]', icon: 'schedule_send' },
  PAID: { label: 'Paid', tone: 'bg-[#c8f7e1] text-[#006c49]', icon: 'check_circle' },
  FAILED: { label: 'Failed', tone: 'bg-red-100 text-red-600', icon: 'error' },
  REJECTED: { label: 'Rejected', tone: 'bg-red-100 text-red-600', icon: 'cancel' }
};

const EMPTY_WITHDRAW_FORM = {
  method: 'UPI',
  upi_id: '',
  account_holder: '',
  account_number: '',
  confirm_account_number: '',
  ifsc: ''
};

const EMPTY_FORM = {
  beneficiary_name: '',
  account_number: '',
  confirm_account_number: '',
  ifsc: '',
  pan: '',
  phone: '',
  street1: '',
  street2: '',
  city: '',
  state: 'Tamil Nadu',
  postal_code: ''
};

// Earnings tab: where the partner's money goes after each paid job.
// With an active bank account Razorpay Route pays each job automatically;
// until then the partner withdraws their balance and KOODAM staff pay it.
// setupOpen / onSetupOpenChange control the bank form.
export const PartnerPayouts = ({ setupOpen, onSetupOpenChange, refreshKey = 0 }) => {
  const { partnerProfile, showToast } = useApp();
  const partnerId = partnerProfile?.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState(EMPTY_WITHDRAW_FORM);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    if (!partnerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      setData(
        await authorizedFetch(
          `${BACKEND_URL}/payouts/partners/${encodeURIComponent(partnerId)}`
        )
      );
    } catch (loadError) {
      console.error('Failed to load payouts:', loadError);
      setError(loadError.message || "Couldn't load your payouts.");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  // refreshKey changes when the Earnings tab's Refresh button is tapped
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Prefill the form with what's already known
  useEffect(() => {
    if (!setupOpen) return;

    setFormError('');
    setForm({
      ...EMPTY_FORM,
      beneficiary_name:
        data?.account?.beneficiary_name || partnerProfile?.name || '',
      ifsc: data?.account?.ifsc || '',
      phone: partnerProfile?.phone || ''
    });
  }, [setupOpen]);

  const updateField = (field) => (event) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  // IFSC / PAN: drop spaces (often pasted in) before trimming to length
  const updateCode = (setter, field, length) => (event) =>
    setter((previous) => ({
      ...previous,
      [field]: event.target.value.replace(/\s/g, '').toUpperCase().slice(0, length)
    }));

  const handleSave = async (event) => {
    event.preventDefault();

    if (form.account_number.replace(/\s/g, '') !== form.confirm_account_number.replace(/\s/g, '')) {
      setFormError('The account numbers do not match.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const { confirm_account_number, ...payload } = form;

      const account = await authorizedFetch(
        `${BACKEND_URL}/payouts/partners/${encodeURIComponent(partnerId)}/account`,
        { method: 'PUT', body: JSON.stringify(payload) }
      );

      onSetupOpenChange(false);
      showToast(
        account.status === 'ACTIVATED'
          ? 'Bank account added — your withdrawals will be paid into it.'
          : 'Bank account sent to Razorpay for verification.'
      );
      load();
    } catch (saveError) {
      setFormError(saveError.message || "Couldn't save your bank account.");
    } finally {
      setSaving(false);
    }
  };

  const openWithdraw = () => {
    // Start from the last request's details so a repeat is one tap
    const last = data?.withdrawals?.[0];

    setWithdrawError('');
    setWithdrawForm({
      ...EMPTY_WITHDRAW_FORM,
      method: last?.method || 'UPI',
      upi_id: last?.upi_id || '',
      account_holder: last?.account_holder || data?.account?.beneficiary_name || partnerProfile?.name || '',
      ifsc: last?.ifsc || ''
    });
    setWithdrawOpen(true);
  };

  const updateWithdrawField = (field) => (event) =>
    setWithdrawForm((previous) => ({ ...previous, [field]: event.target.value }));

  const handleWithdraw = async (event) => {
    event.preventDefault();

    const isRoute = Boolean(withdrawal?.route);
    const isBank = !isRoute && withdrawForm.method === 'BANK';

    if (
      isBank &&
      withdrawForm.account_number.replace(/\s/g, '') !== withdrawForm.confirm_account_number.replace(/\s/g, '')
    ) {
      setWithdrawError('The account numbers do not match.');
      return;
    }

    setWithdrawing(true);
    setWithdrawError('');

    try {
      const withdrawal = await authorizedFetch(
        `${BACKEND_URL}/payouts/partners/${encodeURIComponent(partnerId)}/withdrawals`,
        {
          method: 'POST',
          body: JSON.stringify(
            isRoute
              ? { method: 'ROUTE' }
              : isBank
              ? {
                  method: 'BANK',
                  account_holder: withdrawForm.account_holder,
                  account_number: withdrawForm.account_number,
                  ifsc: withdrawForm.ifsc
                }
              : { method: 'UPI', upi_id: withdrawForm.upi_id }
          )
        }
      );

      setWithdrawOpen(false);
      showToast(
        withdrawal.status === 'PAID'
          ? `${formatRupees(withdrawal.amount)} sent — Razorpay pays it into your bank.`
          : withdrawal.status === 'PROCESSING'
            ? `Razorpay is sending ${formatRupees(withdrawal.amount)} to your account.`
            : `Withdrawal of ${formatRupees(withdrawal.amount)} requested — KOODAM will pay it soon.`
      );
      load();
    } catch (withdrawFailure) {
      setWithdrawError(withdrawFailure.message || "Couldn't request the withdrawal.");
    } finally {
      setWithdrawing(false);
    }
  };

  const account = data?.account || { status: 'NOT_SET' };
  const accountStatus = ACCOUNT_STATUS[account.status] || ACCOUNT_STATUS.UNDER_REVIEW;
  const totals = data?.totals || {};
  const payouts = data?.payouts || [];
  const withdrawal = data?.withdrawal;
  const withdrawals = data?.withdrawals || [];
  const canWithdraw =
    withdrawal?.allowed && !withdrawal.pending && withdrawal.available >= withdrawal.minimum;

  const inputClass =
    'w-full bg-[#f8f9ff] border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#0b1c30] outline-none focus:border-[#ff6a00]';

  return (
    <>
      <section className="space-y-2 pt-1">
        <div className="px-1 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#0b1c30]">Payouts</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Your share of each paid job • withdraw it whenever you like
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            className="text-[11px] font-bold text-[#a14000] flex items-center gap-0.5"
          >
            <span className="material-symbols-outlined text-[15px]">refresh</span>
            Refresh
          </button>
        </div>

        {/* Bank account */}
        <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${accountStatus.tone}`}>
            <span className="material-symbols-outlined text-[18px]">{accountStatus.icon}</span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#0b1c30] truncate">
              {account.bank_last4
                ? `${account.beneficiary_name} · A/c ••••${account.bank_last4}`
                : 'No bank account yet'}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {account.note || accountStatus.label}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onSetupOpenChange(true)}
            className="shrink-0 px-3 py-1.5 rounded-full bg-[#eff4ff] text-[#a14000] text-xs font-bold hover:bg-[#ffdbcc] transition-colors"
          >
            {account.bank_last4 ? 'Change' : 'Add bank'}
          </button>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-2">
          {[
            ['In your bank', totals.settled, 'text-[#006c49]'],
            ['On the way', totals.in_transit, 'text-[#4e5c92]'],
            ['Waiting', (totals.waiting || 0) + (totals.failed || 0), 'text-amber-700']
          ].map(([label, value, tone]) => (
            <div key={label} className="bg-white rounded-2xl p-2.5 border border-slate-100 text-center">
              <p className={`text-sm font-extrabold ${tone}`}>{formatRupees(value)}</p>
              <p className="text-[10px] text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        {/* Withdraw: only while Route isn't paying the partner automatically */}
        {withdrawal?.allowed && (
          <div className="bg-[#0b1c30] rounded-2xl p-3.5 text-white flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-white/60 font-bold">Available to withdraw</p>
              <p className={`text-xl font-extrabold ${withdrawal.available < 0 ? 'text-red-300' : ''}`}>
                {formatRupees(withdrawal.available)}
              </p>
              <p className="text-[10px] text-white/60 truncate">
                {withdrawal.pending
                  ? 'Your last withdrawal is on its way'
                  : withdrawal.available < 0
                    ? "You owe KOODAM its share of cash jobs; it's taken from your next earnings"
                    : withdrawal.available < withdrawal.minimum
                      ? `You can withdraw from ${formatRupees(withdrawal.minimum)}`
                      : withdrawal.route || withdrawal.instant
                        ? 'Sent to your UPI ID or bank account by Razorpay'
                        : 'Paid to your UPI ID or bank account by KOODAM'}
              </p>
            </div>

            <button
              type="button"
              onClick={openWithdraw}
              disabled={!canWithdraw}
              className="shrink-0 px-4 py-2 rounded-full bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-white/15 disabled:text-white/50 text-white text-xs font-bold active:scale-95 transition-all"
            >
              Withdraw
            </button>
          </div>
        )}

        {withdrawals.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100">
            <p className="px-3.5 pt-3 pb-2 text-[10px] font-bold text-slate-400 uppercase">Withdrawals</p>
            {withdrawals.map((item) => {
              const status = WITHDRAWAL_STATUS[item.status] || WITHDRAWAL_STATUS.REQUESTED;

              return (
                <div key={item.id} className="px-3.5 py-2.5 flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${status.tone}`}>
                    <span className="material-symbols-outlined text-[16px]">{status.icon}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#0b1c30] truncate" data-no-translate>
                      {item.method === 'UPI' ? `UPI · ${item.upi_id}` : `Bank · A/c ••••${item.account_last4}${item.method === 'ROUTE' ? ' (Razorpay)' : ''}`}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {`Requested ${formatDate(item.requested_at)}`}
                    </p>
                    <span className={`inline-flex mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status.tone}`}>
                      {status.label}
                    </span>
                    {item.status === 'PAID' && (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">
                        {item.method === 'ROUTE'
                          ? `Sent ${formatDate(item.decided_at)} • Razorpay pays it into your bank`
                          : `Paid ${formatDate(item.decided_at)}${item.utr ? ` • UTR ${item.utr}` : ''}`}
                      </p>
                    )}
                    {item.status === 'PROCESSING' && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Razorpay is sending it • tap Refresh for updates
                      </p>
                    )}
                    {(item.status === 'REJECTED' || item.status === 'FAILED') && (
                      <p className="text-[10px] text-red-500 mt-1">
                        {`${item.rejection_reason || status.label} • The amount is back in your balance.`}
                      </p>
                    )}
                  </div>

                  <p className="text-sm font-extrabold text-[#0b1c30] shrink-0">
                    {formatRupees(item.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {totals.cash_collected > 0 && (
          <div className="bg-[#fff8f4] rounded-2xl p-3 border border-[#ffdbcc] text-[11px] text-[#7b2f00]">
            <p className="font-bold">
              {`Phone bookings: you kept ${formatRupees(totals.cash_collected)} as your share in cash`}
            </p>
            <p className="mt-0.5">
              {`KOODAM's trust fee and commission on them: ${formatRupees(totals.koodam_share_due)}, settled from your earnings.`}
            </p>
          </div>
        )}

        {/* List */}
        {loading && !data ? (
          <div className="py-6 flex flex-col items-center text-slate-400">
            <span className="material-symbols-outlined animate-spin text-[#ff6a00] text-2xl">
              progress_activity
            </span>
            <p className="text-xs mt-2">Loading payouts...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl p-4 border border-red-100 text-center">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        ) : payouts.length === 0 ? (
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              No payouts yet. Your share appears here as soon as a customer pays.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {payouts.map((payout) => {
              const status = PAYOUT_STATUS[payout.status] || PAYOUT_STATUS.SENT;

              return (
                <div
                  key={payout.booking_id}
                  className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-xs flex items-start gap-3"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${status.tone}`}>
                    <span className="material-symbols-outlined text-[18px]">{status.icon}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#0b1c30] truncate">
                      <span>{payout.service_title}</span> <span>service</span>
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {`Customer: ${payout.customer_name} • Paid ${formatDate(payout.paid_at)}`}
                    </p>

                    <span className={`inline-flex items-center gap-0.5 mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status.tone}`}>
                      {status.label}
                    </span>

                    {payout.status === 'SETTLED' && (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">
                        {`Reached bank ${formatDate(payout.settled_at)}${payout.utr ? ` • UTR ${payout.utr}` : ''}`}
                      </p>
                    )}

                    {payout.status === 'SENT' && (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">
                        {`Sent ${formatDate(payout.sent_at)} • Razorpay settles it to your bank`}
                      </p>
                    )}

                    {payout.status === 'WAITING_FOR_ACCOUNT' && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        In your balance • withdraw it any time
                      </p>
                    )}

                    {payout.status === 'WITHDRAWAL_REQUESTED' && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Part of your withdrawal waiting to be paid
                      </p>
                    )}

                    {payout.status === 'WITHDRAWN' && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Paid to you as part of a withdrawal
                      </p>
                    )}

                    {payout.status === 'CASH_COLLECTED' && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        {`Customer paid you in cash • KOODAM's share ${formatRupees(payout.koodam_share_due)}${payout.withdrawal_status ? ', taken from a withdrawal' : ''}`}
                      </p>
                    )}

                    {payout.status === 'FAILED' && (
                      <p className="text-[10px] text-red-500 mt-1">
                        {payout.error || 'Transfer failed.'} It's back in your balance to withdraw again.
                      </p>
                    )}
                  </div>

                  <p className="text-sm font-extrabold text-[#006c49] shrink-0">
                    {formatRupees(payout.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bank account form */}
      {setupOpen && createPortal(
        // Covers the phone screen, not the browser window. The header and
        // Save button stay put and only the fields scroll.
        <div className="absolute inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center px-4 py-6">
          <form
            onSubmit={handleSave}
            className="w-full max-w-sm max-h-full flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">account_balance</span>
                </div>
                <h3 className="font-bold text-[#0b1c30] text-base">Payout bank account</h3>
              </div>

              <button
                type="button"
                onClick={() => onSetupOpenChange(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-3">
            <p className="text-xs text-slate-500 mb-3">
              Razorpay verifies these details (KYC), then your withdrawals are paid into this account. KOODAM never stores your full account number.
            </p>

            <div className="space-y-2">
              <input className={inputClass} placeholder="Name as on bank account" value={form.beneficiary_name} onChange={updateField('beneficiary_name')} required />
              <input className={inputClass} placeholder="Account number" inputMode="numeric" autoComplete="off" value={form.account_number} onChange={updateField('account_number')} required />
              <input className={inputClass} placeholder="Confirm account number" inputMode="numeric" autoComplete="off" value={form.confirm_account_number} onChange={updateField('confirm_account_number')} required />

              <div className="grid grid-cols-2 gap-2">
                <input className={`${inputClass} uppercase`} placeholder="IFSC" value={form.ifsc} onChange={updateCode(setForm, 'ifsc', 11)} required />
                <input className={`${inputClass} uppercase`} placeholder="PAN" value={form.pan} onChange={updateCode(setForm, 'pan', 10)} required />
              </div>

              <input className={inputClass} placeholder="Mobile number" inputMode="tel" value={form.phone} onChange={updateField('phone')} required />

              <p className="text-[10px] font-bold text-slate-400 uppercase pt-1">Address</p>
              <input className={inputClass} placeholder="House / street" value={form.street1} onChange={updateField('street1')} required />
              <input className={inputClass} placeholder="Area / landmark (optional)" value={form.street2} onChange={updateField('street2')} />

              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} placeholder="City" value={form.city} onChange={updateField('city')} required />
                <input className={inputClass} placeholder="PIN code" inputMode="numeric" maxLength={6} value={form.postal_code} onChange={updateField('postal_code')} required />
              </div>

              <select className={inputClass} value={form.state} onChange={updateField('state')}>
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>

            {formError && (
              <p className="text-[11px] text-red-500 mt-3">{formError}</p>
            )}
            </div>

            <div className="px-5 pt-3 pb-5 border-t border-slate-100 shrink-0">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-full bg-[#00ae78] hover:bg-[#006c49] disabled:opacity-60 text-white font-bold text-sm shadow-md active:scale-95 transition-all"
            >
              {saving ? 'Saving...' : 'Save bank account'}
            </button>
            </div>
          </form>
        </div>,
        document.getElementById('phone-screen') || document.body
      )}

      {/* Withdraw form */}
      {withdrawOpen && createPortal(
        <div className="absolute inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center px-4 py-6">
          <form
            onSubmit={handleWithdraw}
            className="w-full max-w-sm max-h-full flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">savings</span>
                </div>
                <h3 className="font-bold text-[#0b1c30] text-base">Withdraw earnings</h3>
              </div>

              <button
                type="button"
                onClick={() => setWithdrawOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-3">
              <div className="bg-[#f8f9ff] rounded-2xl p-3 text-center mb-3">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Amount</p>
                <p className="text-2xl font-extrabold text-[#0b1c30]">{formatRupees(withdrawal?.available)}</p>
                <p className="text-[10px] text-slate-500">{withdrawal?.route || withdrawal?.instant
                    ? 'Your full balance, sent by Razorpay straight away.'
                    : 'Your full balance, paid by KOODAM after a quick check.'}</p>
              </div>

              {withdrawal?.route ? (
                // Verified through Razorpay: nothing to type
                <div className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
                  <div className="w-9 h-9 rounded-full bg-[#c8f7e1] text-[#006c49] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#0b1c30] truncate" data-no-translate>
                      {`${account.beneficiary_name} · A/c ••••${account.bank_last4}`}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Sent through Razorpay to your verified bank account
                    </p>
                  </div>
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-full p-1 mb-3">
                {[['UPI', 'UPI ID'], ['BANK', 'Bank account']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setWithdrawForm((previous) => ({ ...previous, method: value }))}
                    className={`py-1.5 rounded-full text-xs font-bold transition-colors ${
                      withdrawForm.method === value ? 'bg-white text-[#a14000] shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {withdrawForm.method === 'UPI' ? (
                <input
                  className={inputClass}
                  placeholder="UPI ID (e.g. name@okaxis)"
                  autoComplete="off"
                  value={withdrawForm.upi_id}
                  onChange={updateWithdrawField('upi_id')}
                  required
                />
              ) : (
                <div className="space-y-2">
                  <input className={inputClass} placeholder="Name as on bank account" value={withdrawForm.account_holder} onChange={updateWithdrawField('account_holder')} required />
                  <input className={inputClass} placeholder="Account number" inputMode="numeric" autoComplete="off" value={withdrawForm.account_number} onChange={updateWithdrawField('account_number')} required />
                  <input className={inputClass} placeholder="Confirm account number" inputMode="numeric" autoComplete="off" value={withdrawForm.confirm_account_number} onChange={updateWithdrawField('confirm_account_number')} required />
                  <input className={`${inputClass} uppercase`} placeholder="IFSC" value={withdrawForm.ifsc} onChange={updateCode(setWithdrawForm, 'ifsc', 11)} required />
                </div>
              )}
              </>
              )}

              {withdrawError && (
                <p className="text-[11px] text-red-500 mt-3">{withdrawError}</p>
              )}
            </div>

            <div className="px-5 pt-3 pb-5 border-t border-slate-100 shrink-0">
              <button
                type="submit"
                disabled={withdrawing}
                className="w-full py-3 rounded-full bg-[#00ae78] hover:bg-[#006c49] disabled:opacity-60 text-white font-bold text-sm shadow-md active:scale-95 transition-all"
              >
                {withdrawing ? 'Requesting...' : `Withdraw ${formatRupees(withdrawal?.available)}`}
              </button>
            </div>
          </form>
        </div>,
        document.getElementById('phone-screen') || document.body
      )}
    </>
  );
};
