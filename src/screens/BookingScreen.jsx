import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  DEFAULT_TIME_SLOTS,
  findClash,
  getSlotStart,
  toTimeRanges
} from '../lib/schedule';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

export const BookingScreen = () => {
  const {
    selectedHelper,
    selectedService,
    setSelectedService,
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    trustFee,
    handleConfirmBooking,
    navigateTo
  } = useApp();

  // Use the selected helper's actual profile data.
  const helper = selectedHelper || {};

  const helperName =
    helper.name ||
    helper.full_name ||
    helper.fullName ||
    'Selected Helper';

  const helperTitle =
    helper.title ||
    helper.role ||
    helper.profession ||
    helper.category ||
    'Service Partner';

  const helperLocation =
    helper.location ||
    helper.area ||
    helper.neighborhood ||
    helper.address ||
    '';

  const helperAvatar =
    helper.avatar ||
    helper.profile_image ||
    helper.profileImage ||
    helper.photo_url ||
    '/logo.svg';

  const helperDescription =
    helper.about ||
    helper.bio ||
    helper.description ||
    '';

  const helperLanguages = Array.isArray(helper.languages)
    ? helper.languages
    : typeof helper.languages === 'string'
      ? helper.languages.split(',').map(item => item.trim()).filter(Boolean)
      : [];

  const helperSkills = Array.isArray(helper.skills)
    ? helper.skills
    : Array.isArray(helper.specializations)
      ? helper.specializations
      : typeof helper.skills === 'string'
        ? helper.skills.split(',').map(item => item.trim()).filter(Boolean)
        : [];

  const rating = helper.rating ?? helper.average_rating;
  const reviewsCount = helper.reviewsCount ?? helper.reviews_count ?? helper.review_count;
  const completionRate = helper.completionRate ?? helper.completion_rate;
  const distance = helper.distance ?? helper.distance_km;
  const experience =
    helper.experienceYears ??
    helper.experience_years ??
    helper.experience;

  const isVerified = Boolean(
    helper.isVerified ??
    helper.is_verified ??
    helper.verified
  );

  // Identify the helper's profession for service filtering.
  const helperCategoryText = [
    helperTitle,
    helper.profession,
    helper.category,
    helper.service_type,
    helper.serviceCategory,
    helper.trade
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const serviceCategory = (() => {
    if (/plumb|pipe|tap|water leak/.test(helperCategoryText)) {
      return 'plumbing';
    }

    if (
      /air.?condition|(^|[^a-z])ac([^a-z]|$)|hvac|cooling/.test(
        helperCategoryText
      )
    ) {
      return 'ac';
    }

    if (/electric|wiring|electrical/.test(helperCategoryText)) {
      return 'electrical';
    }

    if (/clean|sanit/.test(helperCategoryText)) {
      return 'cleaning';
    }

    if (/carpent|woodwork/.test(helperCategoryText)) {
      return 'carpentry';
    }

    if (/paint|decor/.test(helperCategoryText)) {
      return 'painting';
    }

    if (/appliance/.test(helperCategoryText)) {
      return 'appliance';
    }

    return '';
  })();

  // Read services associated with this helper.
  // If the helper response has no service array, build one from
  // the individual service fields returned by the backend.
  const rawServices = useMemo(() => {
    if (Array.isArray(helper.services) && helper.services.length > 0) {
      return helper.services;
    }

    if (
      Array.isArray(helper.partner_services) &&
      helper.partner_services.length > 0
    ) {
      return helper.partner_services;
    }

    if (
      Array.isArray(helper.service_list) &&
      helper.service_list.length > 0
    ) {
      return helper.service_list;
    }

    // Backend fallback for helpers with a single service.
    if (
      helper.serviceId ||
      helper.serviceTitle ||
      helper.serviceCategory
    ) {
      return [
        {
          id: helper.serviceId || helper.id,
          service_id: helper.serviceId,
          title:
            helper.serviceTitle ||
            helper.title ||
            helper.serviceCategory ||
            'Service',
          name:
            helper.serviceTitle ||
            helper.title ||
            'Service',
          category: helper.serviceCategory || '',
          description:
            helper.serviceDescription ||
            helper.service_description ||
            '',
          price:
            helper.rate ??
            helper.price ??
            helper.base_price ??
            0,
          duration: helper.duration || ''
        }
      ];
    }

    return [];
  }, [
    helper.services,
    helper.partner_services,
    helper.service_list,
    helper.serviceId,
    helper.serviceTitle,
    helper.serviceCategory,
    helper.id,
    helper.title,
    helper.rate,
    helper.price,
    helper.base_price,
    helper.serviceDescription,
    helper.service_description,
    helper.duration
  ]);

  // Normalize service data and filter it by the helper's profession.
  const services = useMemo(() => {
    const normalize = value =>
      String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const serviceKeywords = {
      plumbing: [
        'plumb',
        'pipe',
        'tap',
        'faucet',
        'water leak',
        'drain',
        'sink',
        'toilet',
        'bathroom',
        'water tank'
      ],
      ac: [
        'air conditioner',
        'ac service',
        'ac repair',
        'ac installation',
        'ac gas',
        'cooling',
        'hvac'
      ],
      electrical: [
        'electric',
        'wiring',
        'fan installation',
        'switch',
        'socket',
        'mcb',
        'fuse',
        'short circuit'
      ],
      cleaning: [
        'clean',
        'sanit',
        'deep clean',
        'housekeeping'
      ],
      carpentry: [
        'carpent',
        'furniture',
        'wood',
        'door',
        'cabinet'
      ],
      painting: [
        'paint',
        'wall painting',
        'decor'
      ],
      appliance: [
        'appliance',
        'washing machine',
        'refrigerator',
        'fridge',
        'microwave'
      ]
    };

    const normalizedServices = rawServices
      .map((service, index) => {
        const serviceId =
          service.id ??
          service.service_id ??
          service.partner_service_id ??
          `service-${index}`;

        const price = Number(
          service.price ??
          service.base_price ??
          service.amount ??
          0
        );

        const title =
          service.title ||
          service.name ||
          service.service_name ||
          'Service';

        const desc =
          service.desc ||
          service.description ||
          service.details ||
          '';

        const duration =
          service.duration ||
          service.duration_text ||
          (service.duration_minutes
            ? `~${service.duration_minutes} mins`
            : '');

        const categoryText = normalize(
          [
            service.category,
            service.service_category,
            service.service_type,
            service.profession,
            service.trade,
            service.skill
          ]
            .filter(Boolean)
            .join(' ')
        );

        return {
          id: serviceId,
          title,
          desc,
          price,
          duration,
          tag: service.tag || service.badge || '',
          categoryText,
          searchableText: normalize(`${title} ${desc}`)
        };
      })
      .filter(
        service =>
          Number.isFinite(service.price) &&
          service.price >= 0
      );

    // If the profession cannot be identified, show all listed services.
    if (!serviceCategory) {
      return normalizedServices;
    }

    const keywords = serviceKeywords[serviceCategory] || [];

    return normalizedServices.filter(service => {
      // Use explicit category metadata when it is available.
      if (service.categoryText) {
        return service.categoryText.includes(
          normalize(serviceCategory)
        );
      }

      // Otherwise, match the service name and description.
      return keywords.some(keyword =>
        service.searchableText.includes(normalize(keyword))
      );
    });
  }, [rawServices, serviceCategory]);

  // Keep the selected service synchronized with the selected helper.
  useEffect(() => {
    if (!services.length) {
      if (selectedService?.id != null) {
        setSelectedService({
          id: null,
          title: 'No service selected',
          price: 0,
          desc: '',
          duration: ''
        });
      }

      return;
    }

    const currentService = services.find(
      service =>
        String(service.id) === String(selectedService?.id)
    );

    if (!currentService) {
      setSelectedService(services[0]);
    }
  }, [services, selectedService?.id, setSelectedService]);

  const activeService =
    services.find(
      service =>
        String(service.id) === String(selectedService?.id)
    ) || null;

  // Generate the next four calendar dates dynamically.
  const dates = useMemo(() => {
    const today = new Date();

    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + index
      );

      const label =
        index === 0
          ? 'Today'
          : index === 1
            ? 'Tomorrow'
            : date.toLocaleDateString('en-IN', {
                weekday: 'short'
              });

      const day = String(date.getDate());
      const value = `${label} ${day}`;

      const isoDate = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-');

      return {
        label,
        day,
        value,
        isoDate
      };
    });
  }, []);

  // Read availability from the selected helper's profile.
  const availability = helper.availability || {};

  const selectedDateEntry = dates.find(
    date => date.value === selectedDate
  );

  const rawSlots =
    (selectedDateEntry &&
      (
        availability[selectedDateEntry.isoDate] ||
        availability[selectedDateEntry.value]
      )) ||
    helper.available_slots ||
    helper.time_slots ||
    [];

  const listedTimes = Array.isArray(rawSlots)
    ? rawSlots
        .map(slot =>
          typeof slot === 'string'
            ? slot
            : slot?.label ||
              slot?.time ||
              slot?.start_time ||
              ''
        )
        .filter(Boolean)
    : [];

  // Partners without their own slot list get standard hourly slots
  const times = listedTimes.length > 0 ? listedTimes : DEFAULT_TIME_SLOTS;

  // Times this partner already has a job, so they can't be double booked
  const partnerId = helper.partnerId || helper.partner_id;
  const [busyRanges, setBusyRanges] = useState([]);

  useEffect(() => {
    if (!partnerId) {
      return undefined;
    }

    let cancelled = false;

    fetch(`${BACKEND_URL}/partners/${partnerId}/busy-slots`)
      .then(response => (response.ok ? response.json() : []))
      .then(slots => {
        if (!cancelled) {
          setBusyRanges(toTimeRanges(slots));
        }
      })
      .catch(error => {
        console.error('Failed to load partner busy slots:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const slotOptions = times.map(time => {
    const start = getSlotStart(selectedDateEntry?.isoDate, time);
    const isPast = start !== null && start <= Date.now();
    const isBooked = start !== null && Boolean(findClash(start, 60, busyRanges));

    return {
      time,
      isPast,
      isBooked,
      isAvailable: !isPast && !isBooked
    };
  });

  const availableSlotCount = slotOptions.filter(slot => slot.isAvailable).length;

  const isSelectedTimeAvailable = slotOptions.some(
    slot => slot.time === selectedTime && slot.isAvailable
  );

  // Clear a chosen time once it turns out to be taken or already past
  useEffect(() => {
    if (selectedTime && !isSelectedTimeAvailable) {
      setSelectedTime('');
    }
  }, [selectedTime, isSelectedTimeAvailable, setSelectedTime]);

  const numericTrustFee = Number(trustFee) || 0;
  const servicePrice = Number(activeService?.price) || 0;
  const totalAmount = servicePrice + numericTrustFee;

  const hasServices = services.length > 0;
  const hasSelectedService = Boolean(activeService);

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      {/* Header */}
      <header className="sticky top-0 inset-x-0 z-40 bg-[#f8f9ff]/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-slate-100">
        <div className="h-16 px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              aria-label="Go Back"
              onClick={() => navigateTo('home', 'home')}
              className="w-10 h-10 flex items-center justify-center rounded-full text-[#0b1c30] hover:bg-[#eff4ff] active:scale-95 transition-all shrink-0"
              type="button"
            >
              <span className="material-symbols-outlined text-[24px]">
                arrow_back
              </span>
            </button>

            <button
              aria-label="Go to Home"
              onClick={() => navigateTo('home', 'home')}
              className="shrink-0 active:scale-95 transition-transform"
              type="button"
            >
              <img
                alt="KOODAM Community Logo"
                className="h-7 w-auto object-contain"
                src="/logo.svg"
              />
            </button>

            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-[#0b1c30] truncate">
                Helper Profile
              </span>
              <span className="text-[11px] text-[#5a4136] truncate">
                {helperLocation || helperTitle}
              </span>
            </div>
          </div>

          <button
            aria-label="More Options"
            className="w-9 h-9 flex items-center justify-center rounded-full text-[#0b1c30] hover:bg-[#eff4ff]"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">
              share
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative w-full pb-36">
        {/* Top Banner */}
        <div className="relative w-full h-32 bg-gradient-to-r from-[#b3c1ff] via-[#dce9ff] to-[#ffdbcc] overflow-hidden">
          <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-[#a14000]/10 blur-2xl" />

          <div className="absolute left-4 bottom-2.5 flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/85 backdrop-blur-md shadow-xs">
            <span
              className="material-symbols-outlined text-[#00ae78] text-[16px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {isVerified ? 'verified' : 'handyman'}
            </span>

            <span className="text-xs font-semibold text-[#0b1c30]">
              {isVerified ? 'Verified Helper' : helperTitle}
              {helperLocation ? ` · ${helperLocation}` : ''}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-4 -mt-10 flex flex-col gap-4">
          {/* Helper Profile Card */}
          <div className="bg-white rounded-2xl p-4 shadow-md flex flex-col gap-3 relative border border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="relative">
                <img
                  className="w-[72px] h-[72px] rounded-2xl object-cover shadow-sm"
                  alt={helperName}
                  src={helperAvatar}
                  onError={event => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = '/logo.svg';
                  }}
                />

                {isVerified && (
                  <div className="absolute -bottom-1 -right-1 bg-[#00ae78] text-white rounded-full p-1 shadow-xs flex items-center justify-center">
                    <span
                      className="material-symbols-outlined text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      verified_user
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1 bg-[#dce1ff] text-[#05164b] px-2.5 py-0.5 rounded-full">
                  <span
                    className="material-symbols-outlined text-[#a14000] text-[14px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    shield
                  </span>

                  <span className="text-[10px] font-bold">
                    {isVerified
                      ? 'KOODAM Verified'
                      : 'Service Partner'}
                  </span>
                </div>

                <span className="text-[11px] text-[#006c49] font-medium flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      helper.is_available === false
                        ? 'bg-slate-400'
                        : 'bg-[#00ae78]'
                    }`}
                  />

                  {helper.is_available === false
                    ? 'Currently Unavailable'
                    : helper.availability_status ||
                      'Availability not confirmed'}
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <h2 className="text-xl font-extrabold text-[#0b1c30] tracking-tight">
                {helperName}
              </h2>

              <p className="text-xs text-[#4e5c92] font-semibold">
                {helperTitle}
              </p>

              {helperLocation && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">
                    location_on
                  </span>
                  {helperLocation}
                </p>
              )}
            </div>

            {/* Profile Metrics */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <div className="bg-[#eff4ff] rounded-xl p-2 flex flex-col items-center text-center">
                <div className="flex items-center gap-0.5 text-[#ff6a00]">
                  <span
                    className="material-symbols-outlined text-[15px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    star
                  </span>

                  <span className="text-xs font-bold text-[#0b1c30]">
                    {rating != null && Number.isFinite(Number(rating))
                      ? Number(rating).toFixed(1)
                      : '—'}
                  </span>
                </div>

                <span className="text-[10px] text-[#5a4136]">
                  {reviewsCount ?? '—'} reviews
                </span>
              </div>

              <div className="bg-[#eff4ff] rounded-xl p-2 flex flex-col items-center text-center">
                <span className="text-xs font-bold text-[#0b1c30]">
                  {completionRate != null
                    ? `${completionRate}%`
                    : '—'}
                </span>

                <span className="text-[10px] text-[#5a4136]">
                  Complete
                </span>
              </div>

              <div className="bg-[#eff4ff] rounded-xl p-2 flex flex-col items-center text-center">
                <span className="text-xs font-bold text-[#0b1c30]">
                  {distance != null
                    ? typeof distance === 'number'
                      ? `${distance} km`
                      : distance
                    : '—'}
                </span>

                <span className="text-[10px] text-[#5a4136]">
                  Away
                </span>
              </div>

              <div className="bg-[#eff4ff] rounded-xl p-2 flex flex-col items-center text-center">
                <span className="text-xs font-bold text-[#0b1c30]">
                  {experience != null
                    ? typeof experience === 'number'
                      ? `${experience}+ yrs`
                      : experience
                    : '—'}
                </span>

                <span className="text-[10px] text-[#5a4136]">
                  Exp.
                </span>
              </div>
            </div>

            {/* Verification Information */}
            {(helper.background_checked ||
              helper.insurance_coverage != null) && (
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#dce9ff] text-[#0b1c30]">
                <span className="material-symbols-outlined text-[#a14000] text-[20px] shrink-0">
                  history_edu
                </span>

                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold">
                    {helper.background_checked
                      ? 'Background Checked'
                      : 'Partner Protection'}
                  </span>

                  {helper.insurance_coverage != null && (
                    <span className="text-[10px] text-[#5a4136]">
                      Coverage: ₹
                      {Number(
                        helper.insurance_coverage
                      ).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* About Helper */}
          <div className="bg-white rounded-2xl p-4 shadow-xs flex flex-col gap-2 border border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0b1c30] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4e5c92] text-[18px]">
                  badge
                </span>
                About {helperName}
              </h3>

              {helper.neighbor_favorite && (
                <span className="text-[11px] text-[#4e5c92] bg-[#eff4ff] px-2 py-0.5 rounded-full font-medium">
                  Neighbor favorite
                </span>
              )}
            </div>

            <p className="text-xs text-[#5a4136] leading-relaxed">
              {helperDescription ||
                'This helper has not added a profile description yet.'}
            </p>

            {helperLanguages.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0b1c30] text-[11px] font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[#a14000] text-[13px]">
                    translate
                  </span>
                  {helperLanguages.join(', ')}
                </span>
              </div>
            )}

            {helperSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {helperSkills.map((skill, index) => (
                  <span
                    key={`${skill}-${index}`}
                    className="px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0b1c30] text-[11px] font-medium flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[#00ae78] text-[13px]">
                      handyman
                    </span>
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Profession-filtered Services */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0b1c30] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#a14000] text-[18px]">
                  handyman
                </span>
                Select Service Needed
              </h3>

              <span className="text-[11px] text-slate-500 font-medium">
                {serviceCategory
                  ? `${serviceCategory.charAt(0).toUpperCase()}${serviceCategory.slice(1)} services`
                  : 'Partner-listed services'}
              </span>
            </div>

            {hasServices ? (
              <div className="flex flex-col gap-2">
                {services.map(svc => {
                  const isSelected =
                    String(activeService?.id) === String(svc.id);

                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => setSelectedService(svc)}
                      className={`w-full text-left cursor-pointer p-3.5 rounded-2xl shadow-xs flex items-center justify-between transition-all border ${
                        isSelected
                          ? 'bg-[#eff4ff] border-[#ff6a00] shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-[#ff6a00]'
                              : 'bg-slate-200'
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              isSelected
                                ? 'bg-white'
                                : 'bg-transparent'
                            }`}
                          />
                        </div>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#0b1c30]">
                              {svc.title}
                            </span>

                            {svc.tag && (
                              <span className="bg-[#ff6a00]/15 text-[#ff6a00] px-1.5 py-0.2 rounded text-[9px] font-extrabold tracking-wide">
                                {svc.tag}
                              </span>
                            )}
                          </div>

                          {svc.desc && (
                            <span className="text-[11px] text-[#5a4136]">
                              {svc.desc}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 pl-2">
                        <span className="text-sm font-extrabold text-[#a14000]">
                          ₹{svc.price.toLocaleString('en-IN')}
                        </span>

                        {svc.duration && (
                          <span className="text-[10px] text-slate-400">
                            {svc.duration}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 border border-slate-100 text-center">
                <span className="material-symbols-outlined text-2xl text-slate-400">
                  handyman
                </span>

                <p className="text-sm font-semibold text-[#0b1c30] mt-1">
                  No matching services listed
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  {serviceCategory
                    ? `This helper has not listed any ${serviceCategory} services yet.`
                    : 'This helper has not added any bookable services yet.'}
                </p>
              </div>
            )}
          </div>

          {/* Date and Time Selection */}
          <div className="bg-white rounded-2xl p-4 shadow-xs flex flex-col gap-3 border border-slate-100">
            <div className="flex items-center justify-between gap-2">
  <h3 className="text-sm font-bold text-[#0b1c30] flex items-center gap-1.5">
    <span className="material-symbols-outlined text-[#4e5c92] text-[18px]">
      calendar_today
    </span>
    Choose Date & Time
  </h3>

  <label className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#eff4ff] text-[#0b1c30] text-xs font-bold cursor-pointer hover:bg-[#dce9ff]">
    <span className="material-symbols-outlined text-[17px] text-[#ff6a00]">
      calendar_month
    </span>
    <span>Calendar</span>
    <span className="material-symbols-outlined text-[17px]">
      expand_more
    </span>

    <input
      type="date"
      aria-label="Choose booking date"
      min={dates[0]?.isoDate}
      max={dates[dates.length - 1]?.isoDate}
      value={selectedDateEntry?.isoDate || ''}
      onChange={event => {
        const isoDate = event.target.value;
        if (!isoDate) return;

        const date = new Date(`${isoDate}T12:00:00`);
        const today = new Date();
        const isToday =
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth() &&
          date.getDate() === today.getDate();

        const tomorrow = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 1
        );

        const isTomorrow =
          date.getFullYear() === tomorrow.getFullYear() &&
          date.getMonth() === tomorrow.getMonth() &&
          date.getDate() === tomorrow.getDate();

        const label = isToday
          ? 'Today'
          : isTomorrow
            ? 'Tomorrow'
            : date.toLocaleDateString('en-IN', {
                weekday: 'short'
              });

        setSelectedDate(`${label} ${date.getDate()}`);
        setSelectedTime('');
      }}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    />
  </label>
</div>

<div className="text-[11px] text-[#006c49] font-bold">
  {!selectedDateEntry
    ? 'Select a date to see free slots'
    : availableSlotCount > 0
      ? `${availableSlotCount} slot${availableSlotCount === 1 ? '' : 's'} free`
      : 'Fully booked on this date'}
</div>

            {/* Dynamic Date Pills */}
            <div
  className="flex gap-2 overflow-x-auto overflow-y-hidden pb-3"
  style={{
    scrollbarWidth: 'thin',
    scrollbarColor: '#ff6a00 #eff4ff',
    WebkitOverflowScrolling: 'touch'
  }}
>
              {dates.map(date => {
                const isSelected = selectedDate === date.value;

                return (
                  <button
                    key={date.isoDate}
                    onClick={() => {
                      setSelectedDate(date.value);
                      setSelectedTime('');
                    }}
                    className={`flex flex-col items-center justify-center py-2 px-3.5 rounded-2xl shrink-0 min-w-[68px] transition-all border ${
                      isSelected
                        ? 'bg-[#ff6a00] text-white border-[#ff6a00] shadow-sm'
                        : 'bg-[#eff4ff] text-[#0b1c30] border-transparent hover:bg-slate-100'
                    }`}
                    type="button"
                  >
                    <span
                      className={`text-[10px] uppercase font-bold ${
                        isSelected
                          ? 'text-white'
                          : 'text-[#5a4136]'
                      }`}
                    >
                      {date.label}
                    </span>

                    <span className="text-base font-extrabold">
                      {date.day}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Available Time Slots */}
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-xs font-bold text-slate-500">
                Available Time Slots
              </span>

              {!selectedDateEntry ? (
                <div className="rounded-xl bg-[#eff4ff] p-3 text-xs text-slate-600">
                  Pick a date above to see this helper's free time slots.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {slotOptions.map(({ time, isPast, isBooked, isAvailable }, index) => {
                    const isSelected = selectedTime === time;

                    return (
                      <button
                        key={`${time}-${index}`}
                        onClick={() => setSelectedTime(time)}
                        disabled={!isAvailable}
                        className={`p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-all border ${
                          !isAvailable
                            ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                            : isSelected
                              ? 'bg-[#eff4ff] text-[#a14000] border-[#ff6a00]'
                              : 'bg-white hover:bg-slate-50 text-[#0b1c30] border-slate-200'
                        }`}
                        type="button"
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-slate-400">
                            schedule
                          </span>

                          <span className={!isAvailable ? 'line-through' : ''}>
                            {time}
                          </span>
                        </div>

                        {isBooked && (
                          <span className="text-[10px] bg-red-50 text-red-400 px-2 py-0.5 rounded-full font-bold">
                            Booked
                          </span>
                        )}

                        {isPast && !isBooked && (
                          <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                            Passed
                          </span>
                        )}

                        {isSelected && isAvailable && (
                          <span className="text-[10px] bg-[#ffdbcc] text-[#7b2f00] px-2 py-0.5 rounded-full font-bold">
                            Selected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="bg-white rounded-2xl p-4 shadow-xs flex flex-col gap-2.5 border border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Transparent Bill Breakdown
            </h4>

            <div className="space-y-1.5 text-xs text-[#0b1c30]">
              <div className="flex justify-between gap-3">
                <span className="text-[#5a4136]">
                  {activeService?.title || 'No service selected'}
                </span>

                <span className="font-bold shrink-0">
                  ₹{servicePrice.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span className="text-[#5a4136] flex items-center gap-1">
                  <span>Trust Shield & Neighbor Guarantee</span>

                  <span className="material-symbols-outlined text-[13px] text-[#00ae78]">
                    verified
                  </span>
                </span>

                <span className="font-bold shrink-0">
                  ₹{numericTrustFee.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between text-[#006c49] font-medium">
                <span>Platform Commission</span>
                <span>₹0 (100% to Helper)</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center bg-[#eff4ff] p-2.5 rounded-xl">
              <div>
                <span className="text-xs font-bold text-[#0b1c30] block">
                  Total Amount Payable
                </span>

                <span className="text-[10px] text-slate-500">
                  Pay via UPI or Cash after service
                </span>
              </div>

              <span className="text-lg font-extrabold text-[#a14000]">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Sticky Confirmation Bar */}
      <div className="sticky bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl shadow-[0_-4px_20px_rgba(11,28,48,0.08)] px-4 py-3 pb-safe z-40 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex flex-col min-w-0 shrink-0">
            <span className="text-[11px] text-slate-500 font-medium">
              Total Cost
            </span>

            <span className="text-xl font-extrabold text-[#0b1c30]">
              ₹{totalAmount.toLocaleString('en-IN')}
            </span>
          </div>

          <button
  onClick={handleConfirmBooking}
  disabled={
    !hasSelectedService ||
    !selectedDateEntry ||
    !isSelectedTimeAvailable ||
    helper.is_available === false
  }
  className="flex-1 py-3.5 px-4 rounded-full bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg shadow-[#ff6a00]/30 active:scale-98 transition-all flex items-center justify-center gap-1.5"
  type="button"
>
  <span>Send Service Request</span>

  <span className="material-symbols-outlined text-[18px]">
    send
  </span>
</button>
        </div>
      </div>
    </div>
  );
};