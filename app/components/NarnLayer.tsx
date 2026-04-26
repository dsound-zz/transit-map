'use client';

import { Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import type { ExpressionSpecification } from 'maplibre-gl';

const SOURCE_LAYER = 'tracks';

// Class I railroad colors keyed on RROWNER1 attribute from the NARN dataset.
// Short lines and unknown owners fall through to industrial brown.
const CLASS_I_COLOR: ExpressionSpecification = [
  'match', ['get', 'RROWNER1'],
  'UP',   '#FFD700',  // Union Pacific — gold
  'BNSF', '#EC7014',  // BNSF — amber-orange
  'CSX',  '#00529B',  // CSX — corporate blue
  'NS',   '#6B21A8',  // Norfolk Southern — purple
  'CN',   '#DC2626',  // Canadian National — red
  'CP',   '#B91C1C',  // Canadian Pacific — dark red
  'KCS',  '#854D0E',  // Kansas City Southern — brown-gold
  '#8B4513',
];

const glowLayer: LayerProps = {
  id: 'narn-glow',
  type: 'line',
  'source-layer': SOURCE_LAYER,
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-color': CLASS_I_COLOR,
    'line-width': 10,
    'line-blur': 6,
    'line-opacity': 0.4,
  },
};

const trackLayer: LayerProps = {
  id: 'narn-track',
  type: 'line',
  'source-layer': SOURCE_LAYER,
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-color': CLASS_I_COLOR,
    'line-width': 4,
    'line-opacity': 0.8,
  },
};

export default function NarnLayer({ tilesUrl }: { tilesUrl: string }) {
  return (
    <Source id="narn" type="vector" tiles={[tilesUrl]} minzoom={4} maxzoom={14}>
      <Layer {...glowLayer} />
      <Layer {...trackLayer} />
    </Source>
  );
}
