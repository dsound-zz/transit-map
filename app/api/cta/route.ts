import { NextResponse } from 'next/server';
import { getLineColor } from '@/lib/constants';
import type { VehicleFeature, VehicleFeatureCollection, VehicleStatus } from '@/types/transit';

const CTA_API_BASE = 'https://lapi.transitchicago.com/api/1.0/ttpositions.aspx';
const ALL_ROUTES = 'Red,Blue,Brn,G,Org,P,Pink,Y';

// Train Tracker API returns lowercase route names; GTFS uses title-case.
// Map them so vehicle colors align with route-line colors.
const ROUTE_ID_MAP: Record<string, string> = {
  red: 'Red', blue: 'Blue', brn: 'Brn', g: 'G',
  org: 'Org', p: 'P', pink: 'Pink', y: 'Y',
};

interface CtaTrainPosition {
  rn: string;
  destNm: string;
  trDr: string;
  nextStaNm: string;
  lat: string;
  lon: string;
  heading: string;
  isApp: string;
  isDly: string;
}

interface CtaRouteEntry {
  '@name': string;
  train?: CtaTrainPosition | CtaTrainPosition[];
}

interface CtaApiResponse {
  ctatt: {
    errCd: string;
    errNm: string | null;
    route?: CtaRouteEntry | CtaRouteEntry[];
  };
}

export async function GET() {
  const apiKey = process.env.CTA_API_KEY;
  if (!apiKey) {
    const empty: VehicleFeatureCollection = { type: 'FeatureCollection', features: [] };
    return NextResponse.json(empty, { status: 200 });
  }

  const url = `${CTA_API_BASE}?key=${apiKey}&rt=${ALL_ROUTES}&outputType=JSON`;

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.error(`[cta] upstream error: ${res.status}`);
      const empty: VehicleFeatureCollection = { type: 'FeatureCollection', features: [] };
      return NextResponse.json(empty, { status: 200 });
    }

    const data: CtaApiResponse = await res.json();

    if (data.ctatt.errCd !== '0') {
      console.error('[cta] API error:', data.ctatt.errNm);
      const empty: VehicleFeatureCollection = { type: 'FeatureCollection', features: [] };
      return NextResponse.json(empty, { status: 200 });
    }

    // API returns a single object when only one route has trains; normalise to array
    const routes = data.ctatt.route
      ? Array.isArray(data.ctatt.route)
        ? data.ctatt.route
        : [data.ctatt.route]
      : [];

    const features: VehicleFeature[] = [];

    for (const route of routes) {
      if (!route.train) continue;

      // Same single-vs-array quirk applies to trains within a route
      const trains = Array.isArray(route.train) ? route.train : [route.train];
      const routeId = ROUTE_ID_MAP[route['@name'].toLowerCase()] ?? route['@name'];
      const color = getLineColor(`CTA-${routeId}`);

      for (const train of trains) {
        const lat = parseFloat(train.lat);
        const lon = parseFloat(train.lon);
        if (isNaN(lat) || isNaN(lon)) continue;

        // Derive a coarse status from the isApp flag
        const status: VehicleStatus = train.isApp === '1' ? 'INCOMING_AT' : 'IN_TRANSIT_TO';

        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: {
            id: train.rn,
            routeId,
            color,
            status,
            feedSource: 'cta',
          },
        } satisfies VehicleFeature);
      }
    }

    const body: VehicleFeatureCollection = { type: 'FeatureCollection', features };
    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=25, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[cta] fetch failed:', err);
    const empty: VehicleFeatureCollection = { type: 'FeatureCollection', features: [] };
    return NextResponse.json(empty, { status: 200 });
  }
}
