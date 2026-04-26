'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { VehicleFeatureCollection, RouteLineFeatureCollection } from '@/types/transit';

const POLL_INTERVAL_MS = 15_000;

const FEEDS = [
  { id: 'subway',  label: 'Subway' },
  { id: 'mnr',     label: 'Metro-North' },
  { id: 'lirr',    label: 'LIRR' },
] as const;

type FeedId = typeof FEEDS[number]['id'];

const routeLineLayer: LayerProps = {
  id: 'route-lines',
  type: 'line',
  paint: {
    'line-color': ['get', 'color'],
    'line-width': 3,
    'line-opacity': 0.6,
  },
};

const vehicleLayer: LayerProps = {
  id: 'vehicles',
  type: 'circle',
  paint: {
    'circle-radius': 6,
    'circle-color': ['get', 'color'],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1,
  },
};

type VehicleLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: VehicleFeatureCollection };

export default function TransitMap() {
  const [vehicleState, setVehicleState] = useState<VehicleLoadState>({ status: 'loading' });
  const [routeLines, setRouteLines] = useState<RouteLineFeatureCollection | null>(null);
  const [activeFeeds, setActiveFeeds] = useState<Record<FeedId, boolean>>({
    subway: true,
    mnr: true,
    lirr: true,
  });

  const toggleFeed = useCallback((id: FeedId) => {
    setActiveFeeds(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  useEffect(() => {
    fetch('/api/routes')
      .then(res => res.ok ? res.json() as Promise<RouteLineFeatureCollection> : Promise.reject(res.status))
      .then(setRouteLines)
      .catch(err => console.warn('Route lines unavailable:', err));
  }, []);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/transit');
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        setVehicleState({ status: 'error', message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const data: VehicleFeatureCollection = await res.json();
      setVehicleState({ status: 'ready', data });
    } catch (err) {
      setVehicleState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    const interval = setInterval(fetchVehicles, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchVehicles]);

  const filteredVehicles = useMemo((): VehicleFeatureCollection | null => {
    if (vehicleState.status !== 'ready') return null;
    return {
      ...vehicleState.data,
      features: vehicleState.data.features.filter(f => activeFeeds[f.properties.feedSource as FeedId]),
    };
  }, [vehicleState, activeFeeds]);

  const filteredRoutes = useMemo((): RouteLineFeatureCollection | null => {
    if (!routeLines) return null;
    return {
      ...routeLines,
      features: routeLines.features.filter(f => activeFeeds[f.properties.feedSource as FeedId]),
    };
  }, [routeLines, activeFeeds]);

  return (
    <div className="w-full h-screen relative">
      <Map
        initialViewState={{
          longitude: -73.98,
          latitude: 40.75,
          zoom: 11,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      >
        <NavigationControl position="top-right" />

        {filteredRoutes && filteredRoutes.features.length > 0 && (
          <Source id="routes" type="geojson" data={filteredRoutes}>
            <Layer {...routeLineLayer} />
          </Source>
        )}

        {filteredVehicles && filteredVehicles.features.length > 0 && (
          <Source id="vehicles" type="geojson" data={filteredVehicles}>
            <Layer {...vehicleLayer} />
          </Source>
        )}
      </Map>

      {/* Feed filter toggles */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {FEEDS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => toggleFeed(id)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFeeds[id]
                ? 'bg-white text-black'
                : 'bg-black/60 text-white/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {vehicleState.status === 'loading' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded bg-black/70 px-4 py-2 text-sm text-white">
          Loading transit data…
        </div>
      )}

      {vehicleState.status === 'error' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded bg-red-700 px-4 py-2 text-sm text-white">
          {vehicleState.message}
        </div>
      )}

      {vehicleState.status === 'ready' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded bg-black/70 px-4 py-2 text-sm text-white">
          {filteredVehicles?.features.length === 0
            ? 'No vehicles found'
            : `${filteredVehicles?.features.length} vehicles`}
        </div>
      )}
    </div>
  );
}
