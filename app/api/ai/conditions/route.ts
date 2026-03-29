import { NextResponse } from "next/server";
import { analyzeConditions, getRegionalSummaries } from "@/lib/gemini";
import { SpotWithWind } from "@/lib/spots";

// Cache Gemini results for 20 min — no need to call on every page load
let cache: { verdicts: unknown; summaries: unknown; ts: number } | null = null;
const TTL = 20 * 60 * 1000;

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  }

  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ verdicts: cache.verdicts, summaries: cache.summaries, cached: true });
  }

  try {
    const spots = (await req.json()) as SpotWithWind[];
    const [verdicts, summaries] = await Promise.all([
      analyzeConditions(spots),
      getRegionalSummaries(spots),
    ]);

    cache = { verdicts, summaries, ts: Date.now() };
    return NextResponse.json({ verdicts, summaries, cached: false });
  } catch (err) {
    console.error("Gemini conditions error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
