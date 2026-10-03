
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { estimateEtaMinutes } from '../lib/geo';
import { helpersFromServices, withDistance } from '../lib/helpers';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

// Icon for each service category
const CATEGORY_ICONS = {
  Cleaning: 'cleaning_services',
  Electrical: 'electrical_services',
  Plumbing: 'plumbing',
  'AC Repair': 'ac_unit',
  'Appliance Repair': 'kitchen',
  Carpentry: 'carpenter',
  Painting: 'format_paint',
  'Tech & Wi-Fi': 'router',
  'Elder & Pets': 'pets',
  'Pest Control': 'pest_control'
};

// Closest first; a helper with no known distance goes last
const byDistance = (a, b) =>
  (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);

export const EmergencyModal = () => {
  const app = useApp();

  const {
    isEmergencyModalOpen,
    setIsEmergencyModalOpen,
    showToast,
    location,
    userCoords,
    handleBookHelper
  } = app;

  // Online partners for every service, loaded each time the popup opens
  const [helpers, setHelpers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEmergencyModalOpen) return;

    let isActive = true;
    setLoading(true);

    fetch(`${BACKEND_URL}/services/with-partners`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load services (${response.status})`);
        }
        return response.json();
      })
      .then((services) => {
        if (isActive) setHelpers(helpersFromServices(services));
      })
      .catch((error) => {
        console.error('Failed to load emergency services:', error);
        if (isActive) showToast('Could not load available helpers.');
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [isEmergencyModalOpen]);

  // For each service, the nearest online helper who covers the member
  const emergencyServices = useMemo(() => {
    const nearestByService = new Map();

    withDistance(helpers, userCoords)
      .sort(byDistance)
      .forEach((helper) => {
        if (!nearestByService.has(helper.serviceId)) {
          nearestByService.set(helper.serviceId, helper);
        }
      });

    return [...nearestByService.values()].sort(byDistance);
  }, [helpers, userCoords]);

  // Optional dynamic values from AppContext.
  // Existing defaults are retained for compatibility.
  const emergencyWard =
    app.emergencyWard || 'Local Emergency Support';

  const emergencyCellName =
    app.emergencyCellName || 'Emergency Assistance';

  const emergencyPhone =
    app.emergencyPhone || '112';

  const emergencyPhoneLabel =
    app.emergencyPhoneLabel ||
    `Call Emergency Hotline (${emergencyPhone})`;

  const emergencyAlertMessage =
    app.emergencyAlertMessage ||
    `Emergency assistance information for ${
      location || 'your selected area'
    }. Book the nearest available helper below, or call the emergency hotline if anyone is in danger.`;


  if (!isEmergencyModalOpen) return null;

  const handleClose = () => {
    setIsEmergencyModalOpen(false);
  };

  // Opens the normal booking screen with this helper already picked
  const handleServiceRequest = (helper) => {
    setIsEmergencyModalOpen(false);
    handleBookHelper(helper);
    showToast(`Pick the earliest free slot to book ${helper.name}.`);
  };

  return (
    <div
      className="
        fixed inset-0 z-[9998] isolate
        bg-black/60 backdrop-blur-xs
        flex items-end sm:items-center
        justify-center
        p-0 sm:p-4
        animate-in fade-in duration-200
      "
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-modal-title"
        className="
          relative z-[9999]
          w-full max-w-md
          bg-white
          rounded-t-[32px] sm:rounded-[32px]
          shadow-2xl
          flex flex-col
          overflow-hidden
          border border-red-100
          max-h-[90dvh]
          animate-in slide-in-from-bottom-8 duration-200
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="
            shrink-0
            p-5
            bg-gradient-to-r from-red-600 to-[#ff6a00]
            text-white
            flex items-start justify-between
            gap-3
          "
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="
                w-11 h-11
                rounded-2xl
                bg-white/20
                backdrop-blur-md
                flex items-center justify-center
                text-white shrink-0
              "
            >
              <span
                className="
                  material-symbols-outlined
                  text-2xl
                "
              >
                water_drop
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="
                    text-[11px]
                    font-extrabold
                    uppercase
                    tracking-wider
                    bg-white/25
                    px-2 py-0.5
                    rounded-full
                  "
                >
                  {emergencyWard}
                </span>
              </div>

              <h3
                id="emergency-modal-title"
                className="
                  font-extrabold
                  text-lg
                  tracking-tight
                  mt-1
                "
              >
                {emergencyCellName}
              </h3>

              {location && (
                <p className="text-xs text-white/85 mt-0.5 truncate">
                  {location}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close emergency assistance"
            className="
              w-8 h-8
              rounded-full
              bg-white/20
              flex items-center justify-center
              text-white
              hover:bg-white/30
              transition-colors
              shrink-0
            "
          >
            <span
              className="
                material-symbols-outlined
                text-base
              "
            >
              close
            </span>
          </button>
        </div>

        {/* Emergency Information */}
        <div
          className="
            shrink-0
            p-4
            bg-red-50
            border-b border-red-100
            flex items-start gap-3
          "
        >
          <span
            className="
              material-symbols-outlined
              text-red-600
              text-xl
              shrink-0
            "
          >
            crisis_alert
          </span>

          <p
            className="
              text-xs
              text-red-900
              leading-snug
            "
          >
            {emergencyAlertMessage}

            {location && (
              <>
                {' '}
                <span className="font-bold">
                  Area: {location}.
                </span>
              </>
            )}
          </p>
        </div>

        {/* Services List */}
        <div
          className="
            p-4
            overflow-y-auto
            overscroll-contain
            space-y-2.5
            flex-1 min-h-0
            bg-[#f8f9ff]
          "
        >
          <h4
            className="
              text-xs
              font-bold
              text-slate-500
              uppercase
              tracking-wider
              px-1
            "
          >
            Nearest available helpers
          </h4>

          {loading && emergencyServices.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Finding helpers near you…
            </p>
          ) : emergencyServices.length === 0 ? (
            <div
              className="
                p-5
                rounded-2xl
                bg-white
                border border-slate-100
                text-center
              "
            >
              <span
                className="
                  material-symbols-outlined
                  text-3xl
                  text-slate-400
                "
              >
                emergency
              </span>

              <p className="text-sm text-slate-600 mt-2">
                No helpers are online near you right now. Call the hotline below if it's urgent.
              </p>
            </div>
          ) : (
            emergencyServices.map((helper) => (
              <button
                type="button"
                key={helper.id}
                onClick={() => handleServiceRequest(helper)}
                className="
                  w-full
                  text-left
                  p-3.5
                  rounded-2xl
                  bg-white
                  border border-slate-100
                  shadow-xs
                  flex items-center justify-between
                  gap-3
                  hover:border-orange-300
                  hover:shadow-sm
                  transition-all
                  active:scale-[0.98]
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-orange-500
                "
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="
                      w-10 h-10
                      rounded-xl
                      bg-orange-50
                      text-orange-600
                      flex items-center justify-center
                      shrink-0
                    "
                  >
                    <span
                      className="
                        material-symbols-outlined
                        text-xl
                      "
                    >
                      {CATEGORY_ICONS[helper.serviceCategory] || 'home_repair_service'}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h5
                      className="
                        font-bold
                        text-xs
                        text-[#0b1c30]
                        break-words
                      "
                    >
                      {helper.serviceTitle}
                    </h5>

                    <p
                      className="
                        text-[11px]
                        text-emerald-700
                        font-medium
                        flex items-center gap-1
                        mt-1
                      "
                    >
                      <span
                        className="
                          material-symbols-outlined
                          text-[13px]
                        "
                      >
                        bolt
                      </span>

                      {helper.distanceKm == null
                        ? `${helper.name} • Nearby`
                        : `${helper.name} • ${helper.distance} • ~${estimateEtaMinutes(helper.distanceKm)} mins`}
                    </p>
                  </div>
                </div>

                <div
                  className="
                    flex flex-col
                    items-end
                    shrink-0
                    gap-1
                  "
                >
                  <span
                    className="
                      font-bold
                      text-xs
                      text-red-600
                    "
                  >
                    {`₹${helper.rate}`}
                  </span>

                  <span
                    className="
                      text-[10px]
                      text-slate-400
                    "
                  >
                    Book
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Emergency Hotline */}
        <div
          className="
            shrink-0
            p-4
            bg-white
            border-t border-slate-100
            flex items-center gap-3
          "
        >
          <a
            href={`tel:${emergencyPhone}`}
            className="
              flex-1
              py-3 px-4
              rounded-full
              bg-red-600
              hover:bg-red-700
              text-white
              font-bold
              text-sm
              shadow-md
              flex items-center justify-center
              gap-2
              active:scale-95
              transition-all
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-red-500
              focus-visible:ring-offset-2
            "
          >
            <span
              className="
                material-symbols-outlined
                text-lg
              "
            >
              call
            </span>

            <span>{emergencyPhoneLabel}</span>
          </a>
        </div>
      </div>
    </div>
  );
};