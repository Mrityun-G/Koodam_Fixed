import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { authorizedFetch } from '../lib/authorizedFetch';
import { ComplaintPanel } from './ComplaintPanel';

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';

const scoreTone = (score) => {
  if (score >= 90) return 'text-[#006c49] bg-[#c8f7e1]/60';
  if (score >= 60) return 'text-amber-700 bg-amber-50';
  return 'text-red-600 bg-red-50';
};

// Partner home tab: their reliability score, any suspension, complaints
// waiting for a reply, and the escalations on their record.
export const PartnerReliability = () => {
  const { partnerProfile } = useApp();
  const partnerId = partnerProfile?.id;

  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!partnerId) return;

    try {
      setRecord(
        await authorizedFetch(
          `/partners/${encodeURIComponent(partnerId)}/reliability`
        )
      );
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [partnerId]);

  // Reload every minute so new complaints show up while the app is open
  useEffect(() => {
    load();

    const timer = setInterval(load, 60000);

    return () => clearInterval(timer);
  }, [load]);

  if (!record) {
    return error ? (
      <p className="text-[11px] text-red-500 px-1">{`Couldn't load your reliability record: ${error}`}</p>
    ) : null;
  }

  const waiting = record.complaints.filter((complaint) => complaint.status === 'OPEN');
  const score = Math.round(record.reliability_score);
  const activeEscalations = record.escalations.filter(
    (escalation) => escalation.status === 'ACTIVE'
  );

  return (
    <section className="space-y-2">
      {record.deactivated && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-3.5">
          <p className="text-xs font-extrabold text-red-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">block</span>
            Account deactivated by KOODAM
          </p>
          <p className="text-[11px] text-red-600/80 mt-0.5">
            {record.deactivation_reason
              ? `Reason: ${record.deactivation_reason}. Customers can't book you until KOODAM reactivates your account.`
              : "Customers can't book you until KOODAM reactivates your account."}
          </p>
        </div>
      )}

      {!record.deactivated && record.suspended && (
        <div className="rounded-2xl bg-red-50 border border-red-100 p-3.5">
          <p className="text-xs font-extrabold text-red-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">block</span>
            {`Suspended until ${formatDate(record.suspended_until)}`}
          </p>
          <p className="text-[11px] text-red-600/80 mt-0.5">
            {`You got ${record.recent_strikes} strikes in ${record.strike_window_days} days, so customers can't book you for now. You can still finish jobs you've already accepted.`}
          </p>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="rounded-2xl bg-white border border-red-100 p-3.5 space-y-2">
          <p className="text-xs font-extrabold text-red-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">report</span>
            {waiting.length === 1
              ? 'A customer reported a problem'
              : `${waiting.length} customers reported a problem`}
          </p>

          {waiting.map((complaint) => (
            <div key={complaint.id}>
              <p className="text-[11px] text-slate-500">{`${complaint.service_title} service`}</p>
              <ComplaintPanel
                bill={{ booking_id: complaint.booking_id, complaint }}
                viewer="partner"
                onChanged={load}
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-white rounded-2xl border border-slate-100 p-3.5 flex items-center gap-3 text-left"
      >
        <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center font-extrabold text-sm ${scoreTone(score)}`}>
          {score}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[#0b1c30]">Reliability score</p>
          <p className="text-[11px] text-slate-500">
            {activeEscalations.length === 0
              ? 'No escalations. Keep it up!'
              : `${record.recent_strikes} of ${record.strikes_to_suspend} strikes in the last ${record.strike_window_days} days`}
          </p>
        </div>
        <span className="material-symbols-outlined text-[18px] text-slate-300">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2 text-[11px]">
          <p className="text-slate-500">
            {`Your score starts at 100 and drops when a job is escalated: not starting or finishing an accepted job on time, not replying to a complaint in time, or a complaint KOODAM upholds. Your first one in ${record.strike_window_days} days is a warning; after that each is a strike. ${record.strikes_to_suspend} strikes means a ${record.suspension_days}-day suspension. A lower score places you lower in search.`}
          </p>

          {record.escalations.length === 0 ? (
            <p className="text-slate-400">Nothing on your record.</p>
          ) : (
            record.escalations.map((escalation) => (
              <div
                key={escalation.id}
                className={`rounded-lg p-2 ${escalation.status === 'OVERTURNED' ? 'bg-slate-50 opacity-70' : 'bg-red-50/60'}`}
              >
                <p className="font-bold text-[#0b1c30]">
                  {`${escalation.severity === 'STRIKE' ? 'Strike' : 'Warning'}: ${escalation.source_label}`}
                </p>
                <p className="text-slate-500">{`${formatDate(escalation.created_at)} • ${escalation.reason}`}</p>
                {escalation.status === 'OVERTURNED' && (
                  <p className="text-[#006c49] font-semibold">
                    {`Overturned by KOODAM${escalation.overturn_note ? `: ${escalation.overturn_note}` : ''}`}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};
