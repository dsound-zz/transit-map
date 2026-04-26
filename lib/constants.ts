// ─── Official MTA line colors (from the MTA design standards) ───

export const LINE_COLORS: Record<string, string> = {
  // IRT Broadway–Seventh Avenue
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  // IRT Lexington Avenue
  '4': '#00933C', '5': '#00933C', '6': '#00933C', '6X': '#00933C',
  // Flushing
  '7': '#B933AD', '7X': '#B933AD',
  // IND Eighth Avenue
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  // IND Sixth Avenue
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'FX': '#FF6319', 'M': '#FF6319',
  // IND Crosstown
  'G': '#6CBE45',
  // BMT Nassau
  'J': '#996633', 'Z': '#996633',
  // BMT Canarsie
  'L': '#A7A9AC',
  // BMT Broadway
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  // Shuttles
  'S': '#808183', 'GS': '#808183', 'FS': '#808183', 'H': '#808183',
  // Staten Island Railway
  'SI': '#1D2E86', 'SIR': '#1D2E86',
  // Metro-North (general teal)
  'MNR': '#0078C6',
  // LIRR (general blue)
  'LIRR': '#0039A6',
  // NJ Transit (general)
  'NJT': '#003DA5',
  // Metra lines (Chicago)
  'BNSF':  '#7B2D8B',  // BNSF Railway — purple
  'UP-N':  '#FFC72C',  // Union Pacific North — gold
  'UP-NW': '#FFC72C',  // Union Pacific Northwest — gold
  'UP-W':  '#009CDE',  // Union Pacific West — blue
  'MD-N':  '#F26522',  // Milwaukee District North — orange
  'MD-W':  '#F26522',  // Milwaukee District West — orange
  'NCS':   '#008745',  // North Central Service — green
  'SWS':   '#DD1F26',  // SouthWest Service — red
  'RI':    '#C01933',  // Rock Island District — crimson
  'ME':    '#003DA5',  // Metra Electric District — blue
  'HC':    '#006B3D',  // Heritage Corridor — dark green
};

export const DEFAULT_COLOR = '#FFFFFF';

export function getLineColor(routeId: string): string {
  return (
    LINE_COLORS[routeId] ??
    LINE_COLORS[routeId.toUpperCase()] ??
    LINE_COLORS[routeId.replace(/X$/i, '')] ??
    DEFAULT_COLOR
  );
}

// ─── MTA GTFS-RT Feed Endpoints ───
// All require x-api-key header

const MTA_BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds';

export const SUBWAY_FEEDS = [
  { id: 'subway-123456s', url: `${MTA_BASE}/nyct%2Fgtfs`,      routes: ['1','2','3','4','5','6','S'] },
  { id: 'subway-ace',     url: `${MTA_BASE}/nyct%2Fgtfs-ace`,   routes: ['A','C','E'] },
  { id: 'subway-bdfm',    url: `${MTA_BASE}/nyct%2Fgtfs-bdfm`,  routes: ['B','D','F','M'] },
  { id: 'subway-g',       url: `${MTA_BASE}/nyct%2Fgtfs-g`,     routes: ['G'] },
  { id: 'subway-jz',      url: `${MTA_BASE}/nyct%2Fgtfs-jz`,    routes: ['J','Z'] },
  { id: 'subway-nqrw',    url: `${MTA_BASE}/nyct%2Fgtfs-nqrw`,  routes: ['N','Q','R','W'] },
  { id: 'subway-l',       url: `${MTA_BASE}/nyct%2Fgtfs-l`,     routes: ['L'] },
  { id: 'subway-7',       url: `${MTA_BASE}/nyct%2Fgtfs-7`,     routes: ['7'] },
  { id: 'subway-sir',     url: `${MTA_BASE}/nyct%2Fgtfs-si`,    routes: ['SI'] },
];

export const COMMUTER_FEEDS = [
  { id: 'mnr',  url: `${MTA_BASE}/mnr%2Fgtfs-mnr`,   feedSource: 'mnr'  as const },
  { id: 'lirr', url: `${MTA_BASE}/lirr%2Fgtfs-lirr`, feedSource: 'lirr' as const },
];

export const NJT_FEED = {
  id: 'njt',
  url: 'https://transitdata.njtransit.com/feed/rail/pb',
  feedSource: 'njt' as const,
};
