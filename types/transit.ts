// ─── Static GTFS Data ───

export interface StopInfo {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  parentStation?: string;
}

export interface ShapePoint {
  shapeId: string;
  lat: number;
  lon: number;
  sequence: number;
  distTraveled?: number; // cumulative meters from shape start
}

export interface TripStopSequence {
  tripId: string;
  routeId: string;
  shapeId: string;
  stops: {
    stopId: string;
    sequence: number;
    distTraveled?: number;
  }[];
}

// ─── Real-Time Data ───

export type VehicleStatus = 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';

export interface VehiclePosition {
  id: string;
  routeId: string;
  tripId: string;
  lat: number;
  lon: number;
  currentStatus: VehicleStatus;
  currentStopId: string;
  timestamp: number;
  feedSource: 'subway' | 'mnr' | 'lirr' | 'njt';
}

// ─── GeoJSON for the frontend ───

export interface VehicleFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    id: string;
    routeId: string;
    color: string;
    status: VehicleStatus;
    feedSource: string;
  };
}

export interface VehicleFeatureCollection {
  type: 'FeatureCollection';
  features: VehicleFeature[];
}
