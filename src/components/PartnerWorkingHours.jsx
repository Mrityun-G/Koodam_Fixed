import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  DAYS,
  STARTER_HOURS,
  TIME_OPTIONS,
  formatDayOff,
  formatRange,
  formatTime,
  groupHours,
  todayIso
} from '../lib/workingHours';

// Ready-made weeks, so most partners set their hours in one tap
const PRESETS = [
  {
    label: 'Mon–Sat, 9 AM – 6 PM',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    start: '09:00',
    end: '18:00'
  },
  {
    label: 'Every day, 8 AM – 8 PM',
    days: DAYS.map((day) => day.key),
    start: '08:00',
    end: '20:00'
  },
  {
    label: 'Mon–Fri, 10 AM – 7 PM',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    start: '10:00',
    end: '19:00'
  }
];

const presetHours = (preset) =>
  Object.fromEntries(
    DAYS.map((day) => [
      day.key,
      preset.days.includes(day.key)
        ? { start: preset.start, end: preset.end }
        : null
    ])
  );

const toMinutes = (value) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

// A year ahead, the furthest the backend accepts a day off
const latestDayOff = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

const HoursTable = ({ workingHours }) => (
  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
    {groupHours(workingHours).map((group) => (
      <React.Fragment key={group.days}>
        <span className="font-semibold text-[#4E5C92]">{group.days}</span>
        <span
          className={
            group.hours
              ? 'font-bold text-[#101F55]'
              : 'font-semibold text-slate-400'
          }
        >
          {group.hours ? formatRange(group.hours) : 'Not working'}
        </span>
      </React.Fragment>
    ))}
  </div>
);

const DayOffChips = ({ days, onRemove }) => (
  <div className="flex flex-wrap gap-1.5">
    {days.map((day) => (
      <span
        key={day}
        className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-bold"
      >
        {formatDayOff(day)}
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(day)}
            aria-label={`Remove day off ${formatDayOff(day)}`}
            className="w-4 h-4 rounded-full hover:bg-red-100 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[13px]">close</span>
          </button>
        )}
      </span>
    ))}
  </div>
);

// Partner home tab: the days and times they work and their days off.
// Customers see these on the partner's card and can only book inside
// them; without any set, the partner can be booked at any standard time.
export const PartnerWorkingHours = () => {
  const { partnerStats, saveWorkingHours, showToast } = useApp();

  const savedHours = partnerStats.workingHours || null;
  const savedDaysOff = partnerStats.daysOff || [];

  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(STARTER_HOURS);
  const [daysOff, setDaysOff] = useState([]);
  const [newDayOff, setNewDayOff] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openEditor = () => {
    setHours(savedHours || STARTER_HOURS);
    setDaysOff(savedDaysOff);
    setNewDayOff('');
    setError('');
    setEditing(true);
  };

  const setDay = (key, value) => {
    setError('');
    setHours((current) => ({ ...current, [key]: value }));
  };

  // Switching a day on starts it with the hours of the nearest working
  // day, which is what most partners want anyway
  const toggleDay = (key) => {
    if (hours[key]) {
      setDay(key, null);
      return;
    }

    const template =
      DAYS.map((day) => hours[day.key]).find(Boolean) ||
      STARTER_HOURS.mon;

    setDay(key, { ...template });
  };

  const addDayOff = () => {
    if (!newDayOff) return;

    if (newDayOff < todayIso()) {
      setError('Please pick today or a later date.');
      return;
    }

    setError('');
    setDaysOff((current) =>
      current.includes(newDayOff) ? current : [...current, newDayOff].sort()
    );
    setNewDayOff('');
  };

  const problem = (() => {
    const working = DAYS.filter((day) => hours[day.key]);

    if (working.length === 0) {
      return 'Pick at least one working day. To stop jobs for now, go offline instead.';
    }

    const short = working.find(
      (day) =>
        toMinutes(hours[day.key].end) - toMinutes(hours[day.key].start) < 60
    );

    return short
      ? `${short.long}: the end time has to be at least an hour after the start.`
      : '';
  })();

  const save = async (workingHours) => {
    setSaving(true);
    setError('');

    try {
      await saveWorkingHours(workingHours, daysOff);
      showToast(
        workingHours
          ? 'Working hours saved. Customers can now see them.'
          : 'Fixed hours removed. Customers can book you any time.'
      );
      setEditing(false);
    } catch (failure) {
      setError(failure.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FFC928] text-[#101F55] flex items-center justify-center shrink-0 shadow-sm">
          <span className="material-symbols-outlined text-[20px]">schedule</span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-[#101F55]">My Working Hours</h2>
          <p className="text-[11px] text-[#4E5C92] leading-snug">
            Customers see these and can only book you inside them
          </p>
        </div>

        <button
          type="button"
          onClick={openEditor}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#FFF3D5] hover:bg-[#FFE7A8] text-[11px] font-bold text-[#101F55] active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[15px]">edit</span>
          {savedHours ? 'Change' : 'Set hours'}
        </button>
      </div>

      {savedHours ? (
        <div className="rounded-xl bg-[#FFF3D5] p-3">
          <HoursTable workingHours={savedHours} />
        </div>
      ) : (
        <p className="rounded-xl bg-[#FFF7E0] p-3 text-[11px] text-[#4E5C92] leading-relaxed">
          Not set yet, so customers can book you at any time from 8 AM to
          8 PM. Set your hours so you only get jobs when you work.
        </p>
      )}

      {savedDaysOff.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-[#4E5C92]">Days off</p>
          <DayOffChips days={savedDaysOff} />
        </div>
      )}

      {/* ---------- Editor ---------- */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="working-hours-title"
            className="w-full max-w-sm max-h-[90vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
          >
            <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <div>
                <h3
                  id="working-hours-title"
                  className="text-base font-bold text-[#101F55]"
                >
                  My Working Hours
                </h3>
                <p className="text-[11px] text-[#4E5C92]">
                  Pick your days, then your start and end times
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-[#FFF3D5] text-[#101F55] flex items-center justify-center active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {/* Quick picks */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-bold text-slate-500">Quick pick</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setError('');
                        setHours(presetHours(preset));
                      }}
                      className="px-2.5 py-1.5 rounded-full border border-[#FFE7A8] bg-[#FFF7E0] text-[11px] font-bold text-[#101F55] active:scale-95"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day by day */}
              <div className="flex flex-col divide-y divide-slate-100">
                {DAYS.map((day) => {
                  const dayHours = hours[day.key];

                  return (
                    <div key={day.key} className="flex items-center gap-2 py-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(dayHours)}
                        aria-label={`Work on ${day.long}`}
                        onClick={() => toggleDay(day.key)}
                        className="flex items-center gap-2 w-[92px] shrink-0 text-left"
                      >
                        <span
                          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                            dayHours ? 'bg-[#FFC928]' : 'bg-slate-200'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                              dayHours ? 'left-[18px]' : 'left-0.5'
                            }`}
                          />
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            dayHours ? 'text-[#101F55]' : 'text-slate-400'
                          }`}
                        >
                          {day.short}
                        </span>
                      </button>

                      {dayHours ? (
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <select
                            value={dayHours.start}
                            onChange={(event) =>
                              setDay(day.key, { ...dayHours, start: event.target.value })
                            }
                            aria-label={`${day.long} start time`}
                            className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-[#FFF3D5] px-1.5 py-1.5 text-xs font-semibold text-[#101F55] focus:outline-none focus:ring-2 focus:ring-[#FFC928]/40"
                          >
                            {TIME_OPTIONS.slice(0, -1).map((time) => (
                              <option key={time} value={time}>
                                {formatTime(time)}
                              </option>
                            ))}
                          </select>

                          <span className="text-[11px] text-slate-400">to</span>

                          <select
                            value={dayHours.end}
                            onChange={(event) =>
                              setDay(day.key, { ...dayHours, end: event.target.value })
                            }
                            aria-label={`${day.long} end time`}
                            className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-[#FFF3D5] px-1.5 py-1.5 text-xs font-semibold text-[#101F55] focus:outline-none focus:ring-2 focus:ring-[#FFC928]/40"
                          >
                            {TIME_OPTIONS.slice(1).map((time) => (
                              <option key={time} value={time}>
                                {formatTime(time)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className="flex-1 text-xs font-semibold text-slate-400">
                          Not working
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Days off */}
              <div className="flex flex-col gap-2">
                <div>
                  <p className="text-xs font-bold text-[#101F55]">Days off</p>
                  <p className="text-[11px] text-[#4E5C92]">
                    Leave, festivals or any day you can't work
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newDayOff}
                    min={todayIso()}
                    max={latestDayOff()}
                    onChange={(event) => setNewDayOff(event.target.value)}
                    aria-label="Day off"
                    className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-[#FFF3D5] px-2.5 py-2 text-xs font-semibold text-[#101F55] focus:outline-none focus:ring-2 focus:ring-[#FFC928]/40"
                  />
                  <button
                    type="button"
                    onClick={addDayOff}
                    disabled={!newDayOff}
                    className="shrink-0 px-3.5 py-2 rounded-lg bg-[#101F55] text-white text-xs font-bold disabled:opacity-40 active:scale-95"
                  >
                    Add
                  </button>
                </div>

                {daysOff.length > 0 && (
                  <DayOffChips
                    days={daysOff}
                    onRemove={(day) =>
                      setDaysOff((current) => current.filter((item) => item !== day))
                    }
                  />
                )}
              </div>

              {(error || problem) && (
                <p className="rounded-xl bg-red-50 p-2.5 text-[11px] font-semibold text-red-600">
                  {error || problem}
                </p>
              )}
            </div>

            <div className="shrink-0 px-5 pt-3 pb-5 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => save(hours)}
                disabled={saving || Boolean(problem)}
                className="w-full py-3 rounded-xl bg-[#FFC928] hover:bg-[#F5B301] disabled:opacity-50 text-[#101F55] text-sm font-bold active:scale-95 transition-all"
              >
                {saving ? 'Saving…' : 'Save working hours'}
              </button>

              {savedHours && (
                <button
                  type="button"
                  onClick={() => save(null)}
                  disabled={saving}
                  className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-[#101F55] disabled:opacity-50"
                >
                  Remove fixed hours (bookable any time)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
