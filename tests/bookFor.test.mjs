import assert from 'node:assert/strict';
// Checks the "book for someone else" and hourly care logic.
// Run with: npm test
import * as B from '../src/lib/bookFor.js';
import * as S from '../src/lib/schedule.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };

const child = { title: 'Child Care', tag: 'Care', price: 199, durationMinutes: 60 };
const plumb = { title: 'Plumbing', tag: 'Repair', price: 299, durationMinutes: 60 };
t('Child Care counts as care', () => assert.equal(B.isCareService(child), true));
t('Elder & Pets (tag Care) counts as care', () => assert.equal(B.isCareService({ title: 'Elder & Pets', tag: 'Care' }), true));
t('Plumbing is not care', () => assert.equal(B.isCareService(plumb), false));
t('6 hrs child care = 1194', () => assert.equal(B.priceForHours(child, 6), 1194));
t('1 hr child care = 199', () => assert.equal(B.priceForHours(child, 1), 199));
t('plumbing keeps price whatever hours', () => assert.equal(B.priceForHours(plumb, 6), 299));
t('2-hour base service priced pro rata', () => assert.equal(B.priceForHours({ ...child, durationMinutes: 120 }, 3), 299));
t('care slots 6 AM .. 11 PM (18 slots)', () => {
  assert.equal(B.CARE_TIME_SLOTS.length, 18);
  assert.equal(B.CARE_TIME_SLOTS[0], 'Starts 6:00 AM');
  assert.equal(B.CARE_TIME_SLOTS[12], 'Starts 6:00 PM');
  assert.equal(B.CARE_TIME_SLOTS.at(-1), 'Starts 11:00 PM');
});
t('care slot label parses to right time', () => {
  const ms = S.getSlotStart('2026-10-07', 'Starts 6:00 PM');
  assert.equal(new Date(ms).getHours(), 18);
  assert.equal(new Date(S.getSlotStart('2026-10-07', 'Starts 12:00 PM')).getHours(), 12);
});
t('6 PM + 6 hrs ends at midnight', () => {
  const ms = S.getSlotStart('2026-10-07', 'Starts 6:00 PM');
  const label = B.careEndLabel(ms, 6);
  assert.match(label, /6:00\s*pm\s*-\s*12:00\s*am/i, label);
});
t('6-hr booking clashes with 9 PM job (60-min check would not)', () => {
  const start = S.getSlotStart('2026-10-07', 'Starts 6:00 PM');
  const job = [{ start: start + 3 * 3600e3, end: start + 4 * 3600e3 }];
  assert.ok(S.findClash(start, 360, job));
  assert.equal(S.findClash(start, 60, job), null);
});
const form = (x) => ({ ...B.EMPTY_BOOK_FOR, ...x });
t('SELF needs nothing', () => assert.equal(B.bookForProblem(form({})), ''));
t('SELF saves no recipient', () => assert.equal(B.toBookedFor(form({})), null));
t('guest without name blocked', () => assert.match(B.bookForProblem(form({ relation: 'GUEST' })), /name/));
t('guest short phone blocked', () => assert.match(B.bookForProblem(form({ relation: 'GUEST', name: 'Ravi', phone: '98765' })), /10-digit/));
t('guest without address blocked', () => assert.match(B.bookForProblem(form({ relation: 'GUEST', name: 'Ravi', phone: '98765 43210' })), /address/));
t('guest complete ok', () => assert.equal(B.bookForProblem(form({ relation: 'GUEST', name: 'Ravi', phone: '98765 43210', address: 'Anna Nagar' })), ''));
t('child age 18 blocked', () => assert.match(B.bookForProblem(form({ relation: 'CHILD', name: 'Anu', age: '18', address: 'x' })), /age/));
t('child empty age blocked', () => assert.match(B.bookForProblem(form({ relation: 'CHILD', name: 'Anu', address: 'x' })), /age/));
t('child no phone needed', () => assert.equal(B.bookForProblem(form({ relation: 'CHILD', name: 'Anu', age: '7', address: 'x' })), ''));
t('child age 0 ok', () => assert.equal(B.bookForProblem(form({ relation: 'CHILD', name: 'Anu', age: '0', address: 'x' })), ''));
t('toBookedFor cleans input', () => assert.deepEqual(
  B.toBookedFor(form({ relation: 'CHILD', name: ' Anu ', age: '7', phone: '+91 98765-43210', address: ' 12 Anna Nagar ', notes: ' pickup 3pm ' })),
  { relation: 'CHILD', name: 'Anu', phone: '+919876543210', age: 7, address: '12 Anna Nagar', notes: 'pickup 3pm' }));
t('age only kept for child', () => assert.equal(B.toBookedFor(form({ relation: 'FRIEND', name: 'A', age: '30' })).age, null));
console.log(`\n${n} checks passed`);
