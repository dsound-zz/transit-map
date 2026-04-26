'use client';
import { useEffect, useState, useCallback } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { VehicleFeatureCollection, RouteLineFeatureCollection } from '@/types/transit';

const POLL_INTERVAL_MS = 15_000;

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

  // Fetch route lines once on mount — static data, no need to poll
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

        {/* Route lines first so vehicle dots render on top */}
        {routeLines && routeLines.features.length > 0 && (
          <Source id="routes" type="geojson" data={routeLines}>
            <Layer {...routeLineLayer} />
          </Source>
        )}

        {vehicleState.status === 'ready' && vehicleState.data.features.length > 0 && (
          <Source id="vehicles" type="geojson" data={vehicleState.data}>
            <Layer {...vehicleLayer} />
          </Source>
        )}
      </Map>

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
          {vehicleState.data.features.length === 0
            ? 'No vehicles found'
            : `${vehicleState.data.features.length} vehicles`}
        </div>
      )}
    </div>
  );
}
