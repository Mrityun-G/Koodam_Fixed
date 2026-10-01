import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../lib/firebase';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

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
  WAITING_FOR_ACCOUNT: { label: 'Needs bank account', tone: 'bg-amber-100 text-amber-700', icon: 'account_balance' },
  FAILED: { label: 'Transfer failed', tone: 'bg-red-100 text-red-600', icon: 'error' }
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

// The signed-in partner's Firebase ID token; the backend checks it so only
// the partner can see or change where their money goes
const authorizedFetch = async (url, options = {}) => {
  const user = auth?.currentUser;

  if (!user) {
    throw new Error('Please sign in again to manage payouts.');
  }

  const token = await user.getIdToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // FastAPI validation errors arrive as a list
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((item) => String(item.msg).replace(/^Value error, /, '')).join(' · ')
      : body?.detail;

    throw new Error(detail || `Request failed (${response.status})`);
  }

  return body;
};

// Earnings tab: where the partner's money goes after each paid job.
// Payouts happen automatically through Razorpay Route; there is nothing
// to withdraw. setupOpen / onSetupOpenChange control the bank form.
export const PartnerPayouts = ({ setupOpen, onSetupOpenChange }) => {
  const { partnerProfile, showToast } = useApp();
  const partnerId = partnerProfile?.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

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
          ? 'Bank account added — your earnings will be paid into it.'
          : 'Bank account sent to Razorpay for verification.'
      );
      load();
    } catch (saveError) {
      setFormError(saveError.message || "Couldn't save your bank account.");
    } finally {
      setSaving(false);
    }
  };

  const account = data?.account || { status: 'NOT_SET' };
  const accountStatus = ACCOUNT_STATUS[account.status] || ACCOUNT_STATUS.UNDER_REVIEW;
  const totals = data?.totals || {};
  const payouts = data?.payouts || [];

  const inputClass =
    'w-full bg-[#f8f9ff] border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#0b1c30] outline-none focus:border-[#ff6a00]';

  return (
    <>
      <section className="space-y-2 pt-1">
        <div className="px-1 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#0b1c30]">Payouts</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Your share of each paid job, sent to your bank by Razorpay
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
                        Sent automatically once your bank account is active
                      </p>
                    )}

                    {payout.status === 'FAILED' && (
                      <p className="text-[10px] text-red-500 mt-1">
                        {payout.error || 'Transfer failed.'} Saving your bank details again retries it.
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
      {setupOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between mb-3">
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

            <p className="text-xs text-slate-500 mb-3">
              Razorpay verifies these details (KYC) and pays your share of every job into this account. KOODAM never stores your full account number.
            </p>

            <div className="space-y-2">
              <input className={inputClass} placeholder="Name as on bank account" value={form.beneficiary_name} onChange={updateField('beneficiary_name')} required />
              <input className={inputClass} placeholder="Account number" inputMode="numeric" autoComplete="off" value={form.account_number} onChange={updateField('account_number')} required />
              <input className={inputClass} placeholder="Confirm account number" inputMode="numeric" autoComplete="off" value={form.confirm_account_number} onChange={updateField('confirm_account_number')} required />

              <div className="grid grid-cols-2 gap-2">
                <input className={`${inputClass} uppercase`} placeholder="IFSC" maxLength={11} value={form.ifsc} onChange={updateField('ifsc')} required />
                <input className={`${inputClass} uppercase`} placeholder="PAN" maxLength={10} value={form.pan} onChange={updateField('pan')} required />
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

            <button
              type="submit"
              disabled={saving}
              className="w-full mt-4 py-3 rounded-full bg-[#00ae78] hover:bg-[#006c49] disabled:opacity-60 text-white font-bold text-sm shadow-md active:scale-95 transition-all"
            >
              {saving ? 'Saving...' : 'Save bank account'}
            </button>
          </form>
        </div>
      )}
    </>
  );
};
