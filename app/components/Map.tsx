'use client';
import { useEffect, useState, useCallback } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { VehicleFeatureCollection } from '@/types/transit';

const POLL_INTERVAL_MS = 15_000;

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

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: VehicleFeatureCollection };

export default function TransitMap() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/transit');
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        setLoadState({ status: 'error', message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const data: VehicleFeatureCollection = await res.json();
      setLoadState({ status: 'ready', data });
    } catch (err) {
      setLoadState({
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
        {loadState.status === 'ready' && loadState.data.features.length > 0 && (
          <Source id="vehicles" type="geojson" data={loadState.data}>
            <Layer {...vehicleLayer} />
          </Source>
        )}
      </Map>

      {loadState.status === 'loading' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded bg-black/70 px-4 py-2 text-sm text-white">
          Loading transit data…
        </div>
      )}

      {loadState.status === 'error' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded bg-red-700 px-4 py-2 text-sm text-white">
          {loadState.message}
        </div>
      )}

      {loadState.status === 'ready' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded bg-black/70 px-4 py-2 text-sm text-white">
          {loadState.data.features.length === 0
            ? 'No vehicles found'
            : `${loadState.data.features.length} vehicles`}
        </div>
      )}
    </div>
  );
}
