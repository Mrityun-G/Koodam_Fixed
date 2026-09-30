
import React from 'react';
import { useApp } from '../context/AppContext';

// Existing services retained as fallbacks.
// Replace these with live service data through AppContext
// when your backend or admin configuration is ready.
const DEFAULT_EMERGENCY_SERVICES = [
  {
    id: 'water-leak',
    title: 'Immediate Rooftop Water Leak Patch',
    eta: '10-15 mins',
    icon: 'roofing',
    price: '₹450'
  },
  {
    id: 'flood-barrier',
    title: 'Flood Barrier / Sandbag Dispatch',
    eta: '20 mins',
    icon: 'waves',
    price: 'Free Volunteer'
  },
  {
    id: 'electrical-safety',
    title: 'Emergency Electrical Line Cut-off & Check',
    eta: '12 mins',
    icon: 'power_off',
    price: '₹350'
  },
  {
    id: 'tree-clearing',
    title: 'Fallen Tree Branch Clearing',
    eta: '30 mins',
    icon: 'nature',
    price: 'Free Volunteer'
  }
];

export const EmergencyModal = () => {
  const app = useApp();

  const {
    isEmergencyModalOpen,
    setIsEmergencyModalOpen,
    showToast,
    location
  } = app;

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
    }. Choose an available service below or call the emergency hotline if you need immediate assistance.`;

  const emergencyServices =
    Array.isArray(app.emergencyServices) &&
    app.emergencyServices.length > 0
      ? app.emergencyServices
      : DEFAULT_EMERGENCY_SERVICES;

  if (!isEmergencyModalOpen) return null;

  const handleClose = () => {
    setIsEmergencyModalOpen(false);
  };

  const handleServiceRequest = (service) => {
    const serviceTitle =
      service.title || 'Emergency Service';

    // Preserve the existing notification behavior.
    // This does not create a backend dispatch.
    showToast(
      `Emergency dispatch triggered for: ${serviceTitle}`
    );

    setIsEmergencyModalOpen(false);
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
            Available Emergency Services
          </h4>

          {emergencyServices.length === 0 ? (
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
                No emergency services are currently listed.
              </p>
            </div>
          ) : (
            emergencyServices.map((service, index) => (
              <button
                type="button"
                key={service.id || service.service_id || index}
                onClick={() => handleServiceRequest(service)}
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
                      {service.icon || 'emergency'}
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
                      {service.title || 'Emergency Service'}
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

                      ETA: {service.eta || 'Contact for ETA'}
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
                    {service.price || 'Contact for price'}
                  </span>

                  <span
                    className="
                      text-[10px]
                      text-slate-400
                    "
                  >
                    Request
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