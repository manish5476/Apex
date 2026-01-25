const crypto = require('crypto');

class GeoFencing {
  
  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distance in meters
  }
  
  /**
   * Check if location is within geofence
   */
  static isWithinGeofence(userLat, userLng, fenceLat, fenceLng, radius) {
    const distance = this.calculateDistance(userLat, userLng, fenceLat, fenceLng);
    return distance <= radius;
  }
  
  /**
   * Validate GPS accuracy
   */
  static validateAccuracy(accuracy, maxAccuracy = 100) {
    return accuracy <= maxAccuracy;
  }
  
  /**
   * Generate location hash for tamper detection
   */
  static generateLocationHash(lat, lng, accuracy, timestamp, secret) {
    const data = `${lat.toFixed(6)}:${lng.toFixed(6)}:${accuracy}:${timestamp}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }
  
  /**
   * Verify location hash
   */
  static verifyLocationHash(lat, lng, accuracy, timestamp, hash, secret) {
    const expectedHash = this.generateLocationHash(lat, lng, accuracy, timestamp, secret);
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  }
  
  /**
   * Check if location is spoofed
   */
  static detectSpoofing(currentLocation, previousLocations, maxSpeed = 200) {
    // Maximum realistic speed in km/h (200 km/h = ~55 m/s)
    
    if (previousLocations.length === 0) {
      return { isSpoofed: false, reason: 'No previous location' };
    }
    
    const lastLocation = previousLocations[previousLocations.length - 1];
    const distance = this.calculateDistance(
      currentLocation.lat,
      currentLocation.lng,
      lastLocation.lat,
      lastLocation.lng
    );
    
    const timeDiff = (currentLocation.timestamp - lastLocation.timestamp) / 1000; // seconds
    const speed = (distance / timeDiff) * 3.6; // Convert m/s to km/h
    
    if (speed > maxSpeed) {
      return {
        isSpoofed: true,
        reason: `Impossible speed: ${speed.toFixed(2)} km/h`,
        speed,
        maxAllowed: maxSpeed
      };
    }
    
    return { isSpoofed: false, speed };
  }
  
  /**
   * Get nearest branch from multiple locations
   */
  static findNearestBranch(userLat, userLng, branches) {
    let nearest = null;
    let minDistance = Infinity;
    
    branches.forEach(branch => {
      if (branch.location && branch.location.lat && branch.location.lng) {
        const distance = this.calculateDistance(
          userLat,
          userLng,
          branch.location.lat,
          branch.location.lng
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearest = {
            branch,
            distance
          };
        }
      }
    });
    
    return nearest;
  }
  
  /**
   * Create geofence polygon validation
   */
  static isInsidePolygon(point, polygon) {
    // Ray casting algorithm
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      
      const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
  
  /**
   * Calculate safe zone boundaries
   */
  static calculateSafeZone(centerLat, centerLng, radius) {
    // Convert radius from meters to degrees (approximate)
    const latDelta = radius / 111320; // 111,320 meters per degree of latitude
    const lngDelta = radius / (111320 * Math.cos(centerLat * Math.PI / 180));
    
    return {
      minLat: centerLat - latDelta,
      maxLat: centerLat + latDelta,
      minLng: centerLng - lngDelta,
      maxLng: centerLng + lngDelta
    };
  }
}

module.exports = GeoFencing;