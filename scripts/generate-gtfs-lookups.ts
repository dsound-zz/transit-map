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
 *   data/stops.json        - { [stopId]: { name, lat, lon, parentStation? } }
 *   data/shapes.json       - { [shapeId]: [{ lat, lon, seq, dist }] }
 *   data/trip-shapes.json  - { [tripId]: shapeId }
 *   data/stop-sequences.json - { [tripId]: [stopId1, stopId2, ...] }
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

async function processFeeds() {
  ensureDir(OUT_DIR);
  ensureDir(TMP_DIR);

  const allStops: Record<string, { name: string; lat: number; lon: number; parentStation?: string }> = {};
  const allShapes: Record<string, { lat: number; lon: number; seq: number }[]> = {};
  const tripShapes: Record<string, string> = {};
  const stopSequences: Record<string, string[]> = {};

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
          if (!allShapes[shapeId]) allShapes[shapeId] = [];
          allShapes[shapeId].push({
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

      // ── Parse trips.txt (trip -> shape mapping) ──
      const tripsPath = join(dir, 'trips.txt');
      if (existsSync(tripsPath)) {
        const rows = parseCSV(readFileSync(tripsPath, 'utf8'));
        for (const row of rows) {
          if (row['trip_id'] && row['shape_id']) {
            tripShapes[row['trip_id']] = row['shape_id'];
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
          if (!tripStops[tripId]) tripStops[tripId] = [];
          tripStops[tripId].push({
            stopId: row['stop_id'],
            seq: parseInt(row['stop_sequence'], 10),
          });
        }
        for (const [tripId, stops] of Object.entries(tripStops)) {
          stops.sort((a, b) => a.seq - b.seq);
          stopSequences[tripId] = stops.map(s => s.stopId);
        }
        console.log(`  ${feedName}: ${Object.keys(tripStops).length} trip stop sequences parsed`);
      }
    } catch (err) {
      console.error(`Failed to process ${feedName}:`, err);
    }
  }

  await writeFile(join(OUT_DIR, 'stops.json'), JSON.stringify(allStops));
  await writeFile(join(OUT_DIR, 'shapes.json'), JSON.stringify(allShapes));
  await writeFile(join(OUT_DIR, 'trip-shapes.json'), JSON.stringify(tripShapes));
  await writeFile(join(OUT_DIR, 'stop-sequences.json'), JSON.stringify(stopSequences));

  console.log('\nDone! Files written to data/');
  console.log(`  stops.json: ${Object.keys(allStops).length} stops`);
  console.log(`  shapes.json: ${Object.keys(allShapes).length} shapes`);
  console.log(`  trip-shapes.json: ${Object.keys(tripShapes).length} trip->shape mappings`);
  console.log(`  stop-sequences.json: ${Object.keys(stopSequences).length} trip->stop sequences`);

  execSync(`rm -rf "${TMP_DIR}"`);
}

processFeeds().catch(console.error);
