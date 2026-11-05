// A partner's own working hours: the days of the week they work, from
// what time to what time, and their dates off. Partners set them on
// their dashboard; customers see them on the helper card and can only
// book times inside them. Stored by the backend (app/working_hours.py):
//
//   workingHours = { mon: { start: '09:00', end: '18:00' }, ..., sun: null }
//   daysOff      = ['2026-11-14', ...]
//
// workingHours null = the partner never set any, so any standard time
// can be booked, as before.

export const DAYS = [
  { key: 'mon', short: 'Mon', long: 'Monday' },
  { key: 'tue', short: 'Tue', long: 'Tuesday' },
  { key: 'wed', short: 'Wed', long: 'Wednesday' },
  { key: 'thu', short: 'Thu', long: 'Thursday' },
  { key: 'fri', short: 'Fri', long: 'Friday' },
  { key: 'sat', short: 'Sat', long: 'Saturday' },
  { key: 'sun', short: 'Sun', long: 'Sunday' }
];

// Where the editor starts for a partner who hasn't set any
export const STARTER_HOURS = {
  mon: { start: '09:00', end: '18:00' },
  tue: { start: '09:00', end: '18:00' },
  wed: { start: '09:00', end: '18:00' },
  thu: { start: '09:00', end: '18:00' },
  fri: { start: '09:00', end: '18:00' },
  sat: { start: '09:00', end: '18:00' },
  sun: null
};

// Every half hour of the day; "24:00" is midnight at the end of it
export const TIME_OPTIONS = Array.from({ length: 49 }, (_, index) => {
  const hours = Math.floor(index / 2);
  return `${String(hours).padStart(2, '0')}:${index % 2 ? '30' : '00'}`;
});

const toMinutes = (value) => {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
};

// "09:00" -> "9 AM", "13:30" -> "1:30 PM", "24:00" -> "Midnight"
export const formatTime = (value) => {
  const total = toMinutes(value);

  if (total === 0 || total === 24 * 60) return 'Midnight';
  if (total === 12 * 60) return 'Noon';

  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours < 12 ? 'AM' : 'PM';
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;

  return minutes
    ? `${twelveHour}:${String(minutes).padStart(2, '0')} ${suffix}`
    : `${twelveHour} ${suffix}`;
};

export const formatRange = (hours) =>
  `${formatTime(hours.start)} – ${formatTime(hours.end)}`;

const sameHours = (a, b) =>
  (!a && !b) || (a && b && a.start === b.start && a.end === b.end);

// Runs of days in a row with the same hours, e.g.
// [{ days: 'Mon–Fri', hours: {...} }, { days: 'Sat', hours: {...} },
//  { days: 'Sun', hours: null }]
export const groupHours = (workingHours) => {
  if (!workingHours) return [];

  const groups = [];

  DAYS.forEach((day) => {
    const hours = workingHours[day.key] || null;
    const last = groups[groups.length - 1];

    if (last && sameHours(last.hours, hours)) {
      last.to = day.short;
    } else {
      groups.push({ from: day.short, to: day.short, hours });
    }
  });

  return groups.map(({ from, to, hours }) => ({
    days: from === to ? from : `${from}–${to}`,
    hours
  }));
};

// One line for a card: "Mon–Sat · 9 AM – 6 PM", or with several
// patterns "Mon–Fri 9 AM – 6 PM, Sat 10 AM – 2 PM"
export const hoursSummary = (workingHours) => {
  const working = groupHours(workingHours).filter((group) => group.hours);

  if (working.length === 0) return '';

  if (working.length === 1) {
    return `${working[0].days} · ${formatRange(working[0].hours)}`;
  }

  return working
    .map((group) => `${group.days} ${formatRange(group.hours)}`)
    .join(', ');
};

const dayKeyOf = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  // getDay(): 0 is Sunday; DAYS starts on Monday
  return DAYS[(new Date(year, month - 1, day).getDay() + 6) % 7].key;
};

// The partner's hours on a "YYYY-MM-DD" day:
//   { off: true, reason: 'day_off' | 'weekly' }  not working that day
//   { off: false, hours: { start, end } }        working these hours
//   { off: false, hours: null }                  no fixed hours
export const hoursOnDate = (isoDate, workingHours, daysOff = []) => {
  if (!isoDate) return { off: false, hours: null };

  if (daysOff.includes(isoDate)) return { off: true, reason: 'day_off' };

  if (!workingHours) return { off: false, hours: null };

  const hours = workingHours[dayKeyOf(isoDate)];

  return hours
    ? { off: false, hours }
    : { off: true, reason: 'weekly' };
};

// Whether a job starting at startMs (on isoDate, local time) and
// lasting jobMinutes fits inside the partner's hours that day
export const fitsWorkingHours = (
  isoDate,
  startMs,
  jobMinutes,
  workingHours,
  daysOff
) => {
  const day = hoursOnDate(isoDate, workingHours, daysOff);

  if (day.off) return false;
  if (!day.hours || startMs == null) return true;

  const [year, month, date] = isoDate.split('-').map(Number);
  const midnight = new Date(year, month - 1, date).getTime();
  const opens = midnight + toMinutes(day.hours.start) * 60000;
  const closes = midnight + toMinutes(day.hours.end) * 60000;

  return startMs >= opens && startMs + jobMinutes * 60000 <= closes;
};

const isoOf = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');

// What a customer most wants to know at a glance, for the helper card:
//   { state: 'now', until }               working right now
//   { state: 'later', from }              starts later today
//   { state: 'next', day, from, offToday } next working day (2 weeks max)
//   null                                  no fixed hours, or none found
export const availabilityNow = (workingHours, daysOff = [], now = new Date()) => {
  if (!workingHours) return null;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const offToday = hoursOnDate(isoOf(now), workingHours, daysOff).off;

  for (let offset = 0; offset < 14; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const { off, hours } = hoursOnDate(isoOf(day), workingHours, daysOff);

    if (off || !hours) continue;

    if (offset === 0) {
      if (minutesNow >= toMinutes(hours.start) && minutesNow < toMinutes(hours.end)) {
        return { state: 'now', until: hours.end };
      }

      if (minutesNow < toMinutes(hours.start)) {
        return { state: 'later', from: hours.start };
      }

      continue;
    }

    return {
      state: 'next',
      day:
        offset === 1
          ? 'Tomorrow'
          : day.toLocaleDateString('en-IN', { weekday: 'short' }),
      from: hours.start,
      offToday
    };
  }

  return null;
};

// "14 Nov" for a "YYYY-MM-DD" day
export const formatDayOff = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);

  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short'
  });
};

// Today as "YYYY-MM-DD" in local time
export const todayIso = () => isoOf(new Date());
