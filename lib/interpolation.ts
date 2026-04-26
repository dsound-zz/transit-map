import type { ShapePoint, StopInfo } from '@/types/transit';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeCumulativeDistances(points: ShapePoint[]): number {
  if (points.length === 0) return 0;
  points[0].distTraveled = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const segDist = haversine(prev.lat, prev.lon, points[i].lat, points[i].lon);
    points[i].distTraveled = (prev.distTraveled ?? 0) + segDist;
  }
  return points[points.length - 1].distTraveled ?? 0;
}

export function interpolateAlongPolyline(
  points: ShapePoint[],
  fraction: number
): { lat: number; lon: number } {
  if (points.length === 0) throw new Error('Empty polyline');
  if (points.length === 1 || fraction <= 0) {
    return { lat: points[0].lat, lon: points[0].lon };
  }
  if (fraction >= 1) {
    const last = points[points.length - 1];
    return { lat: last.lat, lon: last.lon };
  }

  const totalDist = points[points.length - 1].distTraveled ?? computeCumulativeDistances(points);
  const targetDist = fraction * totalDist;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((points[mid].distTraveled ?? 0) <= targetDist) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const p1 = points[lo];
  const p2 = points[hi];
  const segStart = p1.distTraveled ?? 0;
  const segEnd = p2.distTraveled ?? 0;
  const segLen = segEnd - segStart;

  if (segLen === 0) return { lat: p1.lat, lon: p1.lon };

  const t = (targetDist - segStart) / segLen;
  return {
    lat: p1.lat + t * (p2.lat - p1.lat),
    lon: p1.lon + t * (p2.lon - p1.lon),
  };
}

export function estimateProgress(
  departedPrevAt: number,
  arrivingNextAt: number,
  now: number
): number {
  const total = arrivingNextAt - departedPrevAt;
  if (total <= 0) return 1;
  const elapsed = now - departedPrevAt;
  return Math.max(0, Math.min(1, elapsed / total));
}

export function snapToStop(
  stops: Map<string, StopInfo>,
  stopId: string
): { lat: number; lon: number } | null {
  const stop = stops.get(stopId) ?? stops.get(stopId.slice(0, -1));
  if (!stop) return null;
  return { lat: stop.lat, lon: stop.lon };
}
