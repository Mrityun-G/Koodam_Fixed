import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { authorizedFetch } from '../lib/authorizedFetch';

export const COMPLAINT_REASONS = [
  { value: 'NO_SHOW', label: "Partner didn't turn up" },
  { value: 'LATE', label: 'Partner was very late' },
  { value: 'POOR_WORK', label: 'Work was poor or unfinished' },
  { value: 'OVERCHARGED', label: 'Charged more than agreed' },
  { value: 'BEHAVIOUR', label: 'Rude or unsafe behaviour' },
  { value: 'OTHER', label: 'Something else' }
];

// What each complaint status means, for the customer and for the partner
const STATUS_TEXT = {
  OPEN: {
    customer: 'Waiting for the partner to reply.',
    partner: 'Reply before the deadline, or this becomes an escalation on your record.',
    tone: 'bg-amber-50 text-amber-700'
  },
  RESPONDED: {
    customer: 'The partner replied. Are you satisfied?',
    partner: "You replied. The customer can accept your reply or ask KOODAM to review it.",
    tone: 'bg-[#dce1ff] text-[#4e5c92]'
  },
  RESOLVED: {
    customer: 'You marked this as resolved.',
    partner: 'The customer marked this as resolved. No penalty.',
    tone: 'bg-[#c8f7e1]/60 text-[#006c49]'
  },
  NEEDS_REVIEW: {
    customer: 'KOODAM is reviewing this.',
    partner: 'The customer asked KOODAM to review this. Staff will decide.',
    tone: 'bg-[#dce1ff] text-[#4e5c92]'
  },
  ESCALATED: {
    customer: "The partner didn't reply in time. It's been escalated on their record.",
    partner: "You didn't reply in time, so this was escalated on your record.",
    tone: 'bg-red-50 text-red-600'
  },
  UPHELD: {
    customer: 'KOODAM agreed with you. It has been escalated on the partner\'s record.',
    partner: 'KOODAM upheld this complaint. It was added to your record.',
    tone: 'bg-red-50 text-red-600'
  },
  DISMISSED: {
    customer: 'KOODAM reviewed this and closed it.',
    partner: 'KOODAM reviewed this and closed it. No penalty.',
    tone: 'bg-slate-50 text-slate-600'
  }
};

const formatDeadline = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';

// A booking's complaint, inside its bill.
// - viewer="customer": report a problem, then accept or escalate the reply
// - viewer="partner": reply before the deadline
// onChanged reloads the bills after any change.
export const ComplaintPanel = ({ bill, viewer, onChanged }) => {
  const { showToast } = useApp();
  const complaint = bill.complaint;
  const isPartner = viewer === 'partner';

  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState('POOR_WORK');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (path, body, successMessage) => {
    setBusy(true);
    setError('');

    try {
      await authorizedFetch(path, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      showToast(successMessage);
      setFormOpen(false);
      setText('');
      onChanged?.();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  };

  // Nothing reported: customers can report, partners see nothing
  if (!complaint) {
    if (isPartner) return null;

    if (!formOpen) {
      return (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] font-bold text-red-500 border border-red-100 rounded-xl py-2 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">report</span>
          Report a problem with this job
        </button>
      );
    }

    return (
      <div className="mt-2 rounded-xl border border-red-100 p-2.5 space-y-2">
        <p className="text-[11px] font-bold text-[#0b1c30]">What went wrong?</p>

        <select
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white"
        >
          {COMPLAINT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Tell us what happened (optional)"
          className="w-full text-xs border border-slate-200 rounded-lg p-2"
        />

        {error && <p className="text-[11px] text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setFormOpen(false)}
            className="flex-1 text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              send(
                '/complaints',
                { booking_id: bill.booking_id, reason, description: text },
                'Problem reported. The partner has been asked to reply.'
              )
            }
            className="flex-1 text-[11px] font-bold text-white bg-red-500 rounded-lg py-2 disabled:opacity-60"
          >
            {busy ? 'Sending...' : 'Report'}
          </button>
        </div>
      </div>
    );
  }

  const status = STATUS_TEXT[complaint.status] || STATUS_TEXT.OPEN;

  return (
    <div className="mt-2 rounded-xl border border-slate-100 p-2.5 space-y-1.5">
      <p className="text-[11px] font-bold text-[#0b1c30] flex items-center gap-1">
        <span className="material-symbols-outlined text-[15px] text-red-500">report</span>
        {`${isPartner ? 'Customer complaint' : 'Your complaint'}: ${complaint.reason_label}`}
      </p>

      {complaint.description && (
        <p className="text-[11px] text-[#5a4136] whitespace-pre-line">
          {`"${complaint.description}"`}
        </p>
      )}

      {complaint.partner_response && (
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase">
            {isPartner ? 'Your reply' : "Partner's reply"}
          </p>
          <p className="text-[11px] text-[#0b1c30] whitespace-pre-line">
            {complaint.partner_response}
          </p>
        </div>
      )}

      <p className={`text-[11px] font-semibold rounded-lg px-2 py-1.5 ${status.tone}`}>
        {isPartner ? status.partner : status.customer}
        {complaint.status === 'OPEN' && ` Reply by ${formatDeadline(complaint.respond_by)}.`}
      </p>

      {complaint.admin_note && (
        <p className="text-[10px] text-slate-500">{`KOODAM note: ${complaint.admin_note}`}</p>
      )}

      {error && <p className="text-[11px] text-red-500">{error}</p>}

      {/* Partner replies to an open complaint */}
      {isPartner && complaint.status === 'OPEN' && (
        <>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Explain what happened and how you'll make it right"
            className="w-full text-xs border border-slate-200 rounded-lg p-2"
          />
          <button
            type="button"
            disabled={busy || text.trim().length < 3}
            onClick={() =>
              send(
                `/complaints/${complaint.id}/respond`,
                { response: text },
                'Reply sent to the customer.'
              )
            }
            className="w-full text-[11px] font-bold text-white bg-[#ff6a00] rounded-lg py-2 disabled:opacity-60"
          >
            {busy ? 'Sending...' : 'Send reply'}
          </button>
        </>
      )}

      {/* Customer accepts or escalates the partner's reply */}
      {!isPartner && complaint.status === 'RESPONDED' && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              send(
                `/complaints/${complaint.id}/resolve`,
                null,
                'Thanks! Marked as resolved.'
              )
            }
            className="flex-1 text-[11px] font-bold text-[#006c49] border border-[#c8f7e1] rounded-lg py-2"
          >
            I'm satisfied
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              send(
                `/complaints/${complaint.id}/escalate`,
                null,
                'Sent to KOODAM for review.'
              )
            }
            className="flex-1 text-[11px] font-bold text-white bg-red-500 rounded-lg py-2"
          >
            Escalate to KOODAM
          </button>
        </div>
      )}

      {/* Customer can also close an open complaint if it sorted itself out */}
      {!isPartner && complaint.status === 'OPEN' && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            send(
              `/complaints/${complaint.id}/resolve`,
              null,
              'Marked as resolved.'
            )
          }
          className="w-full text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg py-2"
        >
          It's sorted, close this
        </button>
      )}
    </div>
  );
};
