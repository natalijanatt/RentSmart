import { haversineDistance } from '../../shared/utils/geo.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateImageMetadata(
  contractGps: { lat: number; lng: number } | null,
  metadata: { captured_at: string; gps_lat: number; gps_lng: number; device_id: string },
  sessionDeviceId: string | null,
): ValidationResult {
  const errors: string[] = [];

  // 1. Timestamp: within ±1 hour of server time
  const timeDiff = Math.abs(Date.now() - new Date(metadata.captured_at).getTime());
  if (timeDiff > 3_600_000) {
    errors.push(`Timestamp is ${Math.round(timeDiff / 60_000)} minutes from server time (max ±60min)`);
  }

  // 2. GPS: within 200m of property address (if contract has GPS)
  if (contractGps) {
    const distance = haversineDistance(
      contractGps.lat, contractGps.lng,
      metadata.gps_lat, metadata.gps_lng,
    );
    if (distance > 200) {
      errors.push(`GPS is ${Math.round(distance)}m from property (max 200m)`);
    }
  }

  // 3. Device consistency: same device throughout the session
  if (sessionDeviceId && metadata.device_id !== sessionDeviceId) {
    errors.push(`Device changed mid-session: expected ${sessionDeviceId}, got ${metadata.device_id}`);
  }

  return { valid: errors.length === 0, errors };
}
