import { NextResponse } from 'next/server';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SUBWAY_FEEDS, COMMUTER_FEEDS, getLineColor } from '@/lib/constants';
import {
  snapToStop,
  interpolateAlongPolyline,
  computeCumulativeDistances,
} from '@/lib/interpolation';
import type { StopInfo, ShapePoint, VehicleFeature } from '@/types/transit';

// ─── Load static data once at cold start ───

function loadJSON<T>(filename: string): T {
  const filePath = join(process.cwd(), 'data', filename);
  if (!existsSync(filePath)) {
    console.warn(`Missing ${filename} - run: npx tsx scripts/generate-gtfs-lookups.ts`);
    return {} as T;
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

const stopsRaw = loadJSON<Record<string, { name: string; lat: number; lon: number; parentStation?: string }>>('stops.json');
const shapesRaw = loadJSON<Record<string, { lat: number; lon: number; seq: number }[]>>('shapes.json');
const tripShapes = loadJSON<Record<string, string>>('trip-shapes.json');
const stopSequences = loadJSON<Record<string, string[]>>('stop-sequences.json');

const stopsMap = new Map<string, StopInfo>();
for (const [id, info] of Object.entries(stopsRaw)) {
  stopsMap.set(id, { stopId: id, ...info });
}

const shapesMap = new Map<string, ShapePoint[]>();
for (const [id, points] of Object.entries(shapesRaw)) {
  const shapePoints: ShapePoint[] = points.map(p => ({
    shapeId: id,
    lat: p.lat,
    lon: p.lon,
    sequence: p.seq,
  }));
  computeCumulativeDistances(shapePoints);
  shapesMap.set(id, shapePoints);
}

// ─── Fetch a single GTFS-RT feed ───

async function fetchFeed(
  url: string,
  apiKey: string
): Promise<GtfsRealtimeBindings.transit_realtime.IFeedEntity[]> {
  try {
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`Feed ${url} returned ${res.status}`);
      return [];
    }
    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    return feed.entity;
  } catch (err) {
    console.warn(`Feed ${url} failed:`, err);
    return [];
  }
}

// ─── Resolve a vehicle entity to a lat/lon position ───

function resolvePosition(
  entity: GtfsRealtimeBindings.transit_realtime.IFeedEntity,
): { lat: number; lon: number } | null {
  const vehicle = entity.vehicle;
  if (!vehicle) return null;

  if (vehicle.position?.latitude && vehicle.position?.longitude) {
    return { lat: vehicle.position.latitude, lon: vehicle.position.longitude };
  }

  const stopId = vehicle.stopId;
  const status = vehicle.currentStatus;

  if (!stopId) return null;

  const StatusEnum = GtfsRealtimeBindings.transit_realtime.VehiclePosition.VehicleStopStatus;

  if (
    status === StatusEnum.STOPPED_AT ||
    status === StatusEnum.INCOMING_AT
  ) {
    return snapToStop(stopsMap, stopId);
  }

  const tripId = vehicle.trip?.tripId;
  if (!tripId) return snapToStop(stopsMap, stopId);

  const shapeId = tripShapes[tripId];
  const shapePoints = shapeId ? shapesMap.get(shapeId) : undefined;
  const sequence = stopSequences[tripId];

  if (!shapePoints || !sequence) {
    return snapToStop(stopsMap, stopId);
  }

  const nextIdx = sequence.indexOf(stopId);
  if (nextIdx <= 0) return snapToStop(stopsMap, stopId);

  const prevStop = snapToStop(stopsMap, sequence[nextIdx - 1]);
  const nextStop = snapToStop(stopsMap, stopId);
  if (!prevStop || !nextStop) return nextStop ?? prevStop;

  // Without TripUpdate timing data, use 50% as a reasonable default.
  // Cross-reference TripUpdate entities from the same feed for precise progress.
  return interpolateAlongPolyline(shapePoints, 0.5);
}

// ─── Map GTFS-RT status enum to our string type ───

function mapStatus(
  status: GtfsRealtimeBindings.transit_realtime.VehiclePosition.VehicleStopStatus | null | undefined
): VehicleFeature['properties']['status'] {
  const StatusEnum = GtfsRealtimeBindings.transit_realtime.VehiclePosition.VehicleStopStatus;
  switch (status) {
    case StatusEnum.STOPPED_AT:  return 'STOPPED_AT';
    case StatusEnum.INCOMING_AT: return 'INCOMING_AT';
    default:                     return 'IN_TRANSIT_TO';
  }
}

// ─── Main handler ───

export async function GET() {
  const apiKey = process.env.MTA_API_KEY ?? '';
  if (!apiKey) {
    return NextResponse.json({ error: 'MTA_API_KEY not set' }, { status: 500 });
  }

  const allFeeds = [
    ...SUBWAY_FEEDS.map(f => ({ ...f, feedSource: 'subway' as const })),
    ...COMMUTER_FEEDS,
  ];

  const feedResults = await Promise.all(
    allFeeds.map(async (feed) => {
      const entities = await fetchFeed(feed.url, apiKey);
      return { feedSource: feed.feedSource ?? 'subway', entities };
    })
  );

  const features: VehicleFeature[] = [];

  for (const { feedSource, entities } of feedResults) {
    for (const entity of entities) {
      if (!entity.vehicle) continue;

      const routeId = entity.vehicle.trip?.routeId ?? '';
      const pos = resolvePosition(entity);
      if (!pos) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [pos.lon, pos.lat],
        },
        properties: {
          id: entity.id,
          routeId,
          color: getLineColor(routeId),
          status: mapStatus(entity.vehicle.currentStatus),
          feedSource,
        },
      });
    }
  }

  return NextResponse.json({
    type: 'FeatureCollection',
    features,
    meta: {
      timestamp: Math.floor(Date.now() / 1000),
      vehicleCount: features.length,
    },
  });
}
