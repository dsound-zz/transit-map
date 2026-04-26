'use client';
import Map, { NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function TransitMap() {
  return (
    <div className="w-full h-screen">
      <Map
        initialViewState={{
          longitude: -73.98, // Centered on Manhattan
          latitude: 40.75,
          zoom: 11
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      >
        <NavigationControl position="top-right" />
      </Map>
    </div>
  );
}