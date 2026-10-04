// Turns a spoken request ("I need a plumber, the water is leaking") into
// one of KOODAM's services, and picks the best partner for it.
// Runs entirely in the browser: no extra API calls or cost per request.

// Keys are service titles in the backend's services table (a renamed
// service needs its key renamed here too). Words are
// matched as substrings of the lower-cased transcript, so stems like
// "leak" also cover "leaking" and "leakage". Tamil, Kannada and Hindi
// words cover what the browser transcribes for those languages.
const SERVICE_KEYWORDS = {
  'Plumbing & Repair': [
    'plumb', 'leak', 'pipe', 'tap', 'water', 'drain', 'clog', 'block',
    'flush', 'toilet', 'sink', 'basin', 'geyser', 'heater', 'tank',
    'bathroom', 'shower', 'overflow', 'motor',
    'குழாய்', 'தண்ணீர்', 'கசிவு', 'ಪೈಪ್', 'ನೀರು', 'ನಲ್ಲಿ', 'नल', 'पानी', 'पाइप'
  ],
  'Electrical Works': [
    'electric', 'wiring', 'wire', 'switch', 'socket', 'plug', 'power',
    'current', 'shock', 'short circuit', 'fuse', 'mcb', 'light', 'bulb',
    'tube', 'fan', 'inverter', 'meter', 'spark',
    'மின்', 'கரண்ட்', 'ವಿದ್ಯುತ್', 'ಕರೆಂಟ್', 'बिजली', 'करंट'
  ],
  'AC & Appliance': [
    'ac ', ' ac', 'a/c', 'air condition', 'aircon', 'cooling', 'not cool',
    'gas refill', 'split ac', 'window ac',
    'ஏசி', 'ಎಸಿ', 'एसी',
    'appliance', 'fridge', 'refrigerator', 'washing machine', 'microwave',
    'oven', 'mixer', 'grinder', 'tv', 'television', 'ro ', 'purifier',
    'chimney', 'stove',
    'ஃப்ரிட்ஜ்', 'ಫ್ರಿಡ್ಜ್', 'फ्रिज'
  ],
  'Cleaning & Sanitize': [
    'clean', 'dust', 'sweep', 'mop', 'sanitiz', 'sanitis', 'deep clean',
    'maid', 'housekeep',
    'சுத்தம்', 'ಸ್ವಚ್ಛ', 'सफाई',
    'pest', 'cockroach', 'termite', 'ant', 'mosquito', 'rat', 'mice',
    'mouse', 'bug', 'insect', 'lizard',
    'கரப்பான்', 'எறும்பு', 'ಜಿರಳೆ', 'कॉकरोच', 'दीमक'
  ],
  'Carpentry & Decor': [
    'carpent', 'wood', 'door', 'furniture', 'cupboard', 'wardrobe',
    'table', 'chair', 'bed', 'hinge', 'lock', 'drawer', 'shelf',
    'தச்சு', 'கதவு', 'ಬಡಗಿ', 'ಬಾಗಿಲು', 'बढ़ई', 'दरवाजा'
  ],
  'Painting & Decor': [
    'paint', 'wall', 'colour', 'color', 'whitewash', 'putty', 'polish',
    'damp',
    'பெயிண்ட்', 'வர்ணம்', 'ಬಣ್ಣ', 'पेंट'
  ],
  'Tech & Wi-Fi': [
    'wifi', 'wi-fi', 'internet', 'router', 'modem', 'broadband', 'network',
    'laptop', 'computer', 'printer', 'cctv', 'camera', 'set top', 'dth',
    'வைஃபை', 'இணையம்', 'ವೈಫೈ', 'ಇಂಟರ್ನೆಟ್', 'वाईफाई', 'इंटरनेट'
  ],
  'Elder & Pets': [
    'elder', 'elderly', 'old age', 'grandfather', 'grandmother', 'caretaker',
    'companion', 'attendant', 'pet', 'dog', 'cat', 'puppy', 'groom',
    'முதியோர்', 'நாய்', 'ಹಿರಿಯ', 'ನಾಯಿ', 'बुजुर्ग', 'कुत्ता'
  ]
};

// Short words that would match inside unrelated words ("ant" in
// "want", "rat" in "rate") only count as whole words
const WHOLE_WORD_ONLY = new Set(['ant', 'rat', 'tap', 'bed', 'fan', 'tv', 'mice', 'pet', 'dog', 'cat', 'dth']);

const countMatches = (text, words) =>
  words.reduce((count, word) => {
    if (WHOLE_WORD_ONLY.has(word)) {
      return count + (new RegExp(`\\b${word}s?\\b`).test(text) ? 1 : 0);
    }

    return count + (text.includes(word) ? 1 : 0);
  }, 0);

/**
 * The service title the request is most likely about, or null.
 * Naming the trade outright ("plumber", "electrician") wins over
 * symptoms that could belong to several ("water" is also in "water
 * heater"), because it's counted alongside them.
 */
export const detectService = (spokenText) => {
  const text = ` ${String(spokenText || '').toLowerCase()} `;

  let best = null;
  let bestScore = 0;

  for (const [service, words] of Object.entries(SERVICE_KEYWORDS)) {
    const score = countMatches(text, words);

    if (score > bestScore) {
      best = service;
      bestScore = score;
    }
  }

  return best;
};

// Ratings from a handful of reviews are pulled towards a typical 3.5,
// so one 5-star review doesn't beat a steady 4.6 from 40 jobs
const PRIOR_RATING = 3.5;
const PRIOR_REVIEWS = 5;

const helperScore = (helper) => {
  const reviews = Number(helper.reviewsCount || 0);
  const rating = Number(helper.rating || 0);

  const adjustedRating =
    (rating * reviews + PRIOR_RATING * PRIOR_REVIEWS) /
    (reviews + PRIOR_REVIEWS);

  return (
    adjustedRating -
    reliabilityPenalty(helper) +
    (helper.policeVerified ? 0.4 : 0) +
    (helper.isVerified ? 0.3 : 0) +
    (helper.isOnline ? 0.2 : 0) +
    Number(helper.completionRate || 0) / 500
  );
};

/**
 * Rating points lost for escalations on the partner's record: every 20
 * reliability points below 100 (one strike) cost a full star.
 */
export const reliabilityPenalty = (helper) =>
  (100 - Number(helper.reliabilityScore ?? 100)) / 20;

/** The best partner offering the given service, or null. */
export const pickBestHelper = (helpers, serviceTitle) =>
  helpers
    .filter((helper) => helper.serviceTitle === serviceTitle)
    .reduce(
      (best, helper) =>
        !best || helperScore(helper) > helperScore(best) ? helper : best,
      null
    );
