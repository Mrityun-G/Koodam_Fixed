import React, { useCallback, useEffect, useState } from 'react';
import { SubHeader } from '../components/SubHeader';
import { useApp } from '../context/AppContext';
import { authorizedFetch } from '../lib/authorizedFetch';
import { PhoneBookingSimulator } from '../components/PhoneBookingSimulator';
import { AdminAppSettings } from '../components/AdminAppSettings';

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';

// '' lets the backend apply the usual rule: first one in the window is a
// warning, the rest are strikes
const SEVERITIES = [
  { value: '', label: 'Usual rule' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'STRIKE', label: 'Strike' }
];

const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 p-3.5 space-y-1.5 text-[11px] ${className}`}>
    {children}
  </div>
);

const SectionTitle = ({ children }) => (
  <h2 className="text-xs font-extrabold text-[#0b1c30] uppercase tracking-wide pt-2">
    {children}
  </h2>
);

// One complaint a customer escalated: uphold it (penalize) or dismiss it
const ReviewItem = ({ complaint, onDecide, busy }) => {
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState('');

  return (
    <Card>
      <p className="font-bold text-[#0b1c30]">
        {`${complaint.partner_name} • ${complaint.service_title}`}
      </p>
      <p className="text-slate-500">
        {`${complaint.customer_name} reported: ${complaint.reason_label} (${formatDate(complaint.created_at)})`}
      </p>
      {complaint.description && <p className="text-[#5a4136]">{`"${complaint.description}"`}</p>}
      {complaint.partner_response && (
        <p className="bg-slate-50 rounded-lg p-2">
          <span className="font-bold">Partner replied: </span>
          {complaint.partner_response}
        </p>
      )}

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note shown to both (optional)"
        className="w-full border border-slate-200 rounded-lg p-2"
      />

      <div className="flex gap-2 items-center">
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          className="border border-slate-200 rounded-lg p-2 bg-white"
        >
          {SEVERITIES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(complaint.id, { decision: 'UPHOLD', severity: severity || null, note })}
          className="flex-1 font-bold text-white bg-red-500 rounded-lg py-2 disabled:opacity-60"
        >
          Uphold
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(complaint.id, { decision: 'DISMISS', note })}
          className="flex-1 font-bold text-slate-600 border border-slate-200 rounded-lg py-2 disabled:opacity-60"
        >
          Dismiss
        </button>
      </div>
    </Card>
  );
};

const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Partner withdrawal requests: pay them by UPI or bank, then record the
// bank reference (UTR), or reject so the amount returns to their balance
const WithdrawalsSection = () => {
  const { showToast } = useApp();

  const [withdrawals, setWithdrawals] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setWithdrawals(await authorizedFetch('/payouts/admin/withdrawals'));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (withdrawal, action) => {
    const value = window.prompt(
      action === 'paid'
        ? `Paid ${formatRupees(withdrawal.amount)} to ${withdrawal.partner_name}? Enter the UTR / UPI reference:`
        : `Why reject ${withdrawal.partner_name}'s withdrawal? They'll see this reason.`
    );

    if (!value || value.trim().length < 3) return;

    setBusy(true);

    try {
      await authorizedFetch(`/payouts/admin/withdrawals/${withdrawal.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(action === 'paid' ? { utr: value } : { reason: value })
      });
      showToast(action === 'paid' ? 'Marked as paid.' : 'Rejected. The amount is back in their balance.');
      await load();
    } catch (actError) {
      showToast(actError.message);
    } finally {
      setBusy(false);
    }
  };

  const isOpen = (item) => ['REQUESTED', 'PROCESSING'].includes(item.status);
  const waiting = withdrawals?.filter(isOpen) || [];
  const decided = withdrawals?.filter((item) => !isOpen(item)) || [];

  return (
    <>
      <SectionTitle>{`Partner withdrawals (${waiting.length})`}</SectionTitle>
      {error ? (
        <p className="text-[11px] text-red-500">{error}</p>
      ) : !withdrawals ? (
        <p className="text-[11px] text-slate-400">Loading...</p>
      ) : withdrawals.length === 0 ? (
        <p className="text-[11px] text-slate-400">No withdrawal requests yet.</p>
      ) : (
        [...waiting, ...decided.slice(0, 10)].map((item) => (
          <Card key={item.id} className={isOpen(item) ? '' : 'opacity-70'}>
            <div className="flex justify-between gap-2">
              <p className="font-bold text-[#0b1c30]">
                {`${item.partner_name}${item.partner_phone ? ` • ${item.partner_phone}` : ''}`}
              </p>
              <p className="font-extrabold text-[#0b1c30] shrink-0">{formatRupees(item.amount)}</p>
            </div>

            {item.method === 'UPI' ? (
              <p className="text-[#5a4136] select-all">{`UPI: ${item.upi_id}`}</p>
            ) : (
              <p className="text-[#5a4136] select-all">
                {`Bank: ${item.account_holder} • A/c ${item.account_number || `••••${item.account_last4}`} • IFSC ${item.ifsc}`}
              </p>
            )}

            <p className="text-slate-500">
              {item.status === 'REQUESTED'
                ? `Requested ${formatDate(item.requested_at)} • pay by hand`
                : item.status === 'PROCESSING'
                  ? `Requested ${formatDate(item.requested_at)} • RazorpayX is paying it`
                  : item.status === 'PAID'
                    ? `Paid ${formatDate(item.decided_at)}${item.utr ? ` • UTR ${item.utr}` : ''}`
                    : `${item.status === 'FAILED' ? 'Razorpay failed' : 'Rejected'} ${formatDate(item.decided_at)}: ${item.rejection_reason}`}
            </p>

            {item.status === 'REQUESTED' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(item, 'paid')}
                  className="flex-1 font-bold text-white bg-[#006c49] rounded-lg py-2 disabled:opacity-60"
                >
                  Mark paid
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(item, 'reject')}
                  className="flex-1 font-bold text-red-500 border border-red-200 rounded-lg py-2 disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            )}
          </Card>
        ))
      )}
    </>
  );
};

export const AdminEscalationsScreen = () => {
  const { showToast } = useApp();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [manual, setManual] = useState({ partner_id: '', reason: '', severity: '' });

  const load = useCallback(async () => {
    try {
      setData(await authorizedFetch('/admin/escalations'));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (path, body, message) => {
    setBusy(true);

    try {
      await authorizedFetch(path, { method: 'POST', body: JSON.stringify(body) });
      showToast(message);
      await load();
      return true;
    } catch (actError) {
      showToast(actError.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const overturn = (escalation) => {
    const note = window.prompt(
      `Why overturn this ${escalation.severity.toLowerCase()} for ${escalation.partner_name}?`
    );

    if (note && note.trim().length >= 3) {
      act(
        `/admin/escalations/${escalation.id}/overturn`,
        { note },
        'Overturned. Their score and any suspension were updated.'
      );
    }
  };

  const deactivate = (partner) => {
    const reason = window.prompt(
      `Why deactivate ${partner.name}? They'll see this reason.`
    );

    if (reason && reason.trim().length >= 3) {
      act(
        `/admin/partners/${partner.id}/deactivate`,
        { reason },
        `${partner.name} is deactivated. Customers can't book them.`
      );
    }
  };

  const reactivate = (partner) => {
    if (window.confirm(`Reactivate ${partner.name}? Customers will be able to book them again.`)) {
      act(
        `/admin/partners/${partner.id}/reactivate`,
        {},
        `${partner.name} is active again.`
      );
    }
  };

  const submitManual = async () => {
    const done = await act(
      '/admin/escalations',
      {
        partner_id: manual.partner_id,
        reason: manual.reason,
        severity: manual.severity || null
      },
      'Escalation added to the partner\'s record.'
    );

    if (done) setManual({ partner_id: '', reason: '', severity: '' });
  };

  if (error) {
    return (
      <div className="flex-1 flex flex-col w-full bg-[#f8f9ff] min-h-screen">
        <SubHeader title="Partner Escalations" />
        <p className="p-4 text-xs text-red-500">{error}</p>
      </div>
    );
  }

  const review = data?.complaints.filter((c) => c.status === 'NEEDS_REVIEW') || [];
  const waiting = data?.complaints.filter((c) => c.status !== 'NEEDS_REVIEW') || [];

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <SubHeader title="Partner Escalations" />

      <main className="flex-1 flex flex-col w-full pb-10 px-4 space-y-2 pt-3">
        {!data ? (
          <p className="text-xs text-slate-400 py-6 text-center">Loading...</p>
        ) : (
          <>
            <SectionTitle>{`Needs your decision (${review.length})`}</SectionTitle>
            {review.length === 0 ? (
              <p className="text-[11px] text-slate-400">Nothing to review.</p>
            ) : (
              review.map((complaint) => (
                <ReviewItem
                  key={complaint.id}
                  complaint={complaint}
                  busy={busy}
                  onDecide={(id, body) =>
                    act(`/admin/complaints/${id}/decide`, body, 'Decision saved.')
                  }
                />
              ))
            )}

            <SectionTitle>{`Open complaints (${waiting.length})`}</SectionTitle>
            {waiting.length === 0 ? (
              <p className="text-[11px] text-slate-400">None.</p>
            ) : (
              waiting.map((complaint) => (
                <Card key={complaint.id}>
                  <p className="font-bold text-[#0b1c30]">
                    {`${complaint.partner_name} • ${complaint.reason_label}`}
                  </p>
                  <p className="text-slate-500">
                    {complaint.status === 'OPEN'
                      ? `Waiting for partner's reply until ${formatDate(complaint.respond_by)}`
                      : "Partner replied; waiting for the customer"}
                  </p>
                </Card>
              ))
            )}

            <SectionTitle>Escalate a partner</SectionTitle>
            <Card>
              <select
                value={manual.partner_id}
                onChange={(event) => setManual({ ...manual, partner_id: event.target.value })}
                className="w-full border border-slate-200 rounded-lg p-2 bg-white"
              >
                <option value="">Choose a partner</option>
                {data.partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {`${partner.name} (score ${Math.round(partner.reliability_score)}${partner.deactivated ? ', deactivated' : partner.suspended ? ', suspended' : ''})`}
                  </option>
                ))}
              </select>
              <textarea
                value={manual.reason}
                onChange={(event) => setManual({ ...manual, reason: event.target.value })}
                rows={2}
                maxLength={1000}
                placeholder="Reason (shown to the partner)"
                className="w-full border border-slate-200 rounded-lg p-2"
              />
              <div className="flex gap-2">
                <select
                  value={manual.severity}
                  onChange={(event) => setManual({ ...manual, severity: event.target.value })}
                  className="border border-slate-200 rounded-lg p-2 bg-white"
                >
                  {SEVERITIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !manual.partner_id || manual.reason.trim().length < 3}
                  onClick={submitManual}
                  className="flex-1 font-bold text-white bg-red-500 rounded-lg py-2 disabled:opacity-60"
                >
                  Escalate
                </button>
              </div>
            </Card>

            <SectionTitle>Partner accounts</SectionTitle>
            <p className="text-[11px] text-slate-400">
              Deactivating hides a partner from customers until you reactivate them. No strike is added to their record.
            </p>
            {data.partners.length === 0 ? (
              <p className="text-[11px] text-slate-400">No partners yet.</p>
            ) : (
              data.partners.map((partner) => (
                <Card key={partner.id}>
                  <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-[#0b1c30] truncate">{partner.name}</p>
                      <p className={partner.deactivated ? 'text-red-500 font-bold' : partner.suspended ? 'text-amber-600 font-bold' : 'text-[#006c49] font-bold'}>
                        {partner.deactivated
                          ? `Deactivated ${formatDate(partner.deactivated_at)}`
                          : partner.suspended
                          ? `Suspended until ${formatDate(partner.suspended_until)}`
                          : 'Active'}
                      </p>
                    </div>
                    {partner.deactivated ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => reactivate(partner)}
                        className="shrink-0 font-bold text-white bg-[#006c49] rounded-lg px-3 py-2 disabled:opacity-60"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => deactivate(partner)}
                        className="shrink-0 font-bold text-red-500 border border-red-200 rounded-lg px-3 py-2 disabled:opacity-60"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                  {partner.deactivated && partner.deactivation_reason && (
                    <p className="text-[#5a4136]">{`Reason: ${partner.deactivation_reason}`}</p>
                  )}
                </Card>
              ))
            )}

            <WithdrawalsSection />

            <AdminAppSettings />

            <SectionTitle>Phone booking simulator</SectionTitle>
            <PhoneBookingSimulator />

            <SectionTitle>Recent escalations</SectionTitle>
            {data.escalations.length === 0 ? (
              <p className="text-[11px] text-slate-400">None yet.</p>
            ) : (
              data.escalations.map((escalation) => (
                <Card
                  key={escalation.id}
                  className={escalation.status === 'OVERTURNED' ? 'opacity-60' : ''}
                >
                  <div className="flex justify-between gap-2">
                    <p className="font-bold text-[#0b1c30]">
                      {`${escalation.partner_name}: ${escalation.severity === 'STRIKE' ? 'Strike' : 'Warning'}`}
                    </p>
                    {escalation.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => overturn(escalation)}
                        className="text-[#4e5c92] font-bold shrink-0"
                      >
                        Overturn
                      </button>
                    ) : (
                      <span className="text-[#006c49] font-bold shrink-0">Overturned</span>
                    )}
                  </div>
                  <p className="text-slate-500">
                    {`${escalation.source_label} • ${formatDate(escalation.created_at)}`}
                  </p>
                  <p className="text-[#5a4136]">{escalation.reason}</p>
                  {escalation.overturn_note && (
                    <p className="text-[#006c49]">{`Overturned: ${escalation.overturn_note}`}</p>
                  )}
                </Card>
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
};
