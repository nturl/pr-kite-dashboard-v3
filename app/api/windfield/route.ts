import { NextResponse } from "next/server";
import axios from "axios";

// Windy-style animated wind layer needs a *field* of u/v vectors on a regular
// grid, not the sparse per-spot readings the rest of the app uses. We sample
// Open-Meteo (the same source the tracker already trusts) on a coarse lat/lon
// grid covering the spots (NC → Long Island, plus Puerto Rico to the south) and
// emit the velocity-JSON format leaflet-velocity consumes. Coarse is fine: the
// plugin bilinearly interpolates between grid points, and the visual interest is
// the flow, not pinpoint accuracy.

export const dynamic = "force-dynamic"; // Next 14 froze this to a static 404 without it

// Grid box + resolution. STEP 1° → 15×25 = 375 points, ~4 batched Open-Meteo
// calls, cached 15 min. Origin is the NW corner (leaflet-velocity's la1/lo1).
const LAT_N = 41.5;
const LAT_S = 17.5;
const LON_W = -79.0;
const LON_E = -65.0;
const STEP  = 1.0;

const NX = Math.round((LON_E - LON_W) / STEP) + 1; // columns, W→E
const NY = Math.round((LAT_N - LAT_S) / STEP) + 1; // rows, N→S
const CHUNK = 100;               // Open-Meteo locations per request
const TTL_MS = 15 * 60 * 1000;   // wind fields don't change fast; cache hard

const OM_BASE = {
  current: "wind_speed_10m,wind_direction_10m",
  wind_speed_unit: "kn",
  timezone: "GMT",
};

type VelocityJSON = { header: Record<string, unknown>; data: (number | null)[] }[];
let cache: { at: number; body: VelocityJSON } | null = null;

// Grid points in the exact scan order the plugin expects: row-major,
// north→south (lat = LAT_N - j*STEP), west→east (lon = LON_W + i*STEP).
function gridPoints(): { lat: number; lon: number }[] {
  const pts: { lat: number; lon: number }[] = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      pts.push({ lat: +(LAT_N - j * STEP).toFixed(4), lon: +(LON_W + i * STEP).toFixed(4) });
    }
  }
  return pts;
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.body, { headers: { "x-windfield-cache": "hit" } });
  }

  const pts = gridPoints();
  const u = new Array<number | null>(pts.length).fill(null);
  const v = new Array<number | null>(pts.length).fill(null);

  // Fetch in chunks; best_match so it covers both CONUS (HRRR) and PR (global).
  const chunks: { start: number; pts: typeof pts }[] = [];
  for (let s = 0; s < pts.length; s += CHUNK) chunks.push({ start: s, pts: pts.slice(s, s + CHUNK) });

  const results = await Promise.allSettled(
    chunks.map((c) =>
      axios.get("https://api.open-meteo.com/v1/forecast", {
        params: {
          ...OM_BASE,
          latitude:  c.pts.map((p) => p.lat).join(","),
          longitude: c.pts.map((p) => p.lon).join(","),
        },
        timeout: 15000,
      })
    )
  );

  let anyOk = false;
  results.forEach((res, ci) => {
    if (res.status !== "fulfilled") {
      console.error("windfield chunk failed:", (res.reason as Error)?.message);
      return;
    }
    anyOk = true;
    // Multi-location responses come back as an array; single as an object.
    const items: Record<string, unknown>[] = Array.isArray(res.value.data) ? res.value.data : [res.value.data];
    const base = chunks[ci].start;
    items.forEach((item, k) => {
      const cur = item?.current as { wind_speed_10m?: number; wind_direction_10m?: number } | undefined;
      const spd = cur?.wind_speed_10m;   // knots
      const dir = cur?.wind_direction_10m; // degrees, direction wind comes FROM
      if (spd == null || dir == null) return;
      const r = (dir * Math.PI) / 180;
      // eastward (u) and northward (v) components, meteorological convention.
      u[base + k] = +(-spd * Math.sin(r)).toFixed(2);
      v[base + k] = +(-spd * Math.cos(r)).toFixed(2);
    });
  });

  if (!anyOk) {
    return NextResponse.json({ error: "windfield unavailable" }, { status: 503 });
  }

  const refTime = new Date().toISOString();
  const header = (parameterNumber: number, parameterNumberName: string) => ({
    parameterUnit: "kt",
    parameterNumber,
    parameterNumberName,
    parameterCategory: 2, // momentum
    dx: STEP,
    dy: STEP,
    la1: LAT_N,           // north edge (grid origin)
    lo1: LON_W,           // west edge
    la2: LAT_S,
    lo2: LON_E,
    nx: NX,
    ny: NY,
    refTime,
    forecastTime: 0,
  });

  const body: VelocityJSON = [
    { header: header(2, "eastward_wind"),  data: u },
    { header: header(3, "northward_wind"), data: v },
  ];

  cache = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { "x-windfield-cache": "miss" } });
}
