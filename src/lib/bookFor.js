// Booking for someone else (a guest, friend, relative or the member's
// child) and care services booked by the hour, e.g. a parent working
// late at the office booking child care at home until midnight.

export const RELATIONS = [
  { value: 'SELF', label: 'Myself', icon: 'person' },
  { value: 'GUEST', label: 'Guest', icon: 'luggage' },
  { value: 'FRIEND', label: 'Friend', icon: 'group' },
  { value: 'RELATIVE', label: 'Relative', icon: 'family_restroom' },
  { value: 'CHILD', label: 'My Child', icon: 'child_care' }
];

export const relationLabel = (value) =>
  RELATIONS.find((relation) => relation.value === value)?.label || 'Guest';

// Elder & Pets, Child Care: booked for as many hours as needed
export const isCareService = (service) =>
  String(service?.tag || '').toLowerCase() === 'care' ||
  /child|baby|nanny|sitter/i.test(service?.title || '');

// How long a service's listed price covers
export const baseMinutesOf = (service) =>
  Number(service?.durationMinutes) || 60;

export const MAX_CARE_HOURS = 12;

// Care services are priced pro rata for the hours booked; other
// services keep their listed price
export const priceForHours = (service, hours) => {
  const price = Number(service?.price) || 0;

  if (!isCareService(service) || !hours) {
    return price;
  }

  return Math.round((price * hours * 60) / baseMinutesOf(service));
};

// Care can start early morning or late evening (a 6 PM start for six
// hours runs to midnight); other jobs keep the 8 AM - 8 PM slots
const FIRST_CARE_HOUR = 6;
const LAST_CARE_HOUR = 23;

const formatHour = (hour) => {
  const suffix = hour % 24 < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:00 ${suffix}`;
};

export const CARE_TIME_SLOTS = Array.from(
  { length: LAST_CARE_HOUR - FIRST_CARE_HOUR + 1 },
  (_, index) => `Starts ${formatHour(FIRST_CARE_HOUR + index)}`
);

// "6:00 PM - 12:00 AM" for a start time and length
export const careEndLabel = (startMs, hours) => {
  if (!Number.isFinite(startMs) || !hours) return '';

  const format = (ms) =>
    new Date(ms).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit'
    });

  return `${format(startMs)} - ${format(startMs + hours * 60 * 60 * 1000)}`;
};

// Who the booking is for, as saved on the order; null when the member
// booked for themselves
export const toBookedFor = (form) => {
  if (!form || form.relation === 'SELF') {
    return null;
  }

  return {
    relation: form.relation,
    name: form.name.trim(),
    phone: form.phone.replace(/[^\d+]/g, ''),
    age: form.relation === 'CHILD' && form.age !== '' ? Number(form.age) : null,
    address: form.address.trim(),
    notes: form.notes.trim()
  };
};

// Why the form can't be sent yet, or '' when it's complete
export const bookForProblem = (form) => {
  if (!form || form.relation === 'SELF') return '';

  if (!form.name.trim()) {
    return form.relation === 'CHILD'
      ? "Enter your child's name"
      : 'Enter the name of the person the helper will meet';
  }

  if (form.relation === 'CHILD') {
    const age = Number(form.age);

    if (form.age === '' || !Number.isInteger(age) || age < 0 || age > 17) {
      return "Enter your child's age (0-17)";
    }
  } else if (form.phone.replace(/\D/g, '').length < 10) {
    return 'Enter their 10-digit phone number so the helper can reach them';
  }

  if (!form.address.trim()) {
    return 'Enter the address the helper should go to';
  }

  return '';
};

export const EMPTY_BOOK_FOR = {
  relation: 'SELF',
  name: '',
  phone: '',
  age: '',
  notes: '',
  address: ''
};
