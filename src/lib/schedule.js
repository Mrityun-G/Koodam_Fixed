// Shared scheduling helpers that stop a partner being double booked.

// Used when a service has no duration set
export const DEFAULT_JOB_MINUTES = 60;

// Hourly slots customers can pick from, 8 AM to 8 PM
const FIRST_SLOT_HOUR = 8;
const LAST_SLOT_HOUR = 19;

const formatHour = (hour) => {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:00 ${suffix}`;
};

// Labels like "9:00 AM - 10:00 AM", the format getScheduledTimestamp reads
export const DEFAULT_TIME_SLOTS = Array.from(
  { length: LAST_SLOT_HOUR - FIRST_SLOT_HOUR + 1 },
  (_, index) => {
    const hour = FIRST_SLOT_HOUR + index;
    return `${formatHour(hour)} - ${formatHour(hour + 1)}`;
  }
);

// Start time in ms for a slot label on a "YYYY-MM-DD" day, in local time
export const getSlotStart = (isoDate, slotLabel) => {
  const match = String(slotLabel || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);

  if (!isoDate || !match) {
    return null;
  }

  const [year, month, day] = isoDate.split('-').map(Number);
  let hours = Number(match[1]) % 12;

  if ((match[3] || '').toUpperCase() === 'PM') {
    hours += 12;
  } else if (!match[3]) {
    hours = Number(match[1]);
  }

  return new Date(year, month - 1, day, hours, Number(match[2])).getTime();
};

// Busy periods ({ start, end } ISO strings) as millisecond ranges
export const toTimeRanges = (busySlots = []) =>
  busySlots
    .map((slot) => ({
      start: new Date(slot.start).getTime(),
      end: new Date(slot.end).getTime()
    }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end));

// Accepted jobs from the partner overview as millisecond ranges
export const jobsToTimeRanges = (jobs = []) =>
  jobs
    .filter((job) => job.booking_time)
    .map((job) => {
      const start = new Date(job.booking_time).getTime();
      const minutes = Number(job.duration_minutes) || DEFAULT_JOB_MINUTES;

      return {
        id: job.booking_id,
        start,
        end: start + minutes * 60 * 1000
      };
    })
    .filter((range) => Number.isFinite(range.start));

// The first range that overlaps start..start+minutes, or null
export const findClash = (startMs, minutes, ranges) => {
  if (!Number.isFinite(startMs)) {
    return null;
  }

  const endMs = startMs + (minutes || DEFAULT_JOB_MINUTES) * 60 * 1000;

  return (
    ranges.find((range) => startMs < range.end && range.start < endMs) ||
    null
  );
};
