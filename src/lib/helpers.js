// Turns the backend's services-with-partners list into the helper cards
// customers book from (Home screen and the Emergency popup).
import { haversineDistanceKm } from './geo';

// One card per partner per service they offer
export const toHelper = (service, partner) => ({

  id:
    `${partner.partner_id}-${service.id}`,

  partnerId:
    partner.partner_id,

  serviceId:
    service.id,

  serviceTitle:
    service.title,

  serviceCategory:
    service.category,

  name:
    partner.name || 'KOODAM Partner',

  title:
    service.title,

  rating:
    Number(partner.rating || 0),

  reviewsCount:
    Number(partner.reviews_count || 0),

  experienceYears:
    Number(
      partner.experience_years || 0
    ),

  completionRate:
    Number(
      partner.completion_rate || 0
    ),

  // 100 = no escalations; lower ranks them lower
  reliabilityScore:
    Number(
      partner.reliability_score ?? 100
    ),

  rate:
    Number(
      partner.hourly_rate ??
      service.price ??
      0
    ),

  unit:
    ' / service',

  avatar:
    partner.avatar || '',

  phone:
    partner.phone || '',

  vehicle:
    partner.vehicle || '',

  vehicleNumber:
    partner.vehicle_number || '',

  email:
    partner.email || '',

  latitude:
    partner.latitude,

  longitude:
    partner.longitude,

  isOnline:
    partner.is_online,

  isVerified:
    partner.is_verified,

  policeVerified:
    Boolean(partner.police_verified),

  badge:
    partner.is_verified
      ? 'Verified Partner'
      : 'KOODAM Partner',

  badgeColor:
    partner.is_verified
      ? 'bg-[#6ffbbe] text-[#002113]'
      : 'bg-[#dce1ff] text-[#05164b]',

  serviceRadiusKm:
    Number(partner.service_radius_km || 5)
});

export const helpersFromServices = (services = []) =>
  services.flatMap((service) =>
    (service.partners || []).map((partner) => toHelper(service, partner))
  );

// Adds the distance from the member to each helper and leaves out
// helpers whose service radius doesn't reach them. Without both
// locations a helper is still shown, as "Nearby".
export const withDistance = (helpers, userCoords) =>
  helpers
    .map((helper) => {
      const distanceKm =
        userCoords && helper.latitude != null && helper.longitude != null
          ? haversineDistanceKm(userCoords, {
              lat: helper.latitude,
              lng: helper.longitude
            })
          : null;

      return {
        ...helper,
        distanceKm,
        distance:
          distanceKm == null ? 'Nearby' : `${distanceKm.toFixed(1)} km`
      };
    })
    .filter(
      (helper) =>
        helper.distanceKm == null ||
        helper.distanceKm <= helper.serviceRadiusKm
    );
