// GST on a customer's bill (same arithmetic as backend/app/tax.py).
//
// GigEzee charges it only while staff have entered a GSTIN in the admin
// settings; until then the rate is 0 and bills carry no tax. It is added
// on top of the whole bill (service, trust fee and approved extra parts)
// and split equally into CGST and SGST, as a job is always within one
// state. Worked out in whole paise, halves rounded up.

const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);

// { taxable, cgst, sgst, tax, total } for `taxable` rupees at `percent`
export const gstLines = (taxable, percent) => {
  const taxablePaise = toPaise(taxable);
  const halfPaise = Math.round((taxablePaise * (Number(percent) || 0)) / 200);

  return {
    taxable: taxablePaise / 100,
    cgst: halfPaise / 100,
    sgst: halfPaise / 100,
    tax: (2 * halfPaise) / 100,
    total: (taxablePaise + 2 * halfPaise) / 100
  };
};

// "₹1,234" or "₹1,234.50": tax makes paise common on bills
export const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;

// "9" or "2.5": half the rate, as printed next to CGST and SGST
export const halfRate = (percent) =>
  String(Math.round((Number(percent) || 0) * 50) / 100);
