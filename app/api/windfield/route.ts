import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

// Windy-style animated wind layer needs a *field* of u/v vectors on a regular
// grid, not the sparse per-spot readings the rest of the app uses. We sample
// Open-Meteo (the same source the tracker already trusts) on a coarse lat/lon
// grid and emit the velocity-JSON format leaflet-velocity consumes.
//
// Two scopes, Windy-style: the map swaps between them by viewport so particles
// cover every visible pixel at every zoom instead of rendering a hard-edged
// data box (?scope=):
//   region (default) — 1° grid over the spots (Caribbean → Nova Scotia),
//                      fine enough to show mesoscale structure when zoomed in.
//   global           — 8° whole-earth grid for wide/world zooms. nx*dx = 360
//                      so leaflet-velocity treats it as continuous and wraps.

export const dynamic = "force-dynamic"; // Next 14 froze this to a static 404 without it
export const maxDuration = 60; // global fill + 429 retry ladder can exceed the 10s default

type Scope = "region" | "global";

// Grid boxes + resolution. Origin is the NW corner (leaflet-velocity's la1/lo1).
// REGION must stay in sync with REGION_BOX in components/KiteMap.tsx.
const GRIDS: Record<Scope, { latN: number; latS: number; lonW: number; lonE: number; step: number; wrap: boolean }> = {
  region: { latN: 46, latS: 10, lonW: -92, lonE: -55, step: 1, wrap: false },
  // 8°/900 pts: coarse is fine at wide zooms (synoptic flow only), and it keeps
  // a fill inside Open-Meteo's free-tier per-minute rate window (6°/1620 and
  // 5°/2376 both 429'd their way to 503s). nx*dx = 45*8 = 360 so it wraps.
  global: { latN: 76, latS: -76, lonW: -180, lonE: 172, step: 8, wrap: true },
};

const CHUNK = 100;               // Open-Meteo locations per request
const TTL_MS = 60 * 60 * 1000;   // decorative flow; cache hard
// After a failed fill, don't touch upstream again for this long: each attempt
// costs up to chunks*retries of rate budget, so hammering only deepens the 429.
const FAIL_COOLDOWN_MS = 60 * 1000;

const OM_BASE = {
  current: "wind_speed_10m,wind_direction_10m",
  wind_speed_unit: "kn",
  timezone: "GMT",
};

type VelocityJSON = { header: Record<string, unknown>; data: (number | null)[] }[];
// caches entries never expire — a stale field beats a 503 (the layer is
// decorative). TTL_MS only gates when we try to refresh.
const caches: Partial<Record<Scope, { at: number; body: VelocityJSON }>> = {};
const inflight: Partial<Record<Scope, Promise<VelocityJSON | null>>> = {};
const lastFail: Partial<Record<Scope, number>> = {};

// Partially filled grids survive across requests (module scope, so across
// invocations while the lambda stays warm). Open-Meteo's per-minute budget —
// shared with every other tenant on this egress IP — often can't absorb a
// full grid in one burst, so each request advances the fill as far as the
// rate window allows and the field publishes once the last chunk lands.
type Progress = { u: (number | null)[]; v: (number | null)[]; next: number; startedAt: number };
const progress: Partial<Record<Scope, Progress>> = {};
const PROGRESS_MAX_AGE_MS = 30 * 60 * 1000; // don't stitch samples further apart than this
const FILL_SOFT_BUDGET_MS = 20 * 1000;      // per-invocation cap; the client polls for the rest

// Grid points in the exact scan order the plugin expects: row-major,
// north→south (lat = latN - j*step), west→east (lon = lonW + i*step).
function gridPoints(scope: Scope): { lat: number; lon: number }[] {
  const g = GRIDS[scope];
  const nx = Math.round((g.lonE - g.lonW) / g.step) + 1;
  const ny = Math.round((g.latN - g.latS) / g.step) + 1;
  const pts: { lat: number; lon: number }[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      pts.push({ lat: +(g.latN - j * g.step).toFixed(4), lon: +(g.lonW + i * g.step).toFixed(4) });
    }
  }
  return pts;
}

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" };

export async function GET(req: NextRequest) {
  const scope: Scope = req.nextUrl.searchParams.get("scope") === "global" ? "global" : "region";
  const cached = caches[scope];
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json(cached.body, { headers: { "x-windfield-cache": "hit", ...CACHE_HEADERS } });
  }

  // Cooling down after a failed fill: serve whatever we have rather than
  // burning more rate budget (each fill attempt costs chunks*retries).
  if (Date.now() - (lastFail[scope] ?? 0) < FAIL_COOLDOWN_MS) {
    if (cached) return NextResponse.json(cached.body, { headers: { "x-windfield-cache": "stale", ...CACHE_HEADERS } });
    return NextResponse.json({ error: "windfield unavailable" }, { status: 503 });
  }

  // Single-flight: concurrent requests (e.g. several clients zooming out at
  // once) share one upstream fill instead of each launching their own burst.
  const body = await (inflight[scope] ??= fillField(scope).finally(() => { delete inflight[scope]; }));

  if (!body) {
    lastFail[scope] = Date.now();
    if (cached) return NextResponse.json(cached.body, { headers: { "x-windfield-cache": "stale", ...CACHE_HEADERS } });
    return NextResponse.json({ error: "windfield unavailable" }, { status: 503 });
  }

  delete lastFail[scope];
  caches[scope] = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { "x-windfield-cache": "miss", ...CACHE_HEADERS } });
}

async function fillField(scope: Scope): Promise<VelocityJSON | null> {
  const g = GRIDS[scope];
  const nx = Math.round((g.lonE - g.lonW) / g.step) + 1;
  const ny = Math.round((g.latN - g.latS) / g.step) + 1;
  const pts = gridPoints(scope);

  // Chunked fetch; best_match so it covers both CONUS (HRRR) and open ocean
  // (global). A partially filled grid would render as holes/seams — the exact
  // artifact this two-scope setup exists to remove — so the field publishes
  // only when complete; until then partial progress is banked, not served.
  const chunks: { start: number; pts: typeof pts }[] = [];
  for (let s = 0; s < pts.length; s += CHUNK) chunks.push({ start: s, pts: pts.slice(s, s + CHUNK) });

  let prog = progress[scope];
  if (!prog || Date.now() - prog.startedAt > PROGRESS_MAX_AGE_MS) {
    prog = progress[scope] = {
      u: new Array<number | null>(pts.length).fill(null),
      v: new Array<number | null>(pts.length).fill(null),
      next: 0,
      startedAt: Date.now(),
    };
  }
  const { u, v } = prog;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fetchChunk = async (c: (typeof chunks)[number], attempt = 0): Promise<Record<string, unknown>[] | null> => {
    try {
      const res = await axios.get("https://api.open-meteo.com/v1/forecast", {
        params: {
          ...OM_BASE,
          latitude:  c.pts.map((p) => p.lat).join(","),
          longitude: c.pts.map((p) => p.lon).join(","),
        },
        timeout: 15000,
      });
      // Multi-location responses come back as an array; single as an object.
      return Array.isArray(res.data) ? res.data : [res.data];
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 429 && attempt < 1) {
        await sleep(2500);
        return fetchChunk(c, attempt + 1);
      }
      console.error("windfield chunk failed:", (e as Error)?.message);
      return null;
    }
  };

  const t0 = Date.now();
  while (prog.next < chunks.length) {
    if (Date.now() - t0 > FILL_SOFT_BUDGET_MS) return null; // out of time; resume next request
    const c = chunks[prog.next];
    const items = await fetchChunk(c);
    if (!items) return null; // rate window exhausted; progress is banked
    items.forEach((item, k) => {
      const cur = item?.current as { wind_speed_10m?: number; wind_direction_10m?: number } | undefined;
      const spd = cur?.wind_speed_10m;   // knots
      const dir = cur?.wind_direction_10m; // degrees, direction wind comes FROM
      if (spd == null || dir == null) return;
      const r = (dir * Math.PI) / 180;
      // eastward (u) and northward (v) components, meteorological convention.
      u[c.start + k] = +(-spd * Math.sin(r)).toFixed(2);
      v[c.start + k] = +(-spd * Math.cos(r)).toFixed(2);
    });
    prog.next++;
  }
  delete progress[scope];

  const refTime = new Date().toISOString();
  const header = (parameterNumber: number, parameterNumberName: string) => ({
    parameterUnit: "kt",
    parameterNumber,
    parameterNumberName,
    parameterCategory: 2, // momentum
    dx: g.step,
    dy: g.step,
    la1: g.latN,          // north edge (grid origin)
    lo1: g.lonW,          // west edge
    la2: g.latS,
    lo2: g.lonE,
    nx,
    ny,
    refTime,
    forecastTime: 0,
  });

  return [
    { header: header(2, "eastward_wind"),  data: u },
    { header: header(3, "northward_wind"), data: v },
  ];
}
