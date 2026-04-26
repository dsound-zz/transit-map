import { NextResponse } from 'next/server';
import type { VehicleFeatureCollection } from '@/types/transit';

const AMTRAKER_URL = 'https://api-v3.amtraker.com/v3/trains';
const AMTRAK_COLOR = '#003087'; // Amtrak brand navy

interface AmtrakerTrain {
  objectID: string;
  trainNum: string;
  routeName: string;
  lat: number;
  lon: number;
  heading: string;
  velocity: number;
  trainState: string;
}

const EMPTY: VehicleFeatureCollection = { type: 'FeatureCollection', features: [] };

export async function GET(): Promise<NextResponse<VehicleFeatureCollection>> {
  try {
    const res = await fetch(AMTRAKER_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`Amtraker returned ${res.status}`);
      return NextResponse.json(EMPTY);
    }

    const data = await res.json() as Record<string, AmtrakerTrain[]>;

    const features: VehicleFeatureCollection['features'] = Object.values(data)
      .flat()
      .filter(train => typeof train.lat === 'number' && typeof train.lon === 'number')
      .map(train => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [train.lon, train.lat],
        },
        properties: {
          id: train.objectID ?? train.trainNum,
          routeId: train.trainNum,
          color: AMTRAK_COLOR,
          status: 'IN_TRANSIT_TO' as const,
          feedSource: 'amtrak',
        },
      }));

    return NextResponse.json({ type: 'FeatureCollection', features });
  } catch (err) {
    console.warn('Amtrak fetch failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(EMPTY);
  }
}
