import axios from "axios";
import { Spot, SpotWithWind, WindData } from "./spots";

const MS_TO_KTS  = 1.94384;
const KMH_TO_KTS = 0.539957; // 1 / 1.852
const NOAA_UA    = "KitePR-Dashboard/3.0 (kitesurfing wind tracker)";

export function degToCompass(deg: number | null): string | null {
  if (deg == null) return null;
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

// api.weather.gov reports wind speed in km/h (unitCode "wmoUnit:km_h-1") for
// virtually every station today; a handful of legacy stations still report m/s.
// Convert off the unitCode so we never mistake one for the other — assuming m/s
// here is what showed SJU at 76 kts instead of 21. Default to km/h, the current
// NWS default, when the unitCode is absent.
function nwsSpeedToKnots(value: number | null | undefined, unitCode?: string): number | null {
  if (value == null) return null;
  const kts = unitCode?.includes("m_s") ? value * MS_TO_KTS : value * KMH_TO_KTS;
  return parseFloat(kts.toFixed(1));
}

// ── NOAA airport observations ────────────────────────────────────────────
export async function fetchNOAA(stationId: string): Promise<WindData | null> {
  const res = await axios.get(
    `https://api.weather.gov/stations/${stationId}/observations/latest`,
    { headers: { "User-Agent": NOAA_UA, Accept: "application/json" }, timeout: 10000 }
  );
  const p = res.data?.properties;
  if (!p) return null;
  const dirDeg = p.windDirection?.value as number | null;
  return {
    avg:           nwsSpeedToKnots(p.windSpeed?.value, p.windSpeed?.unitCode),
    gust:          nwsSpeedToKnots(p.windGust?.value, p.windGust?.unitCode),
    direction:     dirDeg,
    directionText: degToCompass(dirDeg),
    timestamp:     p.timestamp ?? null,
    source:        "noaa",
    isGustOnly:    false,
  };
}

// ── NDBC ocean buoys ─────────────────────────────────────────────────────
export async function fetchNDBC(stationId: string): Promise<WindData | null> {
  const res = await axios.get(
    `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`,
    { headers: { "User-Agent": NOAA_UA }, timeout: 10000 }
  );
  const lines = (res.data as string).split("\n").filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return null;
  const parts = lines[0].trim().split(/\s+/);
  // cols: YY MM DD hh mm WDIR WSPD GST WVHT ...
  const parse = (v: string) => (v === "MM" || v == null) ? null : parseFloat(v);
  const wspd = parse(parts[6]);
  const gst  = parse(parts[7]);
  const wdir = parse(parts[5]);
  const wvht = parse(parts[8]);
  const [yr, mo, dy, hr, mn] = parts;
  return {
    avg:           wspd != null ? parseFloat((wspd * MS_TO_KTS).toFixed(1)) : null,
    gust:          gst  != null ? parseFloat((gst  * MS_TO_KTS).toFixed(1)) : null,
    direction:     wdir,
    directionText: degToCompass(wdir),
    waveHeight:    wvht,
    timestamp:     `${yr}-${mo}-${dy}T${hr}:${mn}:00`,
    source:        "ndbc",
    isGustOnly:    false,
  };
}

// ── Open-Meteo single spot ───────────────────────────────────────────────
// Fallback when a spot's own station is unreachable. Uses best_match so it
// works everywhere — Open-Meteo auto-picks HRRR for US-coast points and a
// covering global model for Puerto Rico (which HRRR doesn't reach).
export async function fetchOpenMeteo(lat: number, lon: number): Promise<WindData | null> {
  const res = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: lat, longitude: lon,
      current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      wind_speed_unit: "kn",
      timezone: "America/New_York",
    },
    timeout: 10000,
  });
  const c = res.data?.current;
  if (!c) return null;
  return {
    avg:           c.wind_speed_10m   != null ? parseFloat(c.wind_speed_10m.toFixed(1))   : null,
    gust:          c.wind_gusts_10m  != null ? parseFloat(c.wind_gusts_10m.toFixed(1))  : null,
    direction:     c.wind_direction_10m ?? null,
    directionText: degToCompass(c.wind_direction_10m),
    timestamp:     c.time,
    source:        "open-meteo",
    isGustOnly:    false,
  };
}

// ── Open-Meteo batch (many spots per request) ────────────────────────────
const asItems = (data: unknown): Record<string, unknown>[] =>
  (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
const currentOf = (item: Record<string, unknown> | undefined) =>
  (item?.current as Record<string, number> | null | undefined) ?? null;

const OM_BASE = {
  current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  wind_speed_unit: "kn",
  timezone: "America/New_York",
};

export async function fetchOpenMeteoBatch(spots: Spot[]): Promise<(WindData | null)[]> {
  if (!spots.length) return [];
  const out: (WindData | null)[] = new Array(spots.length).fill(null);

  // HRRR only covers the continental US. Split the request: mainland spots get
  // HRRR (3 km) plus the coarse global model so we can surface the live-vs-model
  // gap; Puerto Rico spots (Caribbean, outside the HRRR domain) get Open-Meteo's
  // best_match model with no gap. Run via allSettled so a mainland HRRR outage
  // (and its best_match fallback) can't null out PR's otherwise-healthy data,
  // or vice versa — see notes/session-2026-07-12.md, Audit Finding 1.
  const mainland = spots.map((_, i) => i).filter((i) => spots[i].region !== "PR");
  const pr       = spots.map((_, i) => i).filter((i) => spots[i].region === "PR");

  const mainlandPromise: Promise<(WindData | null)[]> = mainland.length
    ? fetchHrrrWithGap(mainland.map((i) => spots[i]))
    : Promise.resolve([]);
  const prPromise: Promise<(WindData | null)[]> = pr.length
    ? fetchBestMatchBatch(pr.map((i) => spots[i]))
    : Promise.resolve([]);

  const [mainlandResult, prResult] = await Promise.allSettled([mainlandPromise, prPromise]);

  if (mainlandResult.status === "fulfilled") {
    mainland.forEach((i, k) => { out[i] = mainlandResult.value[k]; });
  } else {
    console.error("Mainland Open-Meteo batch failed entirely:", (mainlandResult.reason as Error).message);
  }
  if (prResult.status === "fulfilled") {
    pr.forEach((i, k) => { out[i] = prResult.value[k]; });
  } else {
    console.error("PR Open-Meteo batch failed entirely:", (prResult.reason as Error).message);
  }

  return out;
}

// Mainland: gfs_hrrr (trusted high-res) primary + ecmwf_ifs025 (~25 km global,
// what Windy shows by default). Open-Meteo collapses a multi-model `current`
// request to one model, so we call each separately and diff them — that gap is
// the headline the tracker exists to surface.
async function fetchHrrrWithGap(spots: Spot[]): Promise<(WindData | null)[]> {
  const get = (model?: string) =>
    axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        ...OM_BASE,
        latitude:  spots.map((s) => s.lat).join(","),
        longitude: spots.map((s) => s.lon).join(","),
        ...(model ? { models: model } : {}),
      },
      timeout: 15000,
    });

  // The two model calls are independent — run them concurrently instead of
  // paying two sequential round-trips on every /api/spots cache miss.
  const [hrrrRes, ecmwfRes] = await Promise.allSettled([get("gfs_hrrr"), get("ecmwf_ifs025")]);

  let hrrrItems: Record<string, unknown>[];
  if (hrrrRes.status === "fulfilled") {
    hrrrItems = asItems(hrrrRes.value.data);
  } else {
    console.error("Open-Meteo HRRR batch error, falling back to best_match:", (hrrrRes.reason as Error).message);
    const bm = asItems((await get()).data);
    return spots.map((_, i) => toWind(currentOf(bm[i]), "open-meteo"));
  }

  // Global model is best-effort — its only job is the gap annotation.
  let ecmwfItems: Record<string, unknown>[] = [];
  if (ecmwfRes.status === "fulfilled") {
    ecmwfItems = asItems(ecmwfRes.value.data);
  } else {
    console.error("Open-Meteo ECMWF batch error (gap unavailable):", (ecmwfRes.reason as Error).message);
  }

  return spots.map((_, i) => {
    const wind = toWind(currentOf(hrrrItems[i]), "hrrr");
    if (!wind) return null;
    const g = currentOf(ecmwfItems[i]);
    const globalAvg = g?.wind_speed_10m != null ? parseFloat(g.wind_speed_10m.toFixed(1)) : null;
    wind.globalAvg = globalAvg;
    wind.modelGap  = wind.avg != null && globalAvg != null
      ? parseFloat((wind.avg - globalAvg).toFixed(1))
      : null;
    return wind;
  });
}

// Puerto Rico (and any non-CONUS point): best_match lets Open-Meteo pick the
// best available model for the location. No high-res-vs-global gap here.
async function fetchBestMatchBatch(spots: Spot[]): Promise<(WindData | null)[]> {
  const res = await axios
    .get("https://api.open-meteo.com/v1/forecast", {
      params: {
        ...OM_BASE,
        latitude:  spots.map((s) => s.lat).join(","),
        longitude: spots.map((s) => s.lon).join(","),
      },
      timeout: 15000,
    })
    .catch((err) => {
      console.error("Open-Meteo best_match batch error:", (err as Error).message);
      return null;
    });
  if (!res) return spots.map(() => null);
  return asItems(res.data).map((it) => toWind(currentOf(it), "open-meteo"));
}

function toWind(c: Record<string, number> | null, source: WindData["source"]): WindData | null {
  if (!c) return null;
  return {
    avg:           c.wind_speed_10m     != null ? parseFloat(c.wind_speed_10m.toFixed(1))  : null,
    gust:          c.wind_gusts_10m     != null ? parseFloat(c.wind_gusts_10m.toFixed(1))  : null,
    direction:     c.wind_direction_10m ?? null,
    directionText: degToCompass(c.wind_direction_10m ?? null),
    timestamp:     (c as Record<string, unknown>).time as string ?? null,
    source,
    isGustOnly:    false,
  };
}

// ── Fetch a single spot ──────────────────────────────────────────────────
export async function fetchSpot(spot: Spot): Promise<SpotWithWind> {
  try {
    if (spot.buoy) {
      const wind = await fetchNDBC(spot.buoy).catch(() => fetchOpenMeteo(spot.lat, spot.lon));
      return { ...spot, wind };
    }
    if (spot.noaa) {
      const wind = await fetchNOAA(spot.noaa).catch(() => fetchOpenMeteo(spot.lat, spot.lon));
      return { ...spot, wind };
    }
    const wind = await fetchOpenMeteo(spot.lat, spot.lon);
    return { ...spot, wind };
  } catch (err) {
    return { ...spot, wind: null, error: (err as Error).message };
  }
}

// ── Forecast (hourly + daily) ────────────────────────────────────────────
// One upstream call returns BOTH hourly and daily, but the two forecast routes
// each call this and discard half — so expanding a spot card fetched the same
// data twice. Cache the promise per coordinate so concurrent hourly/daily
// requests share a single Open-Meteo call. Failed calls are evicted so an
// upstream blip isn't cached for the full TTL.
const FORECAST_TTL = 30 * 60 * 1000; // matches the shorter (hourly) route cache
const forecastCache = new Map<string, { ts: number; promise: ReturnType<typeof fetchForecast> }>();

export function getForecast(lat: number, lon: number) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = forecastCache.get(key);
  if (hit && Date.now() - hit.ts < FORECAST_TTL) return hit.promise;
  const promise = fetchForecast(lat, lon);
  forecastCache.set(key, { ts: Date.now(), promise });
  promise.catch(() => forecastCache.delete(key));
  return promise;
}

async function fetchForecast(lat: number, lon: number) {
  const res = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: lat, longitude: lon,
      hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      daily:  "wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant",
      wind_speed_unit: "kn",
      timezone: "America/New_York",
      forecast_days: 7,
    },
    timeout: 15000,
  });

  const h   = res.data.hourly as Record<string, (number | null)[]>;
  const d   = res.data.daily  as Record<string, (number | string | null)[]>;
  const now = new Date();

  const hourly = (h.time as unknown as string[])
    .map((t, i) => ({
      time:      t,
      avg:       h.wind_speed_10m[i]    != null ? parseFloat((h.wind_speed_10m[i] as number).toFixed(1))    : null,
      gust:      h.wind_gusts_10m[i]   != null ? parseFloat((h.wind_gusts_10m[i] as number).toFixed(1))   : null,
      direction: h.wind_direction_10m[i] ?? null,
    }))
    .filter((hr) => new Date(hr.time) >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()))
    .slice(0, 24);

  const daily = (d.time as string[]).map((date, i) => ({
    date,
    max:       d.wind_speed_10m_max[i]          != null ? parseFloat((d.wind_speed_10m_max[i] as number).toFixed(1))          : null,
    gust:      d.wind_gusts_10m_max[i]          != null ? parseFloat((d.wind_gusts_10m_max[i] as number).toFixed(1))          : null,
    direction: d.wind_direction_10m_dominant[i] ?? null,
  }));

  return { hourly, daily };
}

// ── Weekly daily-max, many spots per request (the Almanac) ────────────────
// One batched multi-point call. Uses best_match (not gfs_hrrr): HRRR only
// forecasts ~48 h, so it can't back a 7-day outlook — best_match lets Open-Meteo
// pick a model that reaches a week for each point, PR included.
export async function getDailyMaxBatch(spots: Spot[]): Promise<{ days: string[]; max: (number | null)[][] }> {
  if (!spots.length) return { days: [], max: [] };
  const res = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude:  spots.map((s) => s.lat).join(","),
      longitude: spots.map((s) => s.lon).join(","),
      daily: "wind_speed_10m_max",
      wind_speed_unit: "kn",
      timezone: "America/New_York",
      forecast_days: 7,
    },
    timeout: 20000,
  });
  const items = asItems(res.data);
  let days: string[] = [];
  const max = spots.map((_, i) => {
    const dd = items[i]?.daily as Record<string, (number | null)[]> | undefined;
    if (!dd) return new Array(7).fill(null) as (number | null)[];
    if (!days.length && Array.isArray(dd.time)) days = dd.time as unknown as string[];
    return (dd.wind_speed_10m_max ?? []).map((v) => (v != null ? parseFloat((v as number).toFixed(1)) : null));
  });
  return { days, max };
}
