import { NextResponse } from 'next/server';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { getLineColor } from '@/lib/constants';
import type { VehicleFeature, VehicleFeatureCollection } from '@/types/transit';

const POSITIONS_URL = 'https://gtfspublic.metrarr.com/gtfs/public/positions';
const TRIP_UPDATES_URL = 'https://gtfspublic.metrarr.com/gtfs/public/tripupdates';

const FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  headers: {
    Accept: 'application/x-protobuf',
    'User-Agent': 'NYCTransitMap/1.0',
  },
  signal: AbortSignal.timeout(10_000),
};

export async function GET() {
  const apiKey = process.env.METRA_API_KEY;
  const positionsUrl = apiKey ? `${POSITIONS_URL}?api_token=${apiKey}` : POSITIONS_URL;
  const tripUpdatesUrl = apiKey ? `${TRIP_UPDATES_URL}?api_token=${apiKey}` : TRIP_UPDATES_URL;

  try {
    const [posRes, tripRes] = await Promise.all([
      fetch(positionsUrl, FETCH_OPTIONS),
      fetch(tripUpdatesUrl, FETCH_OPTIONS).catch(() => null),
    ]);

    if (!posRes.ok) {
      console.error(`[metra] upstream error: ${posRes.status}`);
      const empty: VehicleFeatureCollection = { type: 'FeatureCollection', features: [] };
      return NextResponse.json(empty, { status: 200 });
    }

    const [posBuffer, tripBuffer] = await Promise.all([
      posRes.arrayBuffer(),
      tripRes?.ok ? tripRes.arrayBuffer() : Promise.resolve(null),
    ]);

    const posFeed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(posBuffer),
    );
    const tripFeed = tripBuffer
      ? GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(tripBuffer))
      : null;

    const delayMap = new Map<string, number>();
    if (tripFeed) {
      for (const entity of tripFeed.entity) {
        const tripId = entity.tripUpdate?.trip?.tripId;
        if (!tripId) continue;
        const first = entity.tripUpdate!.stopTimeUpdate?.[0];
        const delay = first?.arrival?.delay ?? first?.departure?.delay ?? 0;
        delayMap.set(tripId, delay);
      }
    }

    const features: VehicleFeature[] = posFeed.entity
      .filter(entity => {
        const pos = entity.vehicle?.position;
        return (
          entity.vehicle &&
          typeof pos?.latitude === 'number' &&
          typeof pos?.longitude === 'number' &&
          !isNaN(pos.latitude) &&
          !isNaN(pos.longitude)
        );
      })
      .map(entity => {
        const v = entity.vehicle!;
        const routeId = v.trip?.routeId ?? '';
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [v.position!.longitude, v.position!.latitude],
          },
          properties: {
            id: entity.id,
            routeId,
            color: getLineColor(routeId),
            status: 'IN_TRANSIT_TO',
            feedSource: 'metra',
          },
        } satisfies VehicleFeature;
      });

    const body: VehicleFeatureCollection = { type: 'FeatureCollection', features };
    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=25, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[metra] fetch failed:', err);
    const empty: VehicleFeatureCollection = { type: 'FeatureCollection', features: [] };
    return NextResponse.json(empty, { status: 200 });
  }
}
