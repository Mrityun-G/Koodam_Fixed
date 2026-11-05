// Photos for the service tiles, by service title (the titles are set in
// backend/app/service_catalog.py). Each is a 4:5 portrait card in
// public/services/. A service with no photo here - one staff added or
// renamed later - keeps showing its icon instead.
const SERVICE_IMAGES = {
  'Cleaning & Sanitize': '/services/cleaning.webp',
  'Electrical Works': '/services/electrical.webp',
  'Plumbing & Repair': '/services/plumbing.webp',
  'AC & Appliance': '/services/ac-appliance.webp',
  'Carpentry & Decor': '/services/carpentry.webp',
  'Painting & Decor': '/services/painting.webp',
  'Tech & Wi-Fi': '/services/tech-wifi.webp',
  'Elder & Pets': '/services/elder-pets.webp',
  'Child Care': '/services/child-care.webp'
};

export const serviceImage = (title) => SERVICE_IMAGES[title] || null;
