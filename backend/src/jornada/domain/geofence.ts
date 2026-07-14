import type { Coordinates, Geofence, GeofenceResult } from './types.ts';

const EARTH_RADIUS_METERS = 6_371_008.8;

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function haversineDistance(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const latitude1 = radians(from.latitude);
  const latitude2 = radians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pointInPolygon(point: Coordinates, polygon: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;
    const [currentLongitude, currentLatitude] = currentPoint;
    const [previousLongitude, previousLatitude] = previousPoint;
    const intersects = (currentLatitude > point.latitude) !== (previousLatitude > point.latitude)
      && point.longitude < (previousLongitude - currentLongitude) * (point.latitude - currentLatitude)
        / (previousLatitude - currentLatitude) + currentLongitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function validateGeofence(point: Coordinates, geofence: Geofence): GeofenceResult {
  const distanceMeters = haversineDistance(point, geofence.center);
  const accuracy = Math.max(0, point.accuracyMeters ?? 0);
  if (accuracy > geofence.gpsToleranceMeters) {
    return { allowed: false, distanceMeters, reason: `Precisao do GPS insuficiente (${Math.round(accuracy)} m).` };
  }
  if (geofence.type === 'POLIGONO') {
    const allowed = geofence.polygon != null && pointInPolygon(point, geofence.polygon);
    return { allowed, distanceMeters, reason: allowed ? null : 'Localizacao fora do poligono autorizado.' };
  }
  const allowed = geofence.radiusMeters != null && distanceMeters <= geofence.radiusMeters + accuracy;
  return { allowed, distanceMeters, reason: allowed ? null : 'Localizacao fora do raio autorizado.' };
}
