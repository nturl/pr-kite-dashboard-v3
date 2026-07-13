export type SpotType = "kite" | "airport" | "buoy";
export type Region   = "NC" | "NY" | "NJ" | "PR";

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

  // ── PR — Puerto Rico (the original spots) ───────────────────────────────
  // HRRR doesn't reach the Caribbean, so PR kite spots use Open-Meteo's
  // best_match model (no live-vs-model gap — the sea-breeze story is a US-coast
  // thing); airports are live METAR. The 4 offshore NDBC buoys 41053/41056/
  // 41052/42085 are all offline right now (last data 9–25 days old), so omitted.
  { id: "ocean-park",  name: "Ocean Park",  location: "San Juan, PR",  lat: 18.45444, lon: -66.05504, region: "PR", type: "kite" },
  { id: "shacks",      name: "Shacks",      location: "Aguadilla, PR", lat: 18.50258, lon: -67.12644, region: "PR", type: "kite" },
  { id: "las-picuas",  name: "Las Picuas",  location: "Río Mar, PR",   lat: 18.4124,  lon: -65.7704,  region: "PR", type: "kite" },
  { id: "luquillo",    name: "Luquillo",    location: "Luquillo, PR",  lat: 18.3865,  lon: -65.7289,  region: "PR", type: "kite" },
  { id: "dakiti",      name: "Dakiti",      location: "Culebra, PR",   lat: 18.2924,  lon: -65.2791,  region: "PR", type: "kite" },
  { id: "ponce-kite",  name: "Ponce",       location: "Ponce, PR",     lat: 18.01,    lon: -66.61,    region: "PR", type: "kite" },
  { id: "pozuelo",     name: "Pozuelo",     location: "Guayama, PR",   lat: 17.933,   lon: -66.1973,  region: "PR", type: "kite" },
  { id: "la-parguera", name: "La Parguera", location: "Lajas, PR",     lat: 17.9693,  lon: -67.0296,  region: "PR", type: "kite" },
  { id: "boqueron",    name: "Boquerón",    location: "Cabo Rojo, PR", lat: 18.0276,  lon: -67.1694,  region: "PR", type: "kite" },
  { id: "isabela",     name: "Isabela",     location: "Isabela, PR",   lat: 18.5142,  lon: -67.0544,  region: "PR", type: "kite" },
  { id: "tjsj", name: "SJU – Muñoz Marín", location: "San Juan, PR",  lat: 18.4394, lon: -66.0018, region: "PR", type: "airport", noaa: "TJSJ" },
  { id: "tjig", name: "SIG – Isla Grande", location: "San Juan, PR",  lat: 18.4568, lon: -66.0981, region: "PR", type: "airport", noaa: "TJIG" },
  { id: "tjbq", name: "BQN – Aguadilla",   location: "Aguadilla, PR", lat: 18.4948, lon: -67.1294, region: "PR", type: "airport", noaa: "TJBQ" },
  { id: "tjmz", name: "MAZ – Mayagüez",    location: "Mayagüez, PR",  lat: 18.2556, lon: -67.1485, region: "PR", type: "airport", noaa: "TJMZ" },
  { id: "tjps", name: "PSE – Ponce",       location: "Ponce, PR",     lat: 18.0083, lon: -66.5630, region: "PR", type: "airport", noaa: "TJPS" },
  { id: "tjrv", name: "NRR – Ceiba",       location: "Ceiba, PR",     lat: 18.2453, lon: -65.6434, region: "PR", type: "airport", noaa: "TJRV" },
  { id: "tjvq", name: "VQS – Vieques",     location: "Vieques, PR",   lat: 18.1158, lon: -65.4936, region: "PR", type: "airport", noaa: "TJVQ" },
  { id: "tjcp", name: "CPX – Culebra",     location: "Culebra, PR",   lat: 18.3127, lon: -65.3034, region: "PR", type: "airport", noaa: "TJCP" },
];
