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

// ── Open-Meteo single spot (HRRR) ────────────────────────────────────────
// Used as the fallback when a spot's own station is unreachable. Pinned to
// NOAA HRRR (3 km) so coastal points get the high-res sea-breeze reading
// rather than a coarse global that flattens it.
export async function fetchOpenMeteo(lat: number, lon: number): Promise<WindData | null> {
  const res = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: lat, longitude: lon,
      current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      wind_speed_unit: "kn",
      timezone: "America/New_York",
      models: "gfs_hrrr",
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
    source:        "hrrr",
    isGustOnly:    false,
  };
}

// ── Open-Meteo batch (many spots in ONE request) ─────────────────────────
// Fetches TWO models per spot: gfs_hrrr (NOAA HRRR, 3 km — the trusted high-res
// reading that resolves the coastal sea breeze) and ecmwf_ifs025 (~25 km global,
// what Windy shows by default). Open-Meteo collapses a multi-model `current`
// request down to a single model, so we request them in separate calls and diff
// them — that gap is the headline the tracker exists to surface.
const asItems = (data: unknown): Record<string, unknown>[] =>
  (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
const currentOf = (item: Record<string, unknown> | undefined) =>
  (item?.current as Record<string, number> | null | undefined) ?? null;

export async function fetchOpenMeteoBatch(spots: Spot[]): Promise<(WindData | null)[]> {
  if (!spots.length) return [];

  const baseParams = {
    latitude:  spots.map((s) => s.lat).join(","),
    longitude: spots.map((s) => s.lon).join(","),
    current:   "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    wind_speed_unit: "kn",
    timezone:  "America/New_York",
  };
  const get = (model?: string) =>
    axios.get("https://api.open-meteo.com/v1/forecast", {
      params: model ? { ...baseParams, models: model } : baseParams,
      timeout: 15000,
    });

  // Primary reading = HRRR. If HRRR is unreachable, fall back to Open-Meteo's
  // best_match so spots still show a number (no gap in that case).
  let hrrrItems: Record<string, unknown>[];
  try {
    hrrrItems = asItems((await get("gfs_hrrr")).data);
  } catch (err) {
    console.error("Open-Meteo HRRR batch error, falling back to best_match:", (err as Error).message);
    const bm = asItems((await get()).data);
    return spots.map((_, i) => toWind(currentOf(bm[i]), "open-meteo"));
  }

  // Global model is best-effort — its only job is the gap annotation.
  let ecmwfItems: Record<string, unknown>[] = [];
  try {
    ecmwfItems = asItems((await get("ecmwf_ifs025")).data);
  } catch (err) {
    console.error("Open-Meteo ECMWF batch error (gap unavailable):", (err as Error).message);
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
export async function getForecast(lat: number, lon: number) {
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
