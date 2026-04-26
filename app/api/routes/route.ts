import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getLineColor } from '@/lib/constants';
import type { RouteLineFeatureCollection } from '@/types/transit';

interface RouteShapeEntry {
  feedSource: string;
  routeId: string;
  directionId: number;
  coordinates: [number, number][];
}

function loadRouteShapes(): RouteShapeEntry[] {
  const filePath = join(process.cwd(), 'data', 'route-shapes.json');
  if (!existsSync(filePath)) {
    console.warn('Missing route-shapes.json - run: npx tsx scripts/generate-gtfs-lookups.ts');
    return [];
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as RouteShapeEntry[];
}

const routeShapes = loadRouteShapes();

export async function GET(): Promise<NextResponse<RouteLineFeatureCollection>> {
  const collection: RouteLineFeatureCollection = {
    type: 'FeatureCollection',
    features: routeShapes.map(({ feedSource, routeId, directionId, coordinates }) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        routeId,
        directionId,
        // Subway routes are looked up by routeId ('A', '1', 'L'…).
        // Commuter rail feeds use the same numeric IDs as subway, so fall back
        // to the feed-level color key ('MNR', 'LIRR') instead.
        color: getLineColor(feedSource === 'subway' ? routeId : feedSource.toUpperCase()),
      },
    })),
  };

  return NextResponse.json(collection);
}
