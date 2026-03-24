const EARTH_RADIUS_KM = 6371;

/**
 * Calculate the great-circle distance between two points
 * using the Haversine formula.
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lon1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lon2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Filter a list of objects with lat/lng to those within a radius
 * @param {object} origin - { latitude, longitude }
 * @param {Array} points - array of objects with latitude and longitude
 * @param {number} radiusKm
 * @returns {Array} filtered points with added `distance_km` property
 */
function filterWithinRadius(origin, points, radiusKm) {
  return points
    .map((p) => ({
      ...p,
      distance_km: haversineDistance(origin.latitude, origin.longitude, p.latitude, p.longitude),
    }))
    .filter((p) => p.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
}

module.exports = { haversineDistance, filterWithinRadius };
