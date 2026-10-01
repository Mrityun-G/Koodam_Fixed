import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  DEFAULT_JOB_MINUTES,
  findClash,
  jobsToTimeRanges
} from '../lib/schedule';

export const PartnerDashboard = () => {
  const {
    isPartnerOnline,
    togglePartnerDuty,
    partnerStats,
    partnerProfile,
    hasIncomingJob,
    incomingCountdown,
    incomingJobDetails,
    acceptIncomingJob,
    declineIncomingJob,
    reviews,
    showToast,
    handleSelectMember,
    navigateTo,
    isSharingLocation,
    startSharingLocation,
    stopSharingLocation,
    partnerLocation,
    isFirebaseConfigured,
    activeOrder,
    verifyArrivalOtp,
    setChatPartner,
    setIsChatOpen,
    logout,
    activeTab,
    setActiveTab,
    requestExtraCharge,
    partnerUpcomingJobs,
    cycleServiceRadius
  } = useApp();

  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarDay, setCalendarDay] = useState(() => new Date().toDateString());
  const [arrivalInput, setArrivalInput] = useState('');
  const [extraItem, setExtraItem] = useState('');
  const [extraAmount, setExtraAmount] = useState('');

  // ================================
  // PARTNER BOTTOM NAVIGATION
  // ================================

  const PARTNER_TABS = ['home', 'jobs', 'services', 'earnings', 'profile'];

  // Reopen on the tab we navigated back to (e.g. Profile after Edit Profile)
  const [partnerTab, setPartnerTab] = useState(
    PARTNER_TABS.includes(activeTab) ? activeTab : 'home'
  );
  const rootRef = useRef(null);

  const partnerNavItems = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'jobs', label: 'Jobs', icon: 'assignment', badge: hasIncomingJob },
    { id: 'services', label: 'Services', icon: 'add_circle' },
    { id: 'earnings', label: 'Earnings', icon: 'currency_rupee' },
    { id: 'profile', label: 'Profile', icon: 'person' }
  ];

  const switchPartnerTab = (tabId) => {
    setPartnerTab(tabId);
    setActiveTab(tabId);
    rootRef.current?.scrollIntoView({ block: 'start' });
  };

  const SERVICE_RADIUS_KM = partnerStats.serviceRadiusKm || 5;

  const getGreeting = () => {
    const hour = new Date().getHours();

    if (hour < 12) {
      return 'Good morning';
    }

    if (hour < 17) {
      return 'Good afternoon';
    }

    return 'Good evening';
  };

  // ================================
  // SCHEDULED JOBS (accepted bookings from Supabase)
  // ================================

  const JOB_STYLES = [
    { match: /electric/i, icon: 'electric_bolt', tone: 'bg-[#ffdbcc] text-[#a14000]' },
    { match: /plumb/i, icon: 'plumbing', tone: 'bg-[#dce1ff] text-[#4e5c92]' },
    { match: /clean/i, icon: 'cleaning_services', tone: 'bg-[#c8f7e1] text-[#006c49]' },
    { match: /ac|appliance/i, icon: 'mode_fan', tone: 'bg-[#d3e4fe] text-[#05164b]' },
    { match: /carpent|paint/i, icon: 'carpenter', tone: 'bg-amber-100 text-amber-700' }
  ];

  const getJobDayLabel = (date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }

    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  const scheduledJobs = partnerUpcomingJobs.map((job) => {
    const when = job.booking_time ? new Date(job.booking_time) : null;
    const style =
      JOB_STYLES.find((s) => s.match.test(`${job.category} ${job.title}`)) ||
      { icon: 'home_repair_service', tone: 'bg-[#dce1ff] text-[#4e5c92]' };

    return {
      id: job.booking_id,
      title: job.title,
      day: when ? getJobDayLabel(when) : 'Scheduled',
      time: when
        ? when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
        : '',
      price: Number(job.amount || 0),
      icon: style.icon,
      tone: style.tone,
      status: job.status === 'IN_PROGRESS' ? 'In progress' : 'Confirmed',
      customer: job.customer_name || 'KOODAM Customer',
      address: job.address || 'Nearby',
      date: when,
      startMs: when ? when.getTime() : null,
      minutes: Number(job.duration_minutes) || DEFAULT_JOB_MINUTES
    };
  });

  // Accepted jobs whose times overlap another accepted job
  const clashingJobIds = new Set(
    scheduledJobs
      .filter(job => job.startMs !== null)
      .filter(job =>
        findClash(
          job.startMs,
          job.minutes,
          jobsToTimeRanges(partnerUpcomingJobs).filter(range => range.id !== job.id)
        )
      )
      .map(job => job.id)
  );

  // Does the incoming request overlap a job the partner already has?
  const incomingClash = incomingJobDetails?.scheduledAt
    ? findClash(
        Number(incomingJobDetails.scheduledAt),
        DEFAULT_JOB_MINUTES,
        jobsToTimeRanges(partnerUpcomingJobs)
      )
    : null;

  const formatRequestTime = (ms) =>
    `${getJobDayLabel(new Date(ms))}, ${new Date(ms).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit'
    })}`;

  // ================================
  // CALENDAR (month grid of accepted jobs)
  // ================================

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const firstWeekday = new Date(calendarYear, calendarMonthIndex, 1).getDay();

  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => new Date(calendarYear, calendarMonthIndex, index + 1)
    )
  ];

  const jobsOnDay = (dayString) =>
    scheduledJobs
      .filter(job => job.date && job.date.toDateString() === dayString)
      .sort((a, b) => a.startMs - b.startMs);

  const selectedDayJobs = jobsOnDay(calendarDay);

  const shiftCalendarMonth = (step) => {
    setCalendarMonth(new Date(calendarYear, calendarMonthIndex + step, 1));
  };

  // The job being worked on now, else the next one that hasn't ended yet.
  // Old accepted jobs whose time has passed are skipped.
  const nextJob =
    scheduledJobs.find(job => job.status === 'In progress') ||
    scheduledJobs.find(job =>
      job.startMs === null ||
      job.startMs + job.minutes * 60 * 1000 > Date.now()
    );

  // ================================
  // PARTNER SERVICES STATE
  // ================================

  const [partnerServices, setPartnerServices] = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);

  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [serviceExperience, setServiceExperience] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceSaving, setServiceSaving] = useState(false);

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL ||
    'http://127.0.0.1:8000';

  // ================================
  // LOAD PARTNER SERVICES
  // ================================

  const loadPartnerServices = async () => {
    if (!partnerProfile?.id) {
      return;
    }

    try {
      setServicesLoading(true);

      const [partnerResponse, servicesResponse] =
        await Promise.all([
          fetch(
            `${BACKEND_URL}/partner-services/partner/${partnerProfile.id}`
          ),
          fetch(`${BACKEND_URL}/services/`)
        ]);

      if (!partnerResponse.ok) {
        throw new Error(
          'Failed to load partner services'
        );
      }

      if (!servicesResponse.ok) {
        throw new Error(
          'Failed to load available services'
        );
      }

      const partnerServiceData =
        await partnerResponse.json();

      const serviceData =
        await servicesResponse.json();

      setPartnerServices(partnerServiceData);
      setAvailableServices(serviceData);

    } catch (error) {
      console.error(
        'Failed to load services:',
        error
      );

      showToast(
        'Unable to load your services'
      );
    } finally {
      setServicesLoading(false);
    }
  };
  const loadAvailableServices = async () => {
  try {
    const response = await fetch(
      `${BACKEND_URL}/services/`
    );

    if (!response.ok) {
      throw new Error('Failed to load available services');
    }

    const data = await response.json();

    setAvailableServices(data);
  } catch (error) {
    console.error(
      'Failed to load available services:',
      error
    );
  }
};

  // Load services whenever partner profile becomes available
  useEffect(() => {
  loadAvailableServices();

  if (partnerProfile?.id) {
    loadPartnerServices();
  }
}, [partnerProfile?.id]);

  // ================================
  // SERVICE HELPERS
  // ================================

  const getServiceDetails = (serviceId) => {
    return availableServices.find(
      service => service.id === serviceId
    );
  };

  const getServiceTitle = (serviceId) => {
    const service = getServiceDetails(serviceId);

    return service?.title || 'Unknown Service';
  };

  const getServiceCategory = (serviceId) => {
    const service = getServiceDetails(serviceId);

    return service?.category || 'General';
  };

  const getServicePrice = (partnerService) => {
    if (
      partnerService.price_override !== null &&
      partnerService.price_override !== undefined
    ) {
      return partnerService.price_override;
    }

    const service = getServiceDetails(
      partnerService.service_id
    );

    return service?.price || 0;
  };

  // ================================
  // OPEN ADD SERVICE MODAL
  // ================================

  const openAddServiceModal = () => {
    setEditingService(null);
    setSelectedServiceId('');
    setServiceExperience('');
    setServicePrice('');
    setServiceModalOpen(true);
  };

  // ================================
  // OPEN EDIT SERVICE MODAL
  // ================================

  const openEditServiceModal = (service) => {
    setEditingService(service);

    setSelectedServiceId(
      service.service_id
    );

    setServiceExperience(
      String(service.experience_years ?? 0)
    );

    setServicePrice(
      service.price_override === null ||
      service.price_override === undefined
        ? ''
        : String(service.price_override)
    );

    setServiceModalOpen(true);
  };

  // ================================
  // CLOSE SERVICE MODAL
  // ================================

  const closeServiceModal = () => {
    if (serviceSaving) {
      return;
    }

    setServiceModalOpen(false);
    setEditingService(null);
    setSelectedServiceId('');
    setServiceExperience('');
    setServicePrice('');
  };

  // ================================
  // SAVE SERVICE
  // ================================

  const handleSaveService = async () => {
    if (!partnerProfile?.id) {
      showToast('Partner profile not available');
      return;
    }

    if (!selectedServiceId) {
      showToast('Please select a service');
      return;
    }

    const experience =
      Number(serviceExperience);

    if (
      serviceExperience !== '' &&
      (Number.isNaN(experience) || experience < 0)
    ) {
      showToast(
        'Please enter a valid experience'
      );
      return;
    }

    let priceOverride = null;

    if (servicePrice !== '') {
      const parsedPrice =
        Number(servicePrice);

      if (
        Number.isNaN(parsedPrice) ||
        parsedPrice < 0
      ) {
        showToast(
          'Please enter a valid price'
        );
        return;
      }

      priceOverride = parsedPrice;
    }

    const payload = {
      partner_id: partnerProfile.id,
      service_id: selectedServiceId,
      experience_years:
        experience || 0,
      price_override:
        priceOverride
    };

    try {
      setServiceSaving(true);

      let response;

      if (editingService) {
        // EDIT
        response = await fetch(
          `${BACKEND_URL}/partner-services/${editingService.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify(payload)
          }
        );
      } else {
        // ADD
        response = await fetch(
          `${BACKEND_URL}/partner-services/`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify(payload)
          }
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
          'Failed to save service'
        );
      }

      showToast(
        editingService
          ? 'Service updated successfully'
          : 'Service added successfully'
      );

      closeServiceModal();

      await loadPartnerServices();

    } catch (error) {
      console.error(
        'Failed to save service:',
        error
      );

      showToast(
        error.message ||
        'Unable to save service'
      );
    } finally {
      setServiceSaving(false);
    }
  };

  // ================================
  // REMOVE SERVICE
  // ================================

  const handleRemoveService = async (
    partnerService
  ) => {
    const serviceTitle =
      getServiceTitle(
        partnerService.service_id
      );

    const confirmed = window.confirm(
      `Remove "${serviceTitle}" from your services?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${BACKEND_URL}/partner-services/${partnerService.id}`,
        {
          method: 'DELETE'
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
          'Failed to remove service'
        );
      }

      showToast(
        'Service removed successfully'
      );

      await loadPartnerServices();

    } catch (error) {
      console.error(
        'Failed to remove service:',
        error
      );

      showToast(
        error.message ||
        'Unable to remove service'
      );
    }
  };

  // ================================
  // FORMAT COUNTDOWN
  // ================================

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;

    return `${m
      .toString()
      .padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}`;
  };

  // ================================
  // ARRIVAL VERIFICATION
  // ================================

  const handleVerifyArrival = () => {
    if (arrivalInput.length !== 4) {
      return;
    }

    if (verifyArrivalOtp(arrivalInput)) {
      setArrivalInput('');
    }
  };

  // ================================
  // POLICE VERIFICATION
  // ================================

  const POLICE_STATUS = {
    NOT_SUBMITTED: {
      label: 'Upload your police clearance certificate (PDF, JPG or PNG, max 5 MB)',
      tone: 'bg-slate-100 text-slate-500',
      canUpload: true
    },
    UNDER_REVIEW: {
      label: 'Certificate under review',
      tone: 'bg-amber-100 text-amber-600',
      canUpload: false
    },
    VERIFIED: {
      label: 'Police verified',
      tone: 'bg-[#00ae78]/15 text-[#006c49]',
      canUpload: false
    },
    REJECTED: {
      label: 'Certificate rejected',
      tone: 'bg-red-50 text-red-500',
      canUpload: true
    }
  };

  const [policeVerification, setPoliceVerification] = useState({
    status: 'NOT_SUBMITTED',
    rejection_reason: null
  });
  const [isUploadingPolice, setIsUploadingPolice] = useState(false);
  const policeFileInputRef = useRef(null);

  const policeStatusInfo =
    POLICE_STATUS[policeVerification.status] || POLICE_STATUS.NOT_SUBMITTED;

  useEffect(() => {
    if (!partnerProfile?.id) {
      return;
    }

    let cancelled = false;

    fetch(`${BACKEND_URL}/partners/${partnerProfile.id}/police-verification`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && !cancelled) {
          setPoliceVerification(data);
        }
      })
      .catch((error) => {
        console.error('Failed to load police verification:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [partnerProfile?.id]);

  const handlePoliceCertificateSelected = async (event) => {
    const file = event.target.files?.[0];
    // Allow picking the same file again after an error
    event.target.value = '';

    if (!file || !partnerProfile?.id) {
      return;
    }

    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      showToast('Upload a PDF, JPG or PNG file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File must be 5 MB or smaller.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingPolice(true);

    try {
      const response = await fetch(
        `${BACKEND_URL}/partners/${partnerProfile.id}/police-verification`,
        { method: 'POST', body: formData }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || 'Upload failed');
      }

      setPoliceVerification(data);
      showToast('Police certificate submitted for review.');
    } catch (error) {
      console.error('Police certificate upload failed:', error);
      showToast(error.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploadingPolice(false);
    }
  };

  // ================================
  // EXTRA PARTS COST
  // ================================

  const EXTRA_CHARGE_STATUS = {
    PENDING: { label: 'Awaiting approval', tone: 'bg-amber-100 text-amber-700' },
    APPROVED: { label: 'Approved', tone: 'bg-[#00ae78]/15 text-[#006c49]' },
    DECLINED: { label: 'Declined', tone: 'bg-red-50 text-red-500' }
  };

  const extraChargeList = Object.entries(
    activeOrder.extraCharges || {}
  ).sort(
    ([, a], [, b]) => (a.createdAt || 0) - (b.createdAt || 0)
  );

  const handleRequestExtraCharge = () => {
    if (requestExtraCharge(extraItem, extraAmount)) {
      setExtraItem('');
      setExtraAmount('');
    }
  };

  // ================================
  // NAVIGATION TO CUSTOMER
  // ================================

  const openNavigationToCustomer = () => {
    const hasCoords =
      activeOrder.customerLat != null &&
      activeOrder.customerLng != null;

    const destination = hasCoords
      ? `${activeOrder.customerLat},${activeOrder.customerLng}`
      : activeOrder.area || 'Indiranagar, Bengaluru';

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`,
      '_blank',
      'noopener'
    );
  };
  return (
    <div
      ref={rootRef}
      className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen"
    >

      {/* ========================================= */}
      {/* TOP HEADER */}
      {/* ========================================= */}

      <header className="sticky top-0 inset-x-0 z-40 bg-[#f8f9ff]/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-slate-100">
        <div className="h-16 px-4 flex items-center justify-between gap-2">

          <button
            aria-label="Go to Partner Home"
            onClick={() => switchPartnerTab('home')}
            className="flex items-center gap-2 min-w-0 active:scale-95 transition-transform text-left"
          >
            <img
              src="/logo.svg"
              alt="KOODAM Community Logo"
              className="h-8 w-auto object-contain shrink-0"
            />

            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base text-[#0b1c30] leading-none">
                Partner Hub
              </span>

              <span
                className={`text-[11px] font-bold flex items-center gap-1 mt-1 ${
                  isPartnerOnline
                    ? 'text-[#006c49]'
                    : 'text-slate-400'
                }`}
              >
                {isPartnerOnline
                  ? 'Online'
                  : 'Offline'}

                <span
                  className={`w-2 h-2 rounded-full ${
                    isPartnerOnline
                      ? 'bg-[#00ae78] animate-pulse'
                      : 'bg-slate-400'
                  }`}
                />
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
          <button
            aria-label="Notifications"
            onClick={() =>
              hasIncomingJob
                ? switchPartnerTab('jobs')
                : showToast('No new notifications')
            }
            title="Notifications"
            className="relative w-10 h-10 flex items-center justify-center rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#a14000] active:scale-95 transition-all border border-slate-200"
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{
                fontVariationSettings: hasIncomingJob
                  ? "'FILL' 1"
                  : "'FILL' 0"
              }}
            >
              notifications
            </span>

            {hasIncomingJob && (
              <span className="absolute top-1.5 right-2 w-2.5 h-2.5 rounded-full bg-[#ff6a00] ring-2 ring-[#eff4ff] animate-pulse" />
            )}
          </button>

          {/* Partner Profile Avatar */}
          <button
            aria-label="Partner Profile"
            onClick={() => switchPartnerTab('profile')}
            title="View profile & settings"
            className="w-10 h-10 flex items-center justify-center rounded-full p-0.5 hover:ring-2 hover:ring-[#ff6a00]/30 active:scale-95 transition-all"
          >
            {partnerProfile?.avatar ? (
              <img
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-slate-200"
                src={partnerProfile.avatar}
              />
            ) : (
              <span className="w-8 h-8 rounded-full bg-[#ffdbcc] text-[#a14000] ring-1 ring-slate-200 flex items-center justify-center text-sm font-bold">
                {(partnerProfile?.name || 'P').trim().charAt(0).toUpperCase()}
              </span>
            )}
          </button>
          </div>
        </div>
      </header>

      {/* ========================================= */}
      {/* MAIN CONTENT */}
      {/* ========================================= */}

      <main className="flex-1 flex flex-col relative w-full pb-6 px-4 space-y-3.5 pt-3">

        {partnerTab === 'home' && (
          <>
        {/* ========================================= */}
        {/* GREETING & ONLINE STATUS */}
        {/* ========================================= */}

        <div
          className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-md transition-colors ${
            isPartnerOnline
              ? 'bg-gradient-to-r from-[#ff6a00] via-[#a14000] to-[#7b2f00]'
              : 'bg-gradient-to-r from-slate-500 to-slate-700'
          }`}
        >
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-12 right-16 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />

          <div className="relative flex items-center justify-between gap-3">

            <div className="min-w-0">

              <p className="text-[11px] font-semibold text-white/80">
                {getGreeting()} 👋
              </p>

              <h1 className="font-extrabold text-lg leading-tight truncate">
                {partnerProfile?.name || 'Partner'}
              </h1>
            </div>

            <button
              aria-label="Toggle Online Status"
              onClick={togglePartnerDuty}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs transition-all active:scale-95 shrink-0 shadow-sm ${
                isPartnerOnline
                  ? 'bg-white text-[#006c49]'
                  : 'bg-white/20 text-white border border-white/40'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isPartnerOnline
                    ? 'bg-[#00ae78] animate-pulse'
                    : 'bg-white/70'
                }`}
              />

              {isPartnerOnline
                ? 'ONLINE'
                : 'OFFLINE'}
            </button>
          </div>

          <div className="relative mt-3 inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[11px] font-semibold">
            <span className="material-symbols-outlined text-[14px]">
              {isPartnerOnline ? 'radar' : 'bedtime'}
            </span>

            {isPartnerOnline
              ? `Receiving jobs within ${SERVICE_RADIUS_KM} km`
              : 'Go online to receive jobs'}
          </div>
        </div>

        {/* ========================================= */}
        {/* NEW JOB REQUEST */}
        {/* ========================================= */}

        {hasIncomingJob && (
          <section className="relative overflow-hidden bg-white rounded-2xl p-4 shadow-lg border border-[#ffdbcc] animate-in fade-in duration-300">

            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#ff6a00]/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between gap-2 mb-3">

              <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-[#a14000]">

                <span
                  className="material-symbols-outlined text-[18px] animate-bounce"
                  style={{
                    fontVariationSettings:
                      "'FILL' 1"
                  }}
                >
                  notifications_active
                </span>

                NEW JOB REQUEST
              </span>

              <span className="flex items-center gap-1 bg-[#ffdbcc] text-[#a14000] px-2 py-0.5 rounded-full text-xs font-bold font-mono">

                <span className="material-symbols-outlined text-[13px]">
                  timer
                </span>

                {formatTime(incomingCountdown)}
              </span>
            </div>

            <h3 className="font-bold text-base text-[#0b1c30] line-clamp-1">
              {incomingJobDetails.title}
            </h3>

            <div className="mt-2 space-y-1.5 text-xs text-[#5a4136]">

              <p className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#a14000]">
                  location_on
                </span>

                <span className="font-bold text-[#0b1c30]">
                  {incomingJobDetails.distance} away
                </span>

                • {incomingJobDetails.area}
              </p>

              <p className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#a14000]">
                  schedule
                </span>

                {incomingJobDetails.scheduledAt
                  ? formatRequestTime(incomingJobDetails.scheduledAt)
                  : `Today • ${incomingJobDetails.etaMins} mins to reach`}
              </p>

              {incomingClash && (
                <p className="flex items-center gap-1.5 text-red-500 font-bold">
                  <span className="material-symbols-outlined text-[16px]">
                    event_busy
                  </span>
                  Clashes with your job at {formatRequestTime(incomingClash.start)}
                </p>
              )}

              <p className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#a14000]">
                  payments
                </span>

                Estimated earning

                <span className="font-extrabold text-[#a14000] text-sm">
                  ₹{incomingJobDetails.payout}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 mt-4">

              <button
                onClick={declineIncomingJob}
                className="flex-1 py-2.5 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold active:scale-95 transition-all"
              >
                Reject
              </button>

              <button
                onClick={acceptIncomingJob}
                className="flex-1 py-2.5 px-3 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">
                  check_circle
                </span>

                Accept
              </button>
            </div>
          </section>
        )}

        {/* ========================================= */}
        {/* TODAY'S OVERVIEW */}
        {/* ========================================= */}

        <section className="space-y-2">

          <div className="px-1">
            <h2 className="text-sm font-bold text-[#0b1c30] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-[#ff6a00]">
                insights
              </span>
              Today's Overview
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {[
              {
                label: "Today's Earnings",
                value: `₹${Number(partnerStats.todayEarnings || 0).toLocaleString('en-IN')}`,
                icon: 'currency_rupee',
                card: 'bg-gradient-to-br from-[#fff4ec] to-[#ffdbcc] border-[#ffc9ad]',
                iconTone: 'bg-[#ff6a00] text-white',
                valueTone: 'text-[#7b2f00]',
                tab: 'earnings'
              },
              {
                label: 'Jobs Completed',
                value: partnerStats.completedJobs,
                icon: 'task_alt',
                card: 'bg-gradient-to-br from-[#ecfdf5] to-[#c8f7e1] border-[#a7ecd0]',
                iconTone: 'bg-[#00ae78] text-white',
                valueTone: 'text-[#006c49]',
                tab: 'jobs'
              },
              {
                label: 'Rating',
                value: partnerStats.rating,
                icon: 'star',
                card: 'bg-gradient-to-br from-[#fffbeb] to-[#fde9a8] border-[#fbd96b]',
                iconTone: 'bg-amber-500 text-white',
                valueTone: 'text-amber-800',
                tab: 'profile'
              },
              {
                label: 'Service Radius • tap to change',
                value: `${SERVICE_RADIUS_KM} km`,
                onClick: cycleServiceRadius,
                icon: 'radar',
                card: 'bg-gradient-to-br from-[#eef0ff] to-[#dce1ff] border-[#c5ccff]',
                iconTone: 'bg-[#4e5c92] text-white',
                valueTone: 'text-[#05164b]',
                tab: 'services'
              }
            ].map(stat => (
              <button
                key={stat.label}
                onClick={stat.onClick || (() => switchPartnerTab(stat.tab))}
                className={`rounded-2xl p-3.5 shadow-sm border flex items-center gap-3 text-left active:scale-[0.98] transition-all ${stat.card}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${stat.iconTone}`}>
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{
                      fontVariationSettings:
                        "'FILL' 1"
                    }}
                  >
                    {stat.icon}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className={`text-lg font-extrabold leading-none ${stat.valueTone}`}>
                    {stat.value}
                  </p>

                  <p className="text-[10px] font-medium text-slate-600 mt-1 truncate">
                    {stat.label}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ========================================= */}
        {/* NEXT JOB */}
        {/* ========================================= */}

        <section className="space-y-2">

          <div className="px-1">
            <h2 className="text-sm font-bold text-[#0b1c30] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-[#4e5c92]">
                event_upcoming
              </span>
              Next Job
            </h2>
          </div>

          {nextJob ? (
            <div className="relative overflow-hidden bg-white rounded-2xl p-4 pl-5 shadow-sm border border-slate-100">

              {/* Colour accent strip */}
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#ff6a00] to-[#a14000]" />

              <div className="flex items-start justify-between gap-3">

                <div className="flex items-start gap-3 min-w-0">

                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${nextJob.tone}`}>
                    <span className="material-symbols-outlined text-[20px]">
                      {nextJob.icon}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-[#0b1c30] truncate">
                      {nextJob.title}
                    </h3>

                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {[nextJob.day, nextJob.time].filter(Boolean).join(' • ')}
                    </p>

                    <p className="text-[11px] text-slate-500 truncate">
                      {`Customer: ${nextJob.customer}`}
                    </p>

                    {nextJob.status === 'In progress' && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-[#006c49] bg-[#c8f7e1] px-1.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ae78] animate-pulse" />
                        In progress
                      </span>
                    )}
                  </div>
                </div>

                <span className="font-extrabold text-sm text-[#006c49] bg-[#00ae78]/15 px-2.5 py-1 rounded-full shrink-0">
                  ₹{nextJob.price}
                </span>
              </div>

              <button
                onClick={() => switchPartnerTab('jobs')}
                className="w-full mt-3 py-2.5 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#a14000] hover:opacity-90 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                View Job
                <span className="material-symbols-outlined text-[16px]">
                  arrow_forward
                </span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 text-center">
              <p className="text-xs text-slate-400">
                No upcoming jobs scheduled.
              </p>
            </div>
          )}
        </section>
          </>
        )}

        {partnerTab === 'jobs' && (
          <>
        {/* ========================================= */}
        {/* LIVE GPS */}
        {/* ========================================= */}

        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between gap-3">

          <div className="flex items-center gap-3 min-w-0">

            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                isSharingLocation
                  ? 'bg-[#00ae78]/15 text-[#006c49]'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                my_location
              </span>
            </div>

            <div className="min-w-0">

              <p className="text-xs font-bold text-[#0b1c30]">
                Live GPS Sharing
              </p>

              <p className="text-[11px] text-slate-500 truncate">

                {!isFirebaseConfigured
                  ? 'Add Firebase keys to .env.local to enable'
                  : isSharingLocation
                  ? partnerLocation
                    ? `Broadcasting (${partnerLocation.lat.toFixed(
                        4
                      )}, ${partnerLocation.lng.toFixed(
                        4
                      )})`
                    : 'Waiting for GPS fix…'
                  : 'Customer sees your real-time location once enabled'}
              </p>
            </div>
          </div>

          <button
            aria-label="Toggle Live GPS Sharing"
            disabled={!isFirebaseConfigured}
            onClick={
              isSharingLocation
                ? stopSharingLocation
                : startSharingLocation
            }
            className={`shrink-0 px-3 py-1.5 rounded-full font-bold text-xs transition-all active:scale-95 border disabled:opacity-40 disabled:cursor-not-allowed ${
              isSharingLocation
                ? 'bg-[#ffdbcc] text-[#a14000] border-[#ffdbcc]'
                : 'bg-[#eff4ff] text-[#0b1c30] border-slate-200'
            }`}
          >
            {isSharingLocation
              ? 'Stop'
              : 'Start'}
          </button>
        </div>

        {!hasIncomingJob && (
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-slate-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">
                inbox
              </span>
            </div>

            <p className="text-[11px] text-slate-500">
              {isPartnerOnline
                ? 'No new job requests right now. New requests nearby will appear here.'
                : 'You are offline. Go online from Home to receive job requests.'}
            </p>
          </div>
        )}

        {hasIncomingJob && (
          <section className="relative overflow-hidden bg-white rounded-2xl p-4 shadow-lg border border-[#ffdbcc] animate-in fade-in duration-300">

            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#ff6a00]/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between bg-[#ffdbcc] rounded-xl px-3 py-2 text-[#7b2f00] mb-3">

              <div className="flex items-center gap-1.5 min-w-0">

                <span
                  className="material-symbols-outlined text-[18px] text-[#a14000] shrink-0 animate-bounce"
                  style={{
                    fontVariationSettings:
                      "'FILL' 1"
                  }}
                >
                  bolt
                </span>

                <span className="text-xs font-bold truncate">
                  New Request Nearby!
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0 bg-white/90 px-2 py-0.5 rounded-full shadow-2xs text-[#a14000]">

                <span className="material-symbols-outlined text-[13px]">
                  timer
                </span>

                <span className="text-xs font-bold font-mono">
                  {formatTime(
                    incomingCountdown
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-start justify-between gap-2 mb-2">

              <div className="min-w-0">

                <span className="inline-block text-[10px] font-semibold text-[#4e5c92] bg-[#dce1ff]/60 px-2 py-0.5 rounded-md mb-1">
                  {incomingJobDetails.category}
                </span>

                <h3 className="font-bold text-sm text-[#0b1c30] line-clamp-1">
                  {incomingJobDetails.title}
                </h3>

                <p className="text-xs text-[#5a4136] flex items-center gap-1 mt-0.5">

                  <span className="material-symbols-outlined text-[15px] text-[#a14000]">
                    near_me
                  </span>

                  <span className="font-bold text-[#0b1c30]">
                    {incomingJobDetails.distance}
                  </span>

                  ({incomingJobDetails.etaMins} mins away) •{' '}
                  {incomingJobDetails.area}
                </p>

                {incomingJobDetails.scheduledAt && (
                  <p className="text-xs text-[#5a4136] flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[15px] text-[#a14000]">
                      schedule
                    </span>
                    <span className="font-bold text-[#0b1c30]">
                      {formatRequestTime(incomingJobDetails.scheduledAt)}
                    </span>
                  </p>
                )}

                {incomingClash && (
                  <p className="text-xs text-red-500 font-bold flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[15px]">
                      event_busy
                    </span>
                    Clashes with your job at {formatRequestTime(incomingClash.start)}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0 bg-[#eff4ff] px-2.5 py-1 rounded-xl">

                <p className="text-[10px] text-slate-400 font-medium">
                  Est. Payout
                </p>

                <p className="text-base font-extrabold text-[#a14000]">
                  ₹{incomingJobDetails.payout}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-[#eff4ff] rounded-xl mb-3">

              <div className="flex items-center gap-2 min-w-0">

                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                  {incomingJobDetails.customerAvatar ? (
                    <img
                      className="w-full h-full object-cover"
                      alt={`Customer ${incomingJobDetails.customerName}`}
                      src={incomingJobDetails.customerAvatar}
                    />
                  ) : (
                    <span className="w-full h-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center text-xs font-bold">
                      {(incomingJobDetails.customerName || 'C').trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">

                  <p className="text-xs font-bold text-[#0b1c30] truncate">
                    {incomingJobDetails.customerName}
                  </p>

                  <div className="flex items-center gap-1 text-[10px] text-slate-500">

                    <span
                      className="material-symbols-outlined text-[13px] text-amber-500"
                      style={{
                        fontVariationSettings:
                          "'FILL' 1"
                      }}
                    >
                      star
                    </span>

                    <span className="font-bold text-[#0b1c30]">
                      {Number(incomingJobDetails.customerRating || 0).toFixed(2)}
                    </span>

                    <span>
                      • Verified Resident
                    </span>
                  </div>
                </div>
              </div>

              <span className="text-[10px] text-[#006c49] bg-[#00ae78]/15 px-2 py-0.5 rounded-full font-bold shrink-0">
                Cash / UPI
              </span>
            </div>

            <div className="flex items-center gap-2">

              <button
                onClick={declineIncomingJob}
                className="flex-1 py-2.5 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold active:scale-95 transition-all text-center"
              >
                Decline
              </button>

              <button
                onClick={acceptIncomingJob}
                className="flex-[2] py-2.5 px-3 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">
                  check_circle
                </span>

                <span>
                  Accept Job (Earn ₹
                  {incomingJobDetails.payout})
                </span>
              </button>
            </div>
          </section>
        )}

        {activeOrder.currentStep >= 3 &&
  activeOrder.currentStep < 4 && (
          <section className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-3">

            <div className="flex items-center gap-2">

              <div className="w-9 h-9 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  pin
                </span>
              </div>

              <div className="min-w-0">

                <p className="text-xs font-bold text-[#0b1c30]">
                  Verify Arrival Code
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  Ask the customer for their 4-digit code to start the job
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">

              <input
                value={arrivalInput}
                onChange={(e) =>
                  setArrivalInput(
                    e.target.value
                      .replace(/\D/g, '')
                      .slice(0, 4)
                  )
                }
                placeholder="Enter code"
                inputMode="numeric"
                className="flex-1 rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 text-sm font-mono tracking-widest text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
              />

              <button
                onClick={handleVerifyArrival}
                disabled={
                  arrivalInput.length !== 4
                }
                className="shrink-0 px-4 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold active:scale-95 transition-all"
              >
                Verify & Start
              </button>
            </div>
          </section>
        )}

        {activeOrder.currentStep === 4 &&
          activeOrder.completionOtp && (
            <section className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between gap-3">

              <div className="flex items-center gap-3 min-w-0">

                <div className="w-9 h-9 rounded-full bg-[#6ffbbe]/40 text-[#006c49] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    task_alt
                  </span>
                </div>

                <div className="min-w-0">

                  <p className="text-xs font-bold text-[#0b1c30]">
                    Share Completion Code
                  </p>

                  <p className="text-[11px] text-slate-500 truncate">
                    Give this code to the customer once the job is done
                  </p>
                </div>
              </div>

              <div className="shrink-0 bg-[#eff4ff] px-3 py-1.5 rounded-xl border border-slate-200">

                <span className="text-base tracking-widest text-[#a14000] font-extrabold font-mono">
                  {activeOrder.completionOtp}
                </span>
              </div>
            </section>
          )}

        {activeOrder.currentStep === 4 && (
          <section className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex flex-col gap-3">

            <div className="flex items-center gap-3">

              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  build
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Extra Parts Cost
                </p>

                <p className="text-[11px] text-slate-500">
                  Need a costly component? Send the estimate for the customer to approve.
                </p>
              </div>
            </div>

            {extraChargeList.length > 0 && (
              <div className="space-y-1.5">
                {extraChargeList.map(([chargeId, charge]) => (
                  <div
                    key={chargeId}
                    className="flex items-center justify-between gap-2 bg-[#f8f9ff] rounded-xl px-3 py-2"
                  >
                    <span className="text-xs text-[#0b1c30] truncate">
                      {charge.item} • ₹{charge.amount}
                    </span>

                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${EXTRA_CHARGE_STATUS[charge.status]?.tone || 'bg-slate-100 text-slate-500'}`}
                    >
                      {EXTRA_CHARGE_STATUS[charge.status]?.label || charge.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={extraItem}
                onChange={(e) => setExtraItem(e.target.value)}
                placeholder="Part (e.g. Capacitor)"
                className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 text-xs text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
              />

              <input
                value={extraAmount}
                onChange={(e) =>
                  setExtraAmount(
                    e.target.value.replace(/\D/g, '').slice(0, 6)
                  )
                }
                placeholder="₹ Amount"
                inputMode="numeric"
                className="w-24 rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 text-xs text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
              />
            </div>

            <button
              onClick={handleRequestExtraCharge}
              disabled={!extraItem.trim() || !extraAmount}
              className="w-full py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold active:scale-95 transition-all"
            >
              Send for Approval
            </button>
          </section>
        )}

        <button
          onClick={() => {
            setChatPartner({
              name: activeOrder?.customerName || 'KOODAM Customer',
              avatar: activeOrder?.customerAvatar || ''
            });
            setIsChatOpen(true);
          }}
          className="w-full flex items-center justify-between gap-3 bg-white rounded-2xl p-4 shadow-xs border border-slate-100 active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3 min-w-0">

            <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">
                chat_bubble
              </span>
            </div>

            <div className="min-w-0 text-left">

              <p className="text-xs font-bold text-[#0b1c30]">
                Message Customer
              </p>

              <p className="text-[11px] text-slate-500 truncate">
                Order {activeOrder.orderId} •{' '}
                {activeOrder.serviceTitle}
              </p>
            </div>
          </div>

          <span className="material-symbols-outlined text-[18px] text-slate-400">
            chevron_right
          </span>
        </button>

        {activeOrder.bookingStatus === 'ACCEPTED' && (
          <button
            onClick={openNavigationToCustomer}
            className="w-full flex items-center justify-between gap-3 bg-white rounded-2xl p-4 shadow-xs border border-slate-100 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">

              <div className="w-9 h-9 rounded-full bg-[#ff6a00]/15 text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  navigation
                </span>
              </div>

              <div className="min-w-0 text-left">

                <p className="text-xs font-bold text-[#0b1c30]">
                  Navigate to Customer
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  {activeOrder.customerLat != null
                    ? 'Directions to customer’s live location'
                    : `Directions to ${activeOrder.area || 'customer area'}`}
                </p>
              </div>
            </div>

            <span className="material-symbols-outlined text-[18px] text-slate-400">
              open_in_new
            </span>
          </button>
        )}

        <section className="space-y-2 pt-1">

          <div className="flex items-center justify-between px-1">

            <h2 className="text-sm font-bold text-[#0b1c30]">
              Scheduled Ahead
            </h2>

            <button
              onClick={() => setCalendarOpen(true)}
              className="text-xs text-[#a14000] font-bold hover:underline"
            >
              View Calendar
            </button>
          </div>

          <div className="space-y-2">
            {scheduledJobs.length === 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 text-center">
                <p className="text-xs text-slate-400">
                  No accepted jobs yet. Jobs you accept will appear here.
                </p>
              </div>
            )}

            {scheduledJobs.map(job => (
              <div
                key={job.id}
                className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100 flex items-start justify-between gap-3"
              >

                <div className="flex items-start gap-3 min-w-0">

                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${job.tone}`}>

                    <span className="material-symbols-outlined text-[20px]">
                      {job.icon}
                    </span>
                  </div>

                  <div className="min-w-0">

                    <div className="flex items-center gap-1.5">

                      <span className="bg-[#eff4ff] text-[#0b1c30] text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {[job.day, job.time].filter(Boolean).join(', ')}
                      </span>

                      <span className="text-[10px] text-[#006c49] font-semibold flex items-center gap-0.5">

                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ae78]" />

                        {job.status}
                      </span>

                      {clashingJobIds.has(job.id) && (
                        <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-bold">
                          Clash
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-xs text-[#0b1c30] mt-1 truncate">
                      {job.title}
                    </h4>

                    <p className="text-[11px] text-slate-500 truncate">
                      Customer: {job.customer} • {job.address}
                    </p>
                  </div>
                </div>

                <span className="font-extrabold text-xs text-[#a14000] shrink-0">
                  ₹{job.price}
                </span>
              </div>
            ))}
          </div>
        </section>
          </>
        )}

        {partnerTab === 'services' && (
          <>
        <section className="space-y-2 pt-1">

          <div className="flex items-center justify-between px-1">

            <div>
              <h2 className="text-sm font-bold text-[#0b1c30]">
                My Services
              </h2>

              <p className="text-[10px] text-slate-400 mt-0.5">
                Services you currently offer
              </p>
            </div>

            <button
              onClick={openAddServiceModal}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold active:scale-95 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[15px]">
                add
              </span>

              Add Service
            </button>
          </div>

          {servicesLoading ? (
            <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 flex items-center justify-center">

              <div className="flex items-center gap-2 text-xs text-slate-500">

                <span className="material-symbols-outlined text-[18px] animate-spin">
                  progress_activity
                </span>

                Loading your services...
              </div>
            </div>
          ) : partnerServices.length === 0 ? (
            <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 text-center">

              <div className="w-11 h-11 mx-auto rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center mb-2">

                <span className="material-symbols-outlined text-[22px]">
                  handyman
                </span>
              </div>

              <p className="text-sm font-bold text-[#0b1c30]">
                No services added yet
              </p>

              <p className="text-[11px] text-slate-500 mt-1">
                Add the services you provide to start receiving matching jobs.
              </p>

              <button
                onClick={openAddServiceModal}
                className="mt-3 px-4 py-2 rounded-full bg-[#eff4ff] text-[#a14000] text-xs font-bold border border-slate-200 active:scale-95 transition-all"
              >
                Add Your First Service
              </button>
            </div>
          ) : (
            <div className="space-y-2">

              {partnerServices.map(
                (partnerService) => {

                  const service =
                    getServiceDetails(
                      partnerService.service_id
                    );

                  const title =
                    service?.title ||
                    'Unknown Service';

                  const category =
                    service?.category ||
                    'General';

                  const price =
                    getServicePrice(
                      partnerService
                    );

                  return (
                    <div
                      key={partnerService.id}
                      className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div className="flex items-start gap-3 min-w-0">

                          <div className="w-10 h-10 rounded-xl bg-[#dce1ff] text-[#4e5c92] flex items-center justify-center shrink-0">

                            <span className="material-symbols-outlined text-[20px]">
                              handyman
                            </span>
                          </div>

                          <div className="min-w-0">

                            <div className="flex items-center gap-1.5">

                              <h3 className="text-xs font-bold text-[#0b1c30] truncate">
                                {title}
                              </h3>

                              {partnerService.is_active && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#00ae78]/15 text-[#006c49] font-bold shrink-0">
                                  ACTIVE
                                </span>
                              )}
                            </div>

                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {category}
                            </p>

                            <div className="flex items-center gap-3 mt-2">

                              <span className="flex items-center gap-1 text-[10px] text-slate-500">

                                <span className="material-symbols-outlined text-[13px]">
                                  work_history
                                </span>

                                {partnerService.experience_years}{' '}
                                {partnerService.experience_years ===
                                1
                                  ? 'year'
                                  : 'years'}
                              </span>

                              <span className="flex items-center gap-1 text-[10px] font-bold text-[#a14000]">

                                <span className="material-symbols-outlined text-[13px]">
                                  currency_rupee
                                </span>

                                ₹{price}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">

                          <button
                            onClick={() =>
                              openEditServiceModal(
                                partnerService
                              )
                            }
                            className="w-8 h-8 rounded-full bg-[#eff4ff] text-[#4e5c92] flex items-center justify-center hover:bg-[#dce9ff] active:scale-95 transition-all"
                            title="Edit service"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              edit
                            </span>
                          </button>

                          <button
                            onClick={() =>
                              handleRemoveService(
                                partnerService
                              )
                            }
                            className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-95 transition-all"
                            title="Remove service"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>
          </>
        )}

        {partnerTab === 'earnings' && (
          <>
        <section className="space-y-2">

          <div className="flex items-center justify-between px-1">

            <h2 className="text-sm font-bold text-[#0b1c30]">
              Earnings & Overview
            </h2>

            <span className="text-[10px] text-slate-400 font-medium">
              Updated Real-Time
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">

            <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100 flex flex-col justify-between">

              <div className="flex items-center justify-between text-slate-400">

                <span className="text-[11px] font-semibold text-slate-500">
                  Today's Earnings
                </span>

                <div className="w-7 h-7 rounded-full bg-[#ffdbcc] flex items-center justify-center text-[#a14000]">

                  <span className="material-symbols-outlined text-[16px]">
                    currency_rupee
                  </span>
                </div>
              </div>

              <div className="mt-2">

                <span className="text-2xl font-extrabold text-[#0b1c30] leading-none">
                  ₹{partnerStats.todayEarnings}
                </span>

                <p className="text-[11px] text-[#006c49] font-medium mt-1 flex items-center gap-1">

                  <span className="material-symbols-outlined text-[13px]">
                    task_alt
                  </span>

                  {partnerStats.completedJobs}{' '}
                  jobs completed
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100 flex flex-col justify-between">

              <div className="flex items-center justify-between text-slate-400">

                <span className="text-[11px] font-semibold text-slate-500">
                  Rating & Trust
                </span>

                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">

                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={{
                      fontVariationSettings:
                        "'FILL' 1"
                    }}
                  >
                    star
                  </span>
                </div>
              </div>

              <div className="mt-2">

                <div className="flex items-baseline gap-1">

                  <span className="text-2xl font-extrabold text-[#0b1c30] leading-none">
                    {partnerStats.rating}
                  </span>

                  <span
                    className="material-symbols-outlined text-[#ff6a00] text-[16px]"
                    style={{
                      fontVariationSettings:
                        "'FILL' 1"
                    }}
                  >
                    star
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 mt-1 truncate">
                  {partnerStats.reviews} reviews
                </p>
              </div>
            </div>

            <div className="col-span-2 bg-[#1b2a5e] text-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-slate-700">

              <div className="min-w-0">

                <p className="text-[11px] text-[#dce1ff] opacity-90">
                  Weekly Available Balance
                </p>

                <div className="flex items-baseline gap-2 mt-0.5">

                  <span className="text-xl font-bold tracking-tight">
                    ₹{partnerStats.weeklyBalance}
                  </span>

                  <span className="text-[10px] text-[#dce1ff]/80">
                    Pending clearance: ₹0
                  </span>
                </div>
              </div>

              <button
                onClick={() =>
                  setWithdrawModalOpen(true)
                }
                className="bg-[#ff6a00] hover:bg-[#a14000] text-white px-3.5 py-2 rounded-full text-xs font-bold active:scale-95 transition-all shrink-0 flex items-center gap-1 shadow-md"
              >
                <span className="material-symbols-outlined text-[15px]">
                  bolt
                </span>

                Instant Withdraw
              </button>
            </div>
          </div>
        </section>

        {/* ========================================= */}
        {/* TRANSACTIONS */}
        {/* ========================================= */}

        <section className="space-y-2 pt-1">
          <div className="px-1">
            <h2 className="text-sm font-bold text-[#0b1c30]">
              Transactions
            </h2>

            <p className="text-[10px] text-slate-400 mt-0.5">
              Payouts and job credits
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              No transactions yet. Completed jobs and withdrawals will appear here.
            </p>
          </div>
        </section>
          </>
        )}

        {partnerTab === 'profile' && (
          <>
        {/* ========================================= */}
        {/* PARTNER PROFILE */}
        {/* ========================================= */}

        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center gap-3">
          <img
            className="w-16 h-16 rounded-2xl object-cover shadow-xs shrink-0 bg-slate-100"
            alt={partnerProfile?.name || 'Partner'}
            src={
              partnerProfile?.avatar ||
              'https://lh3.googleusercontent.com/aida-public/AB6AXuD1KUaHaxx9-0zLYxXwe1qxLJ0jJYPLqCFsAjNOyvD60uX5AVr6RK2dvGziPMtH59A3aJOvnqyPP4w30p4E-MWzvTTddgIC6_jhVaV3Vv4v4zJDxVLTZ4QyusKSFBoaOmYL-PNBEX0PpYEvExLZfM8KanBylMX25cDla34VsABdoAJ66XZXU9OnKsInNA-vLjrtqUCQUpQACDv33Rg9utw_2rQVKnXf6z5x0U5ZiTD0NIvTo9L6FiJNEg'
            }
          />

          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-[#0b1c30] truncate">
              {partnerProfile?.name || 'Partner'}
            </h2>

            <p className="text-xs text-slate-500 truncate">
              {partnerProfile?.email}
            </p>

            <p className="text-xs text-slate-500 truncate">
              {partnerProfile?.phone}
            </p>

            <span className="inline-block mt-1 text-[10px] font-bold text-[#a14000] bg-[#eff4ff] px-2 py-0.5 rounded-full">
              Service Partner
            </span>
          </div>

          <button
            aria-label="Edit Profile"
            onClick={() => navigateTo('editProfile', 'profile')}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#a14000] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">
              edit
            </span>
          </button>
        </div>

        {/* ========================================= */}
        {/* VERIFICATION & DOCUMENTS */}
        {/* ========================================= */}

        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-sm font-bold text-[#0b1c30]">
              Verification & Documents
            </h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            <div className="flex items-center gap-3 p-3.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  partnerProfile?.is_verified
                    ? 'bg-[#00ae78]/15 text-[#006c49]'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{
                    fontVariationSettings:
                      "'FILL' 1"
                  }}
                >
                  {partnerProfile?.is_verified ? 'verified' : 'pending'}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Account Verification
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  {partnerProfile?.is_verified ? 'Verified' : 'Verification pending'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${policeStatusInfo.tone}`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  local_police
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Police Verification
                </p>

                <p className="text-[11px] text-slate-500">
                  {policeStatusInfo.label}
                  {policeVerification.status === 'REJECTED' &&
                    policeVerification.rejection_reason &&
                    `: ${policeVerification.rejection_reason}`}
                </p>
              </div>

              <input
                ref={policeFileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={handlePoliceCertificateSelected}
                className="hidden"
              />

              {policeStatusInfo.canUpload && (
                <button
                  onClick={() => policeFileInputRef.current?.click()}
                  disabled={isUploadingPolice}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] disabled:opacity-50 text-[#a14000] text-[11px] font-bold active:scale-95 transition-all"
                >
                  {isUploadingPolice
                    ? 'Uploading…'
                    : policeVerification.status === 'REJECTED'
                    ? 'Re-upload'
                    : 'Upload'}
                </button>
              )}
            </div>

            <button
              onClick={() => showToast('Document management is coming soon')}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  description
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Documents
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  ID proof & certificates
                </p>
              </div>

              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">
                chevron_right
              </span>
            </button>
          </div>
        </section>

        <section className="space-y-2 pt-1">

          <div className="flex items-center justify-between px-1">

            <h2 className="text-sm font-bold text-[#0b1c30]">
              Recent Reviews
            </h2>

            <span className="text-[10px] text-slate-400 font-medium">
              {reviews.length} total
            </span>
          </div>

          {reviews.length === 0 ? (
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 text-center">

              <p className="text-xs text-slate-400">
                No reviews yet. They'll show up here once a customer rates a completed job.
              </p>
            </div>
          ) : (
            <div className="space-y-2">

              {(showAllReviews ? reviews : reviews.slice(0, 3)).map(r => (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100"
                >

                  <div className="flex items-center justify-between gap-2">

                    <div className="flex items-center gap-0.5">

                      {[1, 2, 3, 4, 5].map(i => (
                        <span
                          key={i}
                          className={`material-symbols-outlined text-[15px] ${
                            i <= r.stars
                              ? 'text-[#ff6a00]'
                              : 'text-slate-200'
                          }`}
                          style={{
                            fontVariationSettings:
                              "'FILL' 1"
                          }}
                        >
                          star
                        </span>
                      ))}
                    </div>

                    <span className="text-[10px] text-slate-400 shrink-0">
                      {r.time}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-[#0b1c30] mt-1.5 truncate">
                    {r.serviceTitle}
                  </p>

                  {r.feedback && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      "{r.feedback}"
                    </p>
                  )}
                </div>
              ))}

              {reviews.length > 3 && (
                <button
                  onClick={() => setShowAllReviews(prev => !prev)}
                  className="w-full py-2.5 rounded-full bg-white border border-slate-100 shadow-xs text-xs font-bold text-[#a14000] flex items-center justify-center gap-1 active:scale-95 transition-all"
                >
                  {showAllReviews ? 'Show less' : 'View more'}
                  <span className="material-symbols-outlined text-[16px]">
                    {showAllReviews ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* ========================================= */}
        {/* SETTINGS */}
        {/* ========================================= */}

        <section className="space-y-2 pt-1">
          <div className="px-1">
            <h2 className="text-sm font-bold text-[#0b1c30]">
              Settings
            </h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 divide-y divide-slate-100 overflow-hidden">
            <button
              onClick={() => navigateTo('settings', 'profile')}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  settings
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Settings
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  Notifications, language & location
                </p>
              </div>

              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">
                chevron_right
              </span>
            </button>

            <button
              onClick={() => navigateTo('resetPassword', 'profile')}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  lock_reset
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Reset Password
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  Update your account password
                </p>
              </div>

              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">
                chevron_right
              </span>
            </button>

            <button
              onClick={() => navigateTo('faq', 'profile')}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  help
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  FAQ
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  Answers to common questions
                </p>
              </div>

              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">
                chevron_right
              </span>
            </button>

            <button
              onClick={() => navigateTo('terms', 'profile')}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  policy
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Terms & Policy
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  Terms of service & privacy policy
                </p>
              </div>

              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">
                chevron_right
              </span>
            </button>

            <button
              onClick={handleSelectMember}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#eff4ff] text-[#a14000] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">
                  swap_horiz
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">
                  Switch to Resident View
                </p>

                <p className="text-[11px] text-slate-500 truncate">
                  Book services as a community member
                </p>
              </div>

              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">
                chevron_right
              </span>
            </button>
          </div>
        </section>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl shadow-xs border border-red-100 hover:bg-red-50 active:bg-red-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center text-red-500 shrink-0">
            <span className="material-symbols-outlined text-[18px]">
              logout
            </span>
          </div>

          <p className="text-xs font-bold text-red-500">
            Log Out
          </p>
        </button>
          </>
        )}
      </main>

      {/* ========================================= */}
      {/* PARTNER BOTTOM NAVIGATION */}
      {/* ========================================= */}

      <nav className="sticky bottom-0 inset-x-0 z-40 bg-[#f8f9ff]/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(27,42,94,0.06)] border-t border-slate-100 pb-safe">
        <div className="flex justify-around items-center h-18 px-2 max-w-lg mx-auto py-1">
          {partnerNavItems.map(item => {
            const isActive = partnerTab === item.id;

            return (
              <button
                key={item.id}
                aria-label={item.label}
                onClick={() => switchPartnerTab(item.id)}
                className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] gap-1 transition-all ${
                  isActive
                    ? 'text-[#a14000] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div
                  className={`w-11 h-7 rounded-full flex items-center justify-center relative transition-colors ${
                    isActive
                      ? 'bg-[#ffdbcc] text-[#a14000]'
                      : 'text-slate-600'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{
                      fontVariationSettings: isActive
                        ? "'FILL' 1"
                        : "'FILL' 0"
                    }}
                  >
                    {item.icon}
                  </span>

                  {item.badge && (
                    <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full bg-[#ff6a00] ring-2 ring-[#f8f9ff] animate-pulse" />
                  )}
                </div>

                <span className="text-[11px] font-medium leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ========================================= */}
      {/* ADD / EDIT SERVICE MODAL */}
      {/* ========================================= */}

      {serviceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">

          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">

            <div className="flex items-center justify-between mb-4">

              <div className="flex items-center gap-2">

                <div className="w-9 h-9 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">

                  <span className="material-symbols-outlined text-[18px]">
                    handyman
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-[#0b1c30] text-base">
                    {editingService
                      ? 'Edit Service'
                      : 'Add Service'}
                  </h3>

                  <p className="text-[10px] text-slate-400">
                    {editingService
                      ? 'Update your service details'
                      : 'Add a service you provide'}
                  </p>
                </div>
              </div>

              <button
                onClick={closeServiceModal}
                disabled={serviceSaving}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* SERVICE SELECT */}

            <div className="space-y-1.5 mb-3">

              <label className="text-[11px] font-bold text-[#0b1c30]">
                Service
              </label>

              <select
                value={selectedServiceId}
                onChange={(e) =>
                  setSelectedServiceId(
                    e.target.value
                  )
                }
                disabled={
                  Boolean(editingService) ||
                  serviceSaving
                }
                className="w-full rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 text-sm text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">
                  Select a service
                </option>

                {availableServices.map(
                  service => (
                    <option
                      key={service.id}
                      value={service.id}
                    >
                      {service.title}
                    </option>
                  )
                )}
              </select>

              {editingService && (
                <p className="text-[9px] text-slate-400">
                  Service type cannot be changed while editing.
                </p>
              )}
            </div>

            {/* EXPERIENCE */}

            <div className="space-y-1.5 mb-3">

              <label className="text-[11px] font-bold text-[#0b1c30]">
                Experience
              </label>

              <div className="relative">

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={serviceExperience}
                  onChange={(e) =>
                    setServiceExperience(
                      e.target.value
                    )
                  }
                  disabled={serviceSaving}
                  placeholder="e.g. 3"
                  className="w-full rounded-xl border border-slate-200 bg-[#f8f9ff] px-3 py-2.5 pr-16 text-sm text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40 disabled:opacity-50"
                />

                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium">
                  years
                </span>
              </div>
            </div>

            {/* PRICE */}

            <div className="space-y-1.5 mb-4">

              <label className="text-[11px] font-bold text-[#0b1c30]">
                Your Price
              </label>

              <div className="relative">

                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#a14000]">
                  ₹
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={servicePrice}
                  onChange={(e) =>
                    setServicePrice(
                      e.target.value
                    )
                  }
                  disabled={serviceSaving}
                  placeholder={
                    selectedServiceId
                      ? String(
                          getServiceDetails(
                            selectedServiceId
                          )?.price || ''
                        )
                      : 'Enter price'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-[#f8f9ff] pl-8 pr-3 py-2.5 text-sm text-[#0b1c30] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40 disabled:opacity-50"
                />
              </div>

              <p className="text-[9px] text-slate-400">
                Leave empty to use the service's default price.
              </p>
            </div>

            {/* ACTIONS */}

            <div className="flex gap-2">

              <button
                onClick={closeServiceModal}
                disabled={serviceSaving}
                className="flex-1 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={handleSaveService}
                disabled={
                  serviceSaving ||
                  !selectedServiceId
                }
                className="flex-[2] py-2.5 rounded-full bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >

                {serviceSaving ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">
                      progress_activity
                    </span>

                    Saving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">
                      check
                    </span>

                    {editingService
                      ? 'Update Service'
                      : 'Add Service'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* CALENDAR MODAL */}
      {/* ========================================= */}

      {calendarOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">

          <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">

            <div className="flex items-center justify-between mb-3">

              <div className="flex items-center gap-2">

                <div className="w-8 h-8 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">
                    calendar_month
                  </span>
                </div>

                <h3 className="font-bold text-[#0b1c30] text-base">
                  My Calendar
                </h3>
              </div>

              <button
                onClick={() => setCalendarOpen(false)}
                aria-label="Close calendar"
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                ✕
              </button>
            </div>

            {/* Month switcher */}
            <div className="flex items-center justify-between mb-2">

              <button
                onClick={() => shiftCalendarMonth(-1)}
                aria-label="Previous month"
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>

              <span className="text-sm font-bold text-[#0b1c30]">
                {calendarMonth.toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric'
                })}
              </span>

              <button
                onClick={() => shiftCalendarMonth(1)}
                aria-label="Next month"
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-7 gap-1 text-center">

              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <span
                  key={`${day}-${index}`}
                  className="text-[10px] font-bold text-slate-400 py-1"
                >
                  {day}
                </span>
              ))}

              {calendarCells.map((date, index) => {
                if (!date) {
                  return <span key={`blank-${index}`} />;
                }

                const dayString = date.toDateString();
                const dayJobs = jobsOnDay(dayString);
                const hasClash = dayJobs.some(job => clashingJobIds.has(job.id));
                const isSelected = dayString === calendarDay;
                const isToday = dayString === new Date().toDateString();

                return (
                  <button
                    key={dayString}
                    onClick={() => setCalendarDay(dayString)}
                    className={`h-10 rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#ff6a00] text-white'
                        : isToday
                          ? 'bg-[#eff4ff] text-[#a14000]'
                          : 'text-[#0b1c30] hover:bg-slate-50'
                    }`}
                  >
                    {date.getDate()}

                    {dayJobs.length > 0 && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                          hasClash
                            ? 'bg-red-500'
                            : isSelected
                              ? 'bg-white'
                              : 'bg-[#00ae78]'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ae78]" />
                Booked
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Clash
              </span>
            </div>

            {/* Jobs on the selected day */}
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">

              <h4 className="text-xs font-bold text-[#0b1c30]">
                {new Date(calendarDay).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </h4>

              {selectedDayJobs.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No jobs booked. You're free all day.
                </p>
              ) : (
                selectedDayJobs.map(job => {
                  const endTime = new Date(job.startMs + job.minutes * 60 * 1000)
                    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
                  const isClash = clashingJobIds.has(job.id);

                  return (
                    <div
                      key={job.id}
                      className={`rounded-2xl p-3 border flex items-start justify-between gap-3 ${
                        isClash
                          ? 'bg-red-50 border-red-100'
                          : 'bg-[#f8f9ff] border-slate-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[#a14000]">
                          {job.time} – {endTime}
                        </p>

                        <p className="text-xs font-bold text-[#0b1c30] truncate">
                          {job.title}
                        </p>

                        <p className="text-[11px] text-slate-500 truncate">
                          {job.customer} • {job.address}
                        </p>

                        {isClash && (
                          <p className="text-[10px] text-red-500 font-bold mt-0.5">
                            Overlaps another job. Contact one customer to reschedule.
                          </p>
                        )}
                      </div>

                      <span className="font-extrabold text-xs text-[#a14000] shrink-0">
                        ₹{job.price}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* WITHDRAWAL MODAL */}
      {/* ========================================= */}

      {withdrawModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">

          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">

            <div className="flex items-center justify-between mb-3">

              <div className="flex items-center gap-2">

                <div className="w-8 h-8 rounded-full bg-[#ffdbcc] text-[#a14000] flex items-center justify-center">

                  <span className="material-symbols-outlined text-base">
                    account_balance_wallet
                  </span>
                </div>

                <h3 className="font-bold text-[#0b1c30] text-base">
                  Instant UPI Payout
                </h3>
              </div>

              <button
                onClick={() =>
                  setWithdrawModalOpen(false)
                }
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Transfer available balance directly to your registered UPI ID with zero fee.
            </p>

            <div className="bg-[#eff4ff] p-3 rounded-2xl mb-4 border border-slate-100">

              <span className="text-[10px] text-slate-400 font-bold uppercase">
                Destination Account
              </span>

              <p className="text-xs font-bold text-[#0b1c30]">
                {partnerProfile?.upi_id || partnerProfile?.upiId || 'UPI account not configured'}
              </p>

              <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">

                <span className="text-xs text-slate-600">
                  Transfer Amount:
                </span>

                <span className="text-base font-extrabold text-[#a14000]">
                  ₹{partnerStats.weeklyBalance}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                showToast(
                  'Withdrawal is not connected to the payment backend yet. No money has been transferred.'
                );
              }}
              className="w-full py-3 rounded-full bg-[#00ae78] hover:bg-[#006c49] text-white font-bold text-sm shadow-md active:scale-95 transition-all"
            >
              Transfer ₹
              {partnerStats.weeklyBalance} to UPI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};