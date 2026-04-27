'use client';

import { Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import type { ExpressionSpecification } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// Register the pmtiles:// protocol handler once when this module loads on the
// client. Must happen before MapLibre initialises so remote PMTiles URLs resolve.
if (typeof window !== 'undefined') {
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));
}

const SOURCE_LAYER = 'tracks';

const CLASS_I_COLOR: ExpressionSpecification = [
  'match', ['get', 'RROWNER1'],
  'UP',   '#FFD700',
  'BNSF', '#EC7014',
  'CSX',  '#00529B',
  'NS',   '#6B21A8',
  'CN',   '#DC2626',
  'CP',   '#B91C1C',
  'KCS',  '#854D0E',
  '#8B4513',
];

const glowLayer: LayerProps = {
  id: 'narn-glow',
  type: 'line',
  'source-layer': SOURCE_LAYER,
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': CLASS_I_COLOR, 'line-width': 10, 'line-blur': 6, 'line-opacity': 0.4 },
};

const trackLayer: LayerProps = {
  id: 'narn-track',
  type: 'line',
  'source-layer': SOURCE_LAYER,
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': CLASS_I_COLOR, 'line-width': 4, 'line-opacity': 0.8 },
};

export default function NarnLayer({ tilesUrl }: { tilesUrl: string }) {
  // pmtiles:// URLs use MapLibre's protocol handler and carry their own zoom range.
  // XYZ tile URLs go through our /api/tiles server route and need explicit bounds.
  if (tilesUrl.startsWith('pmtiles://')) {
    return (
      <Source id="narn" type="vector" url={tilesUrl}>
        <Layer {...glowLayer} />
        <Layer {...trackLayer} />
      </Source>
    );
  }

  return (
    <Source id="narn" type="vector" tiles={[tilesUrl]} minzoom={4} maxzoom={14}>
      <Layer {...glowLayer} />
      <Layer {...trackLayer} />
    </Source>
  );
}
