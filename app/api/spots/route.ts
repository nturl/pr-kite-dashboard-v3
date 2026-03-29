import { NextResponse } from "next/server";
import { PR_SPOTS } from "@/lib/spots";
import { fetchSpot, fetchOpenMeteoBatch } from "@/lib/wind";

let cache: { data: unknown; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 min

export async function GET() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data, { headers: { "X-Cache": "HIT" } });
  }

  const stationSpots = PR_SPOTS.filter((s) => s.noaa || s.buoy);
  const omSpots      = PR_SPOTS.filter((s) => !s.noaa && !s.buoy);

  const stationResults = await Promise.all(stationSpots.map(fetchSpot));

  let omResults: Array<typeof omSpots[0] & { wind: unknown }> = omSpots.map((s) => ({ ...s, wind: null }));
  if (omSpots.length > 0) {
    try {
      const winds = await fetchOpenMeteoBatch(omSpots);
      omResults   = omSpots.map((s, i) => ({ ...s, wind: winds[i] ?? null }));
    } catch (err) {
      console.error("Open-Meteo batch error:", (err as Error).message);
    }
  }

  const byId  = new Map([...stationResults, ...omResults].map((r) => [r.id, r]));
  const results = PR_SPOTS.map((s) => byId.get(s.id) ?? { ...s, wind: null });

  cache = { data: results, ts: Date.now() };
  return NextResponse.json(results, { headers: { "X-Cache": "MISS" } });
}
