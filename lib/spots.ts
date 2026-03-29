export type SpotType = "kite" | "airport" | "buoy";
export type Region   = "North" | "East" | "South" | "West";

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
  source:        "noaa" | "ndbc" | "open-meteo";
  isGustOnly?:   boolean;
  waveHeight?:   number | null;
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

export const PR_SPOTS: Spot[] = [
  // ── Kite spots ──────────────────────────────────────────────────────────
  { id: "ocean-park",  name: "Ocean Park",  location: "San Juan",  lat: 18.45444, lon: -66.05504, region: "North", type: "kite" },
  { id: "shacks",      name: "Shacks",      location: "Aguadilla", lat: 18.50258, lon: -67.12644, region: "North", type: "kite" },
  { id: "las-picuas",  name: "Las Picuas",  location: "Río Mar",   lat: 18.4124,  lon: -65.7704,  region: "East",  type: "kite" },
  { id: "luquillo",    name: "Luquillo",    location: "Luquillo",  lat: 18.3865,  lon: -65.7289,  region: "East",  type: "kite" },
  { id: "dakiti",      name: "Dakiti",      location: "Culebra",   lat: 18.2924,  lon: -65.2791,  region: "East",  type: "kite" },
  { id: "ponce-kite",  name: "Ponce",       location: "Ponce",     lat: 18.01,    lon: -66.61,    region: "South", type: "kite" },
  { id: "pozuelo",     name: "Pozuelo",     location: "Guayama",   lat: 17.933,   lon: -66.1973,  region: "South", type: "kite" },
  { id: "la-parguera", name: "La Parguera", location: "Lajas",     lat: 17.9693,  lon: -67.0296,  region: "South", type: "kite" },
  { id: "boqueron",    name: "Boquerón",    location: "Cabo Rojo", lat: 18.0276,  lon: -67.1694,  region: "West",  type: "kite" },
  { id: "isabela",     name: "Isabela",     location: "Isabela",   lat: 18.5142,  lon: -67.0544,  region: "West",  type: "kite" },

  // ── Ocean buoys (NDBC) ──────────────────────────────────────────────────
  { id: "buoy-north",   name: "Buoy – North PR",      location: "North offshore", lat: 18.474, lon: -66.099, region: "North", type: "buoy", buoy: "41053" },
  { id: "buoy-vieques", name: "Buoy – Vieques Sound", location: "East offshore",  lat: 18.261, lon: -65.464, region: "East",  type: "buoy", buoy: "41056" },
  { id: "buoy-east",    name: "Buoy – East PR",       location: "SE offshore",    lat: 18.249, lon: -64.763, region: "East",  type: "buoy", buoy: "41052" },
  { id: "buoy-south",   name: "Buoy – South PR",      location: "South offshore", lat: 17.870, lon: -66.537, region: "South", type: "buoy", buoy: "42085" },

  // ── Airports (NOAA) ─────────────────────────────────────────────────────
  { id: "tjsj", name: "SJU – Muñoz Marín", location: "San Juan",  lat: 18.4394, lon: -66.0018, region: "North", type: "airport", noaa: "TJSJ" },
  { id: "tjig", name: "SIG – Isla Grande",  location: "San Juan",  lat: 18.4568, lon: -66.0981, region: "North", type: "airport", noaa: "TJIG" },
  { id: "tjbq", name: "BQN – Aguadilla",    location: "Aguadilla", lat: 18.4948, lon: -67.1294, region: "North", type: "airport", noaa: "TJBQ" },
  { id: "tjmz", name: "MAZ – Mayagüez",     location: "Mayagüez",  lat: 18.2556, lon: -67.1485, region: "West",  type: "airport", noaa: "TJMZ" },
  { id: "tjps", name: "PSE – Ponce",        location: "Ponce",     lat: 18.0083, lon: -66.5630, region: "South", type: "airport", noaa: "TJPS" },
  { id: "tjrv", name: "NRR – Ceiba",        location: "Ceiba",     lat: 18.2453, lon: -65.6434, region: "East",  type: "airport", noaa: "TJRV" },
  { id: "tjvq", name: "VQS – Vieques",      location: "Vieques",   lat: 18.1158, lon: -65.4936, region: "East",  type: "airport", noaa: "TJVQ" },
  { id: "tjcp", name: "CPX – Culebra",      location: "Culebra",   lat: 18.3127, lon: -65.3034, region: "East",  type: "airport", noaa: "TJCP" },
];
