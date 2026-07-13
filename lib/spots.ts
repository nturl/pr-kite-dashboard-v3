export type SpotType = "kite" | "airport" | "buoy";
export type Region   = "NC" | "NY" | "NJ";

export interface Spot {
  id:       string;
  name:     string;
  location: string;
  lat:      number;
  lon:      number;
  region:   Region;
  type:     SpotType;
  noaa?:    string; // NOAA airport station ID
  buoy?:    string; // NDBC buoy ID
}

export interface WindData {
  avg:           number | null;
  gust:          number | null;
  direction:     number | null;
  directionText: string | null;
  timestamp:     string | null;
  source:        "noaa" | "ndbc" | "hrrr" | "open-meteo";
  isGustOnly?:   boolean;
  waveHeight?:   number | null;
  // Live-vs-model gap: for modeled (HRRR) kite spots we also fetch the coarse
  // global model (ECMWF ~25 km — what Windy shows by default) so the UI can
  // surface how much wind the global model is under-calling. This is the whole
  // reason the tracker exists: HRRR resolves the coastal sea breeze that the
  // global models smear out.
  globalAvg?:    number | null; // ECMWF global wind at the same point (kts)
  modelGap?:     number | null; // hrrr avg − global avg (kts); positive = globals under-calling
}

export interface SpotWithWind extends Spot {
  wind:   WindData | null;
  error?: string;
}

export interface ForecastHour {
  time:      string;
  avg:       number | null;
  gust:      number | null;
  direction: number | null;
}

export interface ForecastDay {
  date:      string;
  max:       number | null;
  gust:      number | null;
  direction: number | null;
}

export const SPOTS: Spot[] = [
  // ── NC — Topsail (home spot) ────────────────────────────────────────────
  // No wind sensor sits at Topsail itself; the nearest reporting stations are
  // the Wrightsville Beach cluster ~25–28 mi SW, so those are the live
  // ground-truth references for the home spot.
  { id: "topsail",  name: "Topsail Beach",         location: "Topsail Island, NC", lat: 34.371,  lon: -77.630,  region: "NC", type: "kite" },
  { id: "jmpn7",    name: "Mercer's Pier",         location: "Wrightsville, NC",   lat: 34.213,  lon: -77.786,  region: "NC", type: "buoy",    buoy: "JMPN7" },
  { id: "41038",    name: "Wrightsville Nearshore",location: "Nearshore, NC",      lat: 34.141,  lon: -77.715,  region: "NC", type: "buoy",    buoy: "41038" },
  { id: "41037",    name: "Wrightsville Offshore", location: "Offshore, NC",       lat: 33.988,  lon: -77.362,  region: "NC", type: "buoy",    buoy: "41037" },
  { id: "kilm",     name: "ILM – Wilmington",      location: "Wilmington, NC",     lat: 34.2668, lon: -77.8999, region: "NC", type: "airport", noaa: "KILM" },

  // ── NY — Brooklyn / Queens / Long Island ────────────────────────────────
  { id: "plumb-beach",  name: "Plumb Beach",   location: "Brooklyn, NY",       lat: 40.5847, lon: -73.9207, region: "NY", type: "kite" },
  { id: "breezy-point", name: "Breezy Point",  location: "Queens, NY",         lat: 40.5546, lon: -73.9293, region: "NY", type: "kite" },
  { id: "far-rockaway", name: "Far Rockaway",  location: "Queens, NY",         lat: 40.6000, lon: -73.7510, region: "NY", type: "kite" },
  { id: "oak-beach",    name: "Oak Beach",     location: "Great South Bay, NY",lat: 40.6386, lon: -73.2887, region: "NY", type: "kite" },
  { id: "44065",        name: "NY Harbor Entrance", location: "NY Harbor, NY", lat: 40.368,  lon: -73.701,  region: "NY", type: "buoy",    buoy: "44065" },
  { id: "kjfk",         name: "JFK",           location: "Queens, NY",         lat: 40.6392, lon: -73.7639, region: "NY", type: "airport", noaa: "KJFK" },

  // ── NJ — Sandy Hook ─────────────────────────────────────────────────────
  { id: "sandy-hook", name: "Sandy Hook",         location: "Gateway NRA, NJ", lat: 40.4350, lon: -73.9900, region: "NJ", type: "kite" },
  { id: "sdhn4",      name: "Sandy Hook Station",  location: "Sandy Hook, NJ",  lat: 40.467,  lon: -74.009,  region: "NJ", type: "buoy", buoy: "SDHN4" },
];
