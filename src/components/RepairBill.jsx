import React from 'react';
import { formatRupees, halfRate } from '../lib/tax';

// The bill lines for a job: the total is the order's own figure, the lines
// explain it. Orders made before servicePrice/trustFee were stored fall
// back to working them out from the total. GST (cgst/sgst) is on top of
// everything else, and 0 on orders made while none was charged.
export const getBillLines = (order, fallbackTrustFee = 0) => {
  const total = Number(order?.totalAmount || 0);

  const approvedExtras = Object.entries(order?.extraCharges || {})
    .filter(([, charge]) => charge.status === 'APPROVED')
    .sort(([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0));

  const extrasTotal = approvedExtras.reduce(
    (sum, [, charge]) => sum + Number(charge.amount || 0),
    0
  );

  const cgst = Number(order?.cgst || 0);
  const sgst = Number(order?.sgst || 0);
  const beforeTax = total - cgst - sgst;

  const trustFee = order?.trustFee != null
    ? Number(order.trustFee)
    : Math.min(Number(fallbackTrustFee || 0), Math.max(beforeTax - extrasTotal, 0));

  const servicePrice = order?.servicePrice != null
    ? Number(order.servicePrice)
    : Math.max(beforeTax - extrasTotal - trustFee, 0);

  return {
    total,
    approvedExtras,
    servicePrice,
    trustFee,
    cgst,
    sgst,
    gstPercent: Number(order?.gstPercent || 0),
    gstin: order?.gstin || ''
  };
};

/**
 * The finished repair's photo with the bill for it, so the customer sees
 * what was done and what it costs before paying.
 */
export const RepairBill = ({ order, fallbackTrustFee = 0 }) => {
  const {
    total, approvedExtras, servicePrice, trustFee, cgst, sgst, gstPercent, gstin
  } = getBillLines(order, fallbackTrustFee);

  const hasTax = cgst + sgst > 0;

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
            className="w-full max-h-56 object-contain bg-white rounded-xl border border-[#E6E9F4]"
          />
        </a>
      )}

      <div className="rounded-xl bg-[#FFF7E0] border border-[#FFC928]/30 px-3 py-3 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#4E5C92] truncate">
            {order?.serviceTitle || 'Service'}
          </span>
          <span className="font-bold text-[#101F55] shrink-0">{formatRupees(servicePrice)}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[#4E5C92]">Trust Shield fee</span>
          <span className="font-bold text-[#101F55] shrink-0">{formatRupees(trustFee)}</span>
        </div>

        {approvedExtras.map(([chargeId, charge]) => (
          <div key={chargeId} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0 text-[#4E5C92]">
              {charge.photoUrl && (
                <img
                  src={charge.photoUrl}
                  alt={charge.item}
                  className="w-8 aspect-[4/3] object-contain bg-[#FFF7E0] shrink-0"
                />
              )}
              <span className="truncate">{charge.item} (extra part)</span>
            </span>
            <span className="font-bold text-[#101F55] shrink-0">
              {formatRupees(charge.amount)}
            </span>
          </div>
        ))}

        {hasTax && (
          <>
            <div className="border-t border-dashed border-[#E6E9F4] pt-2 flex items-center justify-between gap-2">
              <span className="text-[#4E5C92]">Subtotal</span>
              <span className="font-bold text-[#101F55] shrink-0">
                {formatRupees(total - cgst - sgst)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[#4E5C92]">{`CGST (${halfRate(gstPercent)}%)`}</span>
              <span className="font-bold text-[#101F55] shrink-0">{formatRupees(cgst)}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[#4E5C92]">{`SGST (${halfRate(gstPercent)}%)`}</span>
              <span className="font-bold text-[#101F55] shrink-0">{formatRupees(sgst)}</span>
            </div>
          </>
        )}

        <div className="border-t border-[#E6E9F4] pt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-[#101F55]">Total</span>
          <span className="text-lg font-extrabold text-[#101F55]">{formatRupees(total)}</span>
        </div>

        {hasTax && gstin && (
          <p className="text-[10px] text-[#4E5C92]/70">{`GSTIN: ${gstin}`}</p>
        )}
      </div>
    </div>
  );
};
