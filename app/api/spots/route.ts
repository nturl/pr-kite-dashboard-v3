import { NextResponse } from "next/server";
import { SPOTS } from "@/lib/spots";
import { fetchSpot, fetchOpenMeteoBatch } from "@/lib/wind";

// Force per-request execution. Without this, Next.js statically prerenders this
// parameterless GET at build time and Vercel serves that frozen snapshot forever
// — the client polls every 5 min but only ever re-fetches the build-time file,
// so the dashboard showed deploy-day wind under a "LIVE" badge.
export const dynamic = "force-dynamic";

let cache: { data: unknown; ts: number } = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min — matches the client poll + "refreshes every 5 min" copy

// Include X-Fetched-At (the real upstream-fetch time) so the client can show the
// true data age instead of "now", and no-store so no CDN layer can freeze it again.
function windJson(data: unknown, hit: boolean, ts: number) {
  return NextResponse.json(data, {
    headers: {
      "X-Cache":       hit ? "HIT" : "MISS",
      "X-Fetched-At":  new Date(ts).toISOString(),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return windJson(cache.data, true, cache.ts);
  }

  const stationSpots = SPOTS.filter((s) => s.noaa || s.buoy);
  const omSpots      = SPOTS.filter((s) => !s.noaa && !s.buoy);

  // Station fetches and the Open-Meteo model batch are independent — run them
  // concurrently. fetchSpot never rejects (it catches internally); the batch
  // falls back to nulls so one upstream outage can't sink the whole response.
  const [stationResults, omWinds] = await Promise.all([
    Promise.all(stationSpots.map(fetchSpot)),
    fetchOpenMeteoBatch(omSpots).catch((err) => {
      console.error("Open-Meteo batch error:", (err as Error).message);
      return omSpots.map(() => null);
    }),
  ]);
  const omResults = omSpots.map((s, i) => ({ ...s, wind: omWinds[i] ?? null }));

  const byId  = new Map([...stationResults, ...omResults].map((r) => [r.id, r]));
  const results = SPOTS.map((s) => byId.get(s.id) ?? { ...s, wind: null });

  cache = { data: results, ts: Date.now() };
  return windJson(results, false, cache.ts);
}
