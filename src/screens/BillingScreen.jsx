import React, { useState } from 'react';
import { SubHeader } from '../components/SubHeader';
import { BillingHistory } from '../components/BillingHistory';

export const BillingScreen = () => {
  const [bills, setBills] = useState([]);

  const paidBills = bills.filter((bill) => bill.payment_status === 'PAID');

  const totalPaid = paidBills.reduce(
    (sum, bill) => sum + (bill.amount_paid || 0),
    0
  );

  const pendingCount = bills.filter(
    (bill) => bill.status === 'COMPLETED' && bill.payment_status !== 'PAID'
  ).length;

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <SubHeader title="Billing History" />

      <main className="flex-1 flex flex-col w-full pb-10 px-4 space-y-3 pt-3">

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-xs">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Total paid
            </p>
            <p className="text-lg font-extrabold text-[#006c49]">
              ₹{totalPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-slate-500">
              {`${paidBills.length} paid ${paidBills.length === 1 ? 'job' : 'jobs'}`}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-xs">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Awaiting payment
            </p>
            <p className={`text-lg font-extrabold ${pendingCount > 0 ? 'text-amber-600' : 'text-[#0b1c30]'}`}>
              {pendingCount}
            </p>
            <p className="text-[10px] text-slate-500">
              {pendingCount === 1 ? 'completed job' : 'completed jobs'}
            </p>
          </div>
        </div>

        <BillingHistory onBillsLoaded={setBills} />
      </main>
    </div>
  );
};
