import { NextResponse } from "next/server";
import { SPOTS } from "@/lib/spots";
import { getDailyMaxBatch } from "@/lib/wind";

// Live weekly data — never prerender/freeze this at build (Next 14 static route).
export const dynamic = "force-dynamic";

let cache: { data: unknown; ts: number } | null = null;
const TTL = 60 * 60 * 1000; // 1 hour — the daily outlook barely moves within it

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) return NextResponse.json(cache.data);

  const kite = SPOTS.filter((s) => s.type === "kite");
  try {
    const { days, max } = await getDailyMaxBatch(kite);
    const spots = kite.map((s, i) => ({
      id: s.id, name: s.name, region: s.region, max: max[i] ?? [],
    }));
    const data = { days, spots };
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
