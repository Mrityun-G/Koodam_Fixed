import React from 'react';
import { useApp } from '../context/AppContext';
import { Avatar } from './Avatar';
import { VerifiedTag } from './VerifiedTag';
import {
  availabilityNow,
  formatTime,
  hoursOnDate,
  hoursSummary,
  todayIso
} from '../lib/workingHours';

// One helper offering one service, as listed on Home and Search: who
// they are, how they're verified, how far away, the price, and buttons
// to chat or book.
export const HelperCard = ({ helper }) => {
  const { handleBookHelper, setIsChatOpen, setChatPartner } = useApp();

  // The days and times they work, as the partner set them
  const hoursText = hoursSummary(helper.workingHours);
  const offToday = hoursOnDate(
    todayIso(),
    helper.workingHours,
    helper.daysOff
  ).off;

  // Whether they can come now, so the member knows at a glance
  const now = availabilityNow(helper.workingHours, helper.daysOff);
  const status =
    now?.state === 'now'
      ? {
          tone: 'bg-[#c8f7e1] text-[#006c49]',
          text: `Working now · till ${formatTime(now.until)}`
        }
      : now?.state === 'later'
        ? {
            tone: 'bg-amber-50 text-amber-700',
            text: `Starts today at ${formatTime(now.from)}`
          }
        : now?.state === 'next'
          ? {
              tone: now.offToday
                ? 'bg-red-50 text-red-600'
                : 'bg-slate-100 text-slate-600',
              text: `${now.offToday ? 'Off today' : 'Done for today'} · next ${now.day} ${formatTime(now.from)}`
            }
          : offToday
            ? { tone: 'bg-red-50 text-red-600', text: 'Off today' }
            : null;

  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-shadow flex flex-col gap-2 border border-slate-100">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar
            src={helper.avatar}
            name={helper.name}
            className="w-14 h-14 rounded-2xl"
            textClassName="text-xl"
          />
          {(helper.isVerified || helper.policeVerified) && (
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#00ae78] flex items-center justify-center text-white shadow-xs">
              <span className="material-symbols-outlined text-[12px]">check</span>
            </span>
          )}
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <h3 className="font-bold text-sm text-[#0b1c30] truncate">{helper.name}</h3>
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0b1c30] text-xs shrink-0">
              <span
                className="material-symbols-outlined text-[13px] text-amber-500"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                star
              </span>
              <span className="font-bold text-[11px]">{Number(helper.rating || 0).toFixed(2)}</span>
              <span className="text-slate-400 text-[10px]">({helper.reviewsCount})</span>
            </div>
          </div>

          <p className="text-xs text-[#5a4136] truncate mt-0.5">{helper.title}</p>

          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {/* Staff approved all their ID documents */}
            {helper.isVerified ? (
              <VerifiedTag size="sm" />
            ) : (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${helper.badgeColor}`}>
                <span className="material-symbols-outlined text-[12px]">handshake</span>
                <span>{helper.badge}</span>
              </span>
            )}
            {helper.policeVerified && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#6ffbbe] text-[#002113]">
                <span className="material-symbols-outlined text-[12px]">local_police</span>
                <span>Police Verified</span>
              </span>
            )}
            <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[13px]">near_me</span>
              {helper.distance}
            </span>
          </div>

          {(status || hoursText) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 min-w-0">
              {status && (
                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${status.tone}`}>
                  {status.text}
                </span>
              )}
              {hoursText && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-[#4e5c92] min-w-0 max-w-full">
                  <span className="material-symbols-outlined text-[14px] shrink-0">schedule</span>
                  <span className="truncate">{hoursText}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Card Footer with Pricing & Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-50">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-medium">Starting from</span>
          <div className="flex items-baseline gap-0.5">
            <span className="text-base font-extrabold text-[#a14000]">
              {helper.rate}
            </span>
            <span className="text-xs text-slate-500">{helper.unit}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            aria-label={`Chat with ${helper.name}`}
            onClick={() => {
              setChatPartner({
                name: helper.name,
                avatar: helper.avatar || '',
                partnerId: helper.partnerId,
                isVerified: Boolean(helper.isVerified)
              });
              setIsChatOpen(true);
            }}
            className="w-9 h-9 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#1b2a5e] flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chat</span>
          </button>
          <button
            onClick={() => handleBookHelper(helper)}
            className="px-3.5 py-1.5 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1"
          >
            <span>Quick Book</span>
            <span className="material-symbols-outlined text-[14px]">bolt</span>
          </button>
        </div>
      </div>
    </div>
  );
};
