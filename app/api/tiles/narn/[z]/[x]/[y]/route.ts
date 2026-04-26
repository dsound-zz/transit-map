import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { PMTiles } from 'pmtiles';
import type { Source, RangeResponse } from 'pmtiles';

const NARN_PATH = path.join(process.cwd(), 'public/data/narn.pmtiles');

/**
 * Node.js file-based Source for the pmtiles library.
 * Reads from disk instead of making a self-referential HTTP round-trip back
 * to the Next.js static server.
 */
class NodeFileSource implements Source {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  getKey(): string {
    return this.filePath;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const handle = await fs.open(this.filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, offset);
      const data = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + length,
      ) as ArrayBuffer;
      return { data };
    } finally {
      await handle.close();
    }
  }
}

// Module-level singleton — caches PMTiles header + root directory across requests
const pmtiles = new PMTiles(new NodeFileSource(NARN_PATH));

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await ctx.params;

  try {
    const tile = await pmtiles.getZxy(Number(z), Number(x), Number(y));

    if (!tile) {
      return new NextResponse(null, { status: 204 });
    }

    return new NextResponse(tile.data as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error(`[narn-tiles] ${z}/${x}/${y}:`, err);
    return new NextResponse('Tile error', { status: 500 });
  }
}
