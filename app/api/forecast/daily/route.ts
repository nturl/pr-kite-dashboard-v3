import { NextResponse } from "next/server";
import { getForecast } from "@/lib/wind";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL   = 60 * 60 * 1000; // 1 hour for daily

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  if (isNaN(lat) || isNaN(lon)) return NextResponse.json({ error: "lat and lon required" }, { status: 400 });

  const key    = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  try {
    const { daily } = await getForecast(lat, lon);
    cache.set(key, { data: daily, ts: Date.now() });
    return NextResponse.json(daily);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
