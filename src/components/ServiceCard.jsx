import React from 'react';
import { serviceCardImage } from '../lib/serviceImages';

const DEFAULT_ICON = 'home_repair_service';

// The photo's corners. Not rounded-xl: that is 3rem in this app's
// Tailwind config, which turns a photo this size into an oval and crops
// off heads and hands. 12px keeps the whole picture, a rectangle with
// soft corners.
const PHOTO_CORNERS = 'rounded-[12px]';

// A service as a photo card - the tile in Home's Neighborhood Services
// grid, and the look every service picker in the app shares: a 4:3
// photo, then the icon and the name centred on white underneath. Laid
// out three across, every card is the same size. A service with no
// photo (one staff added or renamed later) shows its icon on its own
// colour instead. Takes a service as the backend sends it.
export const ServiceCard = ({
  service,
  selected = false,
  caption,
  onClick,
  disabled = false
}) => {
  const image = serviceCardImage(service.title);
  const icon = service.icon || DEFAULT_ICON;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl bg-white p-1.5 flex flex-col items-center text-center border shadow-[0_2px_10px_rgba(11,28,48,0.06)] transition-all active:scale-[0.97] disabled:opacity-60 ${
        selected ? 'border-[#ff6a00] ring-1 ring-[#ff6a00]' : 'border-slate-100'
      }`}
    >
      <div className={`relative w-full aspect-[4/3] ${PHOTO_CORNERS} overflow-hidden`}>
        {image ? (
          // The name underneath says what it is
          <img
            src={image}
            alt=""
            decoding="async"
            draggable={false}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              backgroundColor: service.bg_color || '#e5eeff',
              color: service.icon_color || '#4e5c92'
            }}
          >
            <span className="material-symbols-outlined text-[30px]">{icon}</span>
          </div>
        )}

        {selected && (
          <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#ff6a00] text-white flex items-center justify-center shadow">
            <span className="material-symbols-outlined text-[14px]">check</span>
          </span>
        )}
      </div>

      <span
        aria-hidden="true"
        className="material-symbols-outlined mt-2 text-[20px] leading-none text-[#ff6a00]"
      >
        {icon}
      </span>

      {/* Room for two lines on every card, with the name centred in it,
          so each row lines up whether a name takes one line or two */}
      <span className="w-full min-h-[2.4em] mt-1 mb-0.5 px-0.5 flex items-center justify-center text-[12px] leading-[1.2]">
        <span
          className={`font-bold line-clamp-2 ${
            selected ? 'text-[#ff6a00]' : 'text-[#0b1c30]'
          }`}
        >
          {service.title}
        </span>
      </span>

      {/* Same idea for the optional line under the name */}
      {caption && (
        <span className="w-full min-h-[2.5em] mb-0.5 px-0.5 text-[10px] leading-[1.25] text-[#5a4136] line-clamp-2">
          {caption}
        </span>
      )}
    </button>
  );
};

// The card's shape while the services are still loading
export const ServiceCardSkeleton = () => (
  <div className="rounded-2xl bg-white border border-slate-100 p-1.5 flex flex-col items-center">
    <div className={`w-full aspect-[4/3] ${PHOTO_CORNERS} bg-slate-100 animate-pulse`} />
    <div className="mt-2 w-5 h-5 rounded-full bg-slate-100 animate-pulse" />
    <div className="mt-1.5 mb-1 h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
  </div>
);

// The same photo, small, for a service in a list row. Without a photo
// it falls back to the icon on the tone the row used before.
export const ServiceThumb = ({
  title,
  icon,
  fallbackClassName = 'bg-[#dce1ff] text-[#4e5c92]'
}) => {
  const image = serviceCardImage(title);
  const box = `w-14 aspect-[4/3] ${PHOTO_CORNERS} overflow-hidden shrink-0`;

  if (image) {
    return (
      <img
        src={image}
        alt=""
        decoding="async"
        draggable={false}
        className={`${box} object-cover`}
      />
    );
  }

  return (
    <div className={`${box} flex items-center justify-center ${fallbackClassName}`}>
      <span className="material-symbols-outlined text-[20px]">
        {icon || DEFAULT_ICON}
      </span>
    </div>
  );
};
