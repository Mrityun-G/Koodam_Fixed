// Photos for the service tiles, by service title (the titles are set in
// backend/app/service_catalog.py). Each service has two crops of the same
// photo in public/services/: a 4:5 portrait for the Search thumbnails and
// a 4:3 landscape in wide/ for the Home grid cards. A service with no
// photo here - one staff added or renamed later - keeps showing its icon.
const SERVICE_PHOTOS = {
  'Cleaning & Sanitize': 'cleaning',
  'Electrical Works': 'electrical',
  'Plumbing & Repair': 'plumbing',
  'AC & Appliance': 'ac-appliance',
  'Carpentry & Decor': 'carpentry',
  'Painting & Decor': 'painting',
  'Tech & Wi-Fi': 'tech-wifi',
  'Elder & Pets': 'elder-pets',
  'Child Care': 'child-care'
};

const photoPath = (title, folder) => {
  const name = SERVICE_PHOTOS[title];
  return name ? `/services/${folder}${name}.webp` : null;
};

export const serviceImage = (title) => photoPath(title, '');

export const serviceCardImage = (title) => photoPath(title, 'wide/');
