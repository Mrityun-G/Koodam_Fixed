import React from 'react';

// The bill lines for a job: the total is the order's own figure, the lines
// explain it. Orders made before servicePrice/trustFee were stored fall
// back to working them out from the total.
export const getBillLines = (order, fallbackTrustFee = 0) => {
  const total = Number(order?.totalAmount || 0);

  const approvedExtras = Object.entries(order?.extraCharges || {})
    .filter(([, charge]) => charge.status === 'APPROVED')
    .sort(([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0));

  const extrasTotal = approvedExtras.reduce(
    (sum, [, charge]) => sum + Number(charge.amount || 0),
    0
  );

  const trustFee = order?.trustFee != null
    ? Number(order.trustFee)
    : Math.min(Number(fallbackTrustFee || 0), Math.max(total - extrasTotal, 0));

  const servicePrice = order?.servicePrice != null
    ? Number(order.servicePrice)
    : Math.max(total - extrasTotal - trustFee, 0);

  return { total, approvedExtras, servicePrice, trustFee };
};

/**
 * The finished repair's photo with the bill for it, so the customer sees
 * what was done and what it costs before paying.
 */
export const RepairBill = ({ order, fallbackTrustFee = 0 }) => {
  const { total, approvedExtras, servicePrice, trustFee } =
    getBillLines(order, fallbackTrustFee);

  return (
    <div className="flex flex-col gap-3">
      {order?.repairPhotoUrl && (
        <a
          href={order.repairPhotoUrl}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          <img
            src={order.repairPhotoUrl}
            alt="Finished repair"
            className="w-full max-h-56 rounded-xl object-cover border border-slate-100"
          />
        </a>
      )}

      <div className="rounded-xl bg-[#f8f9ff] px-3 py-3 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 truncate">
            {order?.serviceTitle || 'Service'}
          </span>
          <span className="font-bold text-[#0b1c30] shrink-0">₹{servicePrice}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Trust Shield fee</span>
          <span className="font-bold text-[#0b1c30] shrink-0">₹{trustFee}</span>
        </div>

        {approvedExtras.map(([chargeId, charge]) => (
          <div key={chargeId} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0 text-slate-500">
              {charge.photoUrl && (
                <img
                  src={charge.photoUrl}
                  alt={charge.item}
                  className="w-6 h-6 rounded-md object-cover shrink-0"
                />
              )}
              <span className="truncate">{charge.item} (extra part)</span>
            </span>
            <span className="font-bold text-[#0b1c30] shrink-0">
              ₹{Number(charge.amount || 0)}
            </span>
          </div>
        ))}

        <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-[#0b1c30]">Total</span>
          <span className="text-lg font-extrabold text-[#a14000]">₹{total}</span>
        </div>
      </div>
    </div>
  );
};
