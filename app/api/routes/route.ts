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
        feedSource,
        routeId,
        directionId,
        // subway and metra have per-line colors; other agencies use a single agency color
        color: getLineColor(
          feedSource === 'subway' || feedSource === 'metra' ? routeId : feedSource.toUpperCase(),
        ),
      },
    })),
  };

  return NextResponse.json(collection);
}
