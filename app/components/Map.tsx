'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Map, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { VehicleFeature, VehicleFeatureCollection, RouteLineFeatureCollection } from '@/types/transit';
import NarnLayer from './NarnLayer';

const POLL_INTERVAL_MS = 15_000;

const FEEDS = [
  { id: 'subway',  label: 'Subway' },
  { id: 'mnr',     label: 'Metro-North' },
  { id: 'lirr',    label: 'LIRR' },
  { id: 'amtrak',  label: 'Amtrak' },
  { id: 'metra',   label: 'Metra' },
  { id: 'cta',     label: 'CTA' },
] as const;

type FeedId = typeof FEEDS[number]['id'];

// Set NEXT_PUBLIC_NARN_PMTILES_URL to a public R2/S3/CDN URL for Vercel deployments.
// Unset → falls back to the local /api/tiles server route (dev only).
const REMOTE_PMTILES_URL = process.env.NEXT_PUBLIC_NARN_PMTILES_URL;

const CITIES = [
  { id: 'nyc',     label: 'NYC',     center: [-74.0, 40.75]  as [number, number], zoom: 11 },
  { id: 'chicago', label: 'Chicago', center: [-87.65, 41.85] as [number, number], zoom: 11 },
] as const;

// OpenRailwayMap tiles — three subdomains for load balancing
const RAIL_INFRA_TILES = [
  'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
  'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
  'https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
];

const railInfraLayer: LayerProps = {
  id: 'rail-infrastructure',
  type: 'raster',
  paint: { 'raster-opacity': 0.35 },
};

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

type TransitLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: VehicleFeatureCollection };

export default function TransitMap() {
  const mapRef = useRef<MapRef>(null);

  const [transitState, setTransitState] = useState<TransitLoadState>({ status: 'loading' });
  const [amtrakFeatures, setAmtrakFeatures] = useState<VehicleFeature[]>([]);
  const [metraFeatures, setMetraFeatures] = useState<VehicleFeature[]>([]);
  const [ctaFeatures, setCtaFeatures] = useState<VehicleFeature[]>([]);
  const [routeLines, setRouteLines] = useState<RouteLineFeatureCollection | null>(null);
  const [activeFeeds, setActiveFeeds] = useState<Record<FeedId, boolean>>({
    subway: true,
    mnr: true,
    lirr: true,
    amtrak: true,
    metra: true,
    cta: true,
  });
  const [showRailInfrastructure, setShowRailInfrastructure] = useState(true);
  const [showClassIFreight, setShowClassIFreight] = useState(false);
  // Remote URL (pmtiles://) is available immediately from the env var.
  // Local server tiles need window.location.origin, so they're set after mount.
  const [narnTilesUrl, setNarnTilesUrl] = useState(
    REMOTE_PMTILES_URL ? `pmtiles://${REMOTE_PMTILES_URL}` : '',
  );
  useEffect(() => {
    if (!REMOTE_PMTILES_URL) {
      setNarnTilesUrl(`${window.location.origin}/api/tiles/narn/{z}/{x}/{y}`);
    }
  }, []);

  const toggleFeed = useCallback((id: FeedId) => {
    setActiveFeeds(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const flyToCity = useCallback((center: [number, number], zoom: number) => {
    mapRef.current?.flyTo({ center, zoom, duration: 1800 });
  }, []);

  useEffect(() => {
    fetch('/api/routes')
      .then(res => res.ok ? res.json() as Promise<RouteLineFeatureCollection> : Promise.reject(res.status))
      .then(setRouteLines)
      .catch(err => console.warn('Route lines unavailable:', err));
  }, []);

  const fetchTransit = useCallback(async () => {
    try {
      const res = await fetch('/api/transit');
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        setTransitState({ status: 'error', message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const data: VehicleFeatureCollection = await res.json();
      setTransitState({ status: 'ready', data });
    } catch (err) {
      setTransitState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }, []);

  const fetchAmtrak = useCallback(async () => {
    try {
      const res = await fetch('/api/amtrak');
      if (!res.ok) return;
      const data: VehicleFeatureCollection = await res.json();
      setAmtrakFeatures(data.features);
    } catch {
      // Amtrak is supplementary — fail silently
    }
  }, []);

  const fetchMetra = useCallback(async () => {
    try {
      const res = await fetch('/api/metra');
      if (!res.ok) return;
      const data: VehicleFeatureCollection = await res.json();
      setMetraFeatures(data.features);
    } catch {
      // Metra is supplementary — fail silently
    }
  }, []);

  const fetchCta = useCallback(async () => {
    try {
      const res = await fetch('/api/cta');
      if (!res.ok) return;
      const data: VehicleFeatureCollection = await res.json();
      setCtaFeatures(data.features);
    } catch {
      // CTA is supplementary — fail silently
    }
  }, []);

  useEffect(() => {
    fetchTransit();
    const interval = setInterval(fetchTransit, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchTransit]);

  useEffect(() => {
    fetchAmtrak();
    const interval = setInterval(fetchAmtrak, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAmtrak]);

  useEffect(() => {
    fetchMetra();
    const interval = setInterval(fetchMetra, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMetra]);

  useEffect(() => {
    fetchCta();
    const interval = setInterval(fetchCta, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCta]);

  const filteredVehicles = useMemo((): VehicleFeatureCollection => {
    const transitFeatures = transitState.status === 'ready'
      ? transitState.data.features.filter(f => activeFeeds[f.properties.feedSource as FeedId])
      : [];
    const filteredAmtrak = activeFeeds.amtrak ? amtrakFeatures : [];
    const filteredMetra = activeFeeds.metra ? metraFeatures : [];
    const filteredCta = activeFeeds.cta ? ctaFeatures : [];
    return {
      type: 'FeatureCollection',
      features: [...transitFeatures, ...filteredAmtrak, ...filteredMetra, ...filteredCta],
    };
  }, [transitState, amtrakFeatures, metraFeatures, ctaFeatures, activeFeeds]);

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
        ref={mapRef}
        initialViewState={{
          longitude: -73.98,
          latitude: 40.75,
          zoom: 11,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      >
        <NavigationControl position="top-right" />

        {/* Rail infrastructure raster — rendered first so it sits beneath everything */}
        {showRailInfrastructure && (
          <Source
            id="rail-infrastructure-source"
            type="raster"
            tiles={RAIL_INFRA_TILES}
            tileSize={256}
            attribution="© <a href='https://www.openrailwaymap.org/'>OpenRailwayMap</a> CC-BY-SA 2.0"
          >
            <Layer {...railInfraLayer} />
          </Source>
        )}

        {/* NARN Class I freight rail — vector tiles, color-coded by railroad */}
        {showClassIFreight && narnTilesUrl && <NarnLayer tilesUrl={narnTilesUrl} />}

        {filteredRoutes && filteredRoutes.features.length > 0 && (
          <Source id="routes" type="geojson" data={filteredRoutes}>
            <Layer {...routeLineLayer} />
          </Source>
        )}

        {filteredVehicles.features.length > 0 && (
          <Source id="vehicles" type="geojson" data={filteredVehicles}>
            <Layer {...vehicleLayer} />
          </Source>
        )}
      </Map>

      {/* Feed filter toggles — top left */}
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

        {/* City jump buttons */}
        <div className="mt-1 flex gap-1">
          {CITIES.map(({ id, label, center, zoom }) => (
            <button
              key={id}
              onClick={() => flyToCity(center, zoom)}
              className="flex-1 rounded px-2 py-1 text-xs font-medium bg-black/60 text-white/60 hover:text-white hover:bg-black/80 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Layer toggles — bottom left */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setShowRailInfrastructure(prev => !prev)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            showRailInfrastructure
              ? 'bg-white/20 text-white'
              : 'bg-black/60 text-white/30'
          }`}
        >
          Rail infrastructure
        </button>
        <button
          onClick={() => setShowClassIFreight(prev => !prev)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            showClassIFreight
              ? 'bg-white/20 text-white'
              : 'bg-black/60 text-white/30'
          }`}
        >
          Class I freight
        </button>
      </div>

      {transitState.status === 'loading' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded bg-black/70 px-4 py-2 text-sm text-white">
          Loading transit data…
        </div>
      )}

      {transitState.status === 'error' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded bg-red-700 px-4 py-2 text-sm text-white">
          {transitState.message}
        </div>
      )}

      {transitState.status === 'ready' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded bg-black/70 px-4 py-2 text-sm text-white">
          {filteredVehicles.features.length === 0
            ? 'No vehicles found'
            : `${filteredVehicles.features.length} vehicles`}
        </div>
      )}
    </div>
  );
}
