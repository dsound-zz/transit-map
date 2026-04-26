/**
 * generate-gtfs-lookups.ts
 *
 * Run once (or on a cron) to download MTA's static GTFS data and generate
 * JSON lookup files the API route needs at runtime.
 *
 * Usage:
 *   npx tsx scripts/generate-gtfs-lookups.ts
 *
 * Outputs:
 *   data/stops.json          - { [stopId]: { name, lat, lon, parentStation? } }
 *   data/shapes.json         - { [shapeId]: [{ lat, lon, seq }] }
 *   data/trip-shapes.json    - { [tripId]: shapeId }
 *   data/stop-sequences.json - { [tripId]: [stopId1, stopId2, ...] }
 *   data/route-shapes.json   - [{ routeId, directionId, coordinates: [lon,lat][] }]
 *                              One entry per route+direction, using the shape with the
 *                              most points (longest full-length variant, not a stub).
 */

import { mkdirSync, existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

const STATIC_GTFS_URLS: Record<string, string> = {
  subway: 'http://web.mta.info/developers/data/nyct/subway/google_transit.zip',
  mnr: 'http://web.mta.info/developers/data/mnr/google_transit.zip',
  lirr: 'http://web.mta.info/developers/data/lirr/google_transit.zip',
};

const OUT_DIR = join(process.cwd(), 'data');
const TMP_DIR = join(process.cwd(), '.tmp-gtfs');

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^﻿/, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

async function downloadAndExtract(name: string, url: string) {
  const zipPath = join(TMP_DIR, `${name}.zip`);
  const extractDir = join(TMP_DIR, name);
  ensureDir(extractDir);

  console.log(`Downloading ${name} static GTFS...`);
  execSync(`curl -sL "${url}" -o "${zipPath}"`);
  console.log(`Extracting ${name}...`);
  execSync(`unzip -oq "${zipPath}" -d "${extractDir}"`);

  return extractDir;
}

type RouteShapeEntry = { feedSource: string; routeId: string; directionId: number; coordinates: [number, number][] };

interface NYOpenDataRecord {
  object_id: string;
  route_name: string;
  route_code: string;
  geometry: {
    type: 'MultiLineString';
    coordinates: [number, number][][];
  };
}

// The MTA's static LIRR GTFS omits shapes.txt, so we fetch branch geometry
// from the NY Open Data "MTA Rail Branches" dataset instead.
// Each MultiLineString record becomes one entry per LineString segment.
async function fetchLIRRBranchGeometry(): Promise<RouteShapeEntry[]> {
  const url = 'https://data.ny.gov/resource/2vcb-zrh4.json?$limit=100';
  console.log('Fetching LIRR branch geometry from NY Open Data...');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const records = await res.json() as NYOpenDataRecord[];
    const entries: RouteShapeEntry[] = [];

    for (const record of records) {
      if (!record.object_id.startsWith('LIRR_')) continue;
      if (record.geometry?.type !== 'MultiLineString') continue;

      for (const ring of record.geometry.coordinates) {
        entries.push({
          feedSource: 'lirr',
          routeId: record.route_code,
          directionId: 0,
          coordinates: ring,
        });
      }
    }

    console.log(`  lirr: ${entries.length} branch segments from NY Open Data`);
    return entries;
  } catch (err) {
    console.warn('  lirr: failed to fetch branch geometry —', err instanceof Error ? err.message : err);
    return [];
  }
}

async function processFeeds() {
  ensureDir(OUT_DIR);
  ensureDir(TMP_DIR);

  const allStops: Record<string, { name: string; lat: number; lon: number; parentStation?: string }> = {};
  const allShapes: Record<string, { lat: number; lon: number; seq: number }[]> = {};
  const tripShapes: Record<string, string> = {};
  const stopSequences: Record<string, string[]> = {};
  // Best shape per "feedName:routeId_directionId": the shape with the most points.
  // Feed name is included in the key so MNR/LIRR numeric route IDs (1, 2, 3…)
  // don't overwrite subway routes with the same IDs.
  const bestRouteShapes: Record<string, { feedSource: string; routeId: string; directionId: number; shapeId: string; pointCount: number }> = {};

  for (const [feedName, url] of Object.entries(STATIC_GTFS_URLS)) {
    try {
      const dir = await downloadAndExtract(feedName, url);

      // ── Parse stops.txt ──
      const stopsPath = join(dir, 'stops.txt');
      if (existsSync(stopsPath)) {
        const rows = parseCSV(readFileSync(stopsPath, 'utf8'));
        for (const row of rows) {
          const stopId = row['stop_id'];
          if (!stopId || !row['stop_lat'] || !row['stop_lon']) continue;
          allStops[stopId] = {
            name: row['stop_name'] ?? '',
            lat: parseFloat(row['stop_lat']),
            lon: parseFloat(row['stop_lon']),
            ...(row['parent_station'] ? { parentStation: row['parent_station'] } : {}),
          };
        }
        console.log(`  ${feedName}: ${rows.length} stops parsed`);
      }

      // ── Parse shapes.txt ──
      const shapesPath = join(dir, 'shapes.txt');
      if (existsSync(shapesPath)) {
        const rows = parseCSV(readFileSync(shapesPath, 'utf8'));
        for (const row of rows) {
          const shapeId = row['shape_id'];
          if (!shapeId) continue;
          const nsShapeId = `${feedName}:${shapeId}`;
          if (!allShapes[nsShapeId]) allShapes[nsShapeId] = [];
          allShapes[nsShapeId].push({
            lat: parseFloat(row['shape_pt_lat']),
            lon: parseFloat(row['shape_pt_lon']),
            seq: parseInt(row['shape_pt_sequence'], 10),
          });
        }
        for (const points of Object.values(allShapes)) {
          points.sort((a, b) => a.seq - b.seq);
        }
        console.log(`  ${feedName}: ${Object.keys(allShapes).length} shapes parsed`);
      }

      // ── Parse trips.txt (trip -> shape mapping + best shape per route+direction) ──
      const tripsPath = join(dir, 'trips.txt');
      if (existsSync(tripsPath)) {
        const rows = parseCSV(readFileSync(tripsPath, 'utf8'));
        for (const row of rows) {
          const tripId = row['trip_id'];
          const shapeId = row['shape_id'];
          if (tripId && shapeId) {
            tripShapes[`${feedName}:${tripId}`] = `${feedName}:${shapeId}`;
          }
          const routeId = row['route_id'];
          const directionId = row['direction_id'] ?? '0';
          if (routeId && shapeId) {
            const key = `${feedName}:${routeId}_${directionId}`;
            const nsShapeId = `${feedName}:${shapeId}`;
            const pointCount = allShapes[nsShapeId]?.length ?? 0;
            const current = bestRouteShapes[key];
            if (!current || pointCount > current.pointCount) {
              bestRouteShapes[key] = {
                feedSource: feedName,
                routeId,
                directionId: parseInt(directionId, 10),
                shapeId: nsShapeId,
                pointCount,
              };
            }
          }
        }
      }

      // ── Parse stop_times.txt (trip -> ordered stop list) ──
      const stopTimesPath = join(dir, 'stop_times.txt');
      if (existsSync(stopTimesPath)) {
        const rows = parseCSV(readFileSync(stopTimesPath, 'utf8'));
        const tripStops: Record<string, { stopId: string; seq: number }[]> = {};
        for (const row of rows) {
          const tripId = row['trip_id'];
          if (!tripId) continue;
          const nsTripId = `${feedName}:${tripId}`;
          if (!tripStops[nsTripId]) tripStops[nsTripId] = [];
          tripStops[nsTripId].push({
            stopId: row['stop_id'],
            seq: parseInt(row['stop_sequence'], 10),
          });
        }
        for (const [nsTripId, stops] of Object.entries(tripStops)) {
          stops.sort((a, b) => a.seq - b.seq);
          stopSequences[nsTripId] = stops.map(s => s.stopId);
        }
        console.log(`  ${feedName}: ${Object.keys(tripStops).length} trip stop sequences parsed`);
      }
    } catch (err) {
      console.error(`Failed to process ${feedName}:`, err);
    }
  }

  // Build route-shapes: one entry per route+direction using the longest shape variant.
  const routeShapeEntries: { feedSource: string; routeId: string; directionId: number; coordinates: [number, number][] }[] = [];
  for (const { feedSource, routeId, directionId, shapeId } of Object.values(bestRouteShapes)) {
    const points = allShapes[shapeId];
    if (!points || points.length === 0) continue;
    routeShapeEntries.push({
      feedSource,
      routeId,
      directionId,
      coordinates: points.map(p => [p.lon, p.lat]),
    });
  }

  // Supplement with LIRR branch geometry from NY Open Data, since the MTA's
  // static LIRR GTFS does not include shapes.txt.
  const lirrEntries = await fetchLIRRBranchGeometry();
  routeShapeEntries.push(...lirrEntries);

  await writeFile(join(OUT_DIR, 'stops.json'), JSON.stringify(allStops));
  await writeFile(join(OUT_DIR, 'shapes.json'), JSON.stringify(allShapes));
  await writeFile(join(OUT_DIR, 'trip-shapes.json'), JSON.stringify(tripShapes));
  await writeFile(join(OUT_DIR, 'stop-sequences.json'), JSON.stringify(stopSequences));
  await writeFile(join(OUT_DIR, 'route-shapes.json'), JSON.stringify(routeShapeEntries));

  console.log('\nDone! Files written to data/');
  console.log(`  stops.json: ${Object.keys(allStops).length} stops`);
  console.log(`  shapes.json: ${Object.keys(allShapes).length} shapes`);
  console.log(`  trip-shapes.json: ${Object.keys(tripShapes).length} trip->shape mappings`);
  console.log(`  stop-sequences.json: ${Object.keys(stopSequences).length} trip->stop sequences`);
  console.log(`  route-shapes.json: ${routeShapeEntries.length} route+direction lines`);

  execSync(`rm -rf "${TMP_DIR}"`);
}

processFeeds().catch(console.error);
