import { NextResponse } from 'next/server';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

// MTA Subway feed URL (you'll need a free API key from api.mta.info)
const MTA_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';

export async function GET() {
    try {
        const response = await fetch(MTA_URL, {
            headers: {
                'x-api-key': process.env.MTA_API_KEY || '',
            },
            // Important: GTFS-RT is binary data
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('MTA fetch failed');

        const buffer = await response.arrayBuffer();
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

        // Filter down to just vehicle positions for now
        const vehicles = feed.entity
            .filter(entity => entity.vehicle && entity.vehicle.position)
            .map(entity => ({
                id: entity.id,
                lat: entity.vehicle?.position?.latitude,
                lon: entity.vehicle?.position?.longitude,
                routeId: entity.vehicle?.trip?.routeId
            }));

        return NextResponse.json({ vehicles });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch transit data' }, { status: 500 });
    }
}