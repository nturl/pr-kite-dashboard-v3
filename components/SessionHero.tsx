"use client";

import { SpotWithWind } from "@/lib/spots";
import { C, kiteVerdict } from "@/lib/theme";

const MONO = "'JetBrains Mono', monospace";

function sourceLabel(src?: string): string {
  switch (src) {
    case "noaa":  return "NOAA METAR";
    case "ndbc":  return "NDBC BUOY";
    case "hrrr":  return "HRRR · 3KM";
    default:      return "OPEN-METEO";
  }
}

function headline(avg: number | null): string {
  const v = kiteVerdict(avg);
  if (v === "GO") return "Good wind\ntoday";
  if (v === "MARGINAL") return "Marginal\nright now";
  if (avg != null && avg > 30) return "Too much\nwind";
  return "Not enough\nwind";
}

// The verdict is the payload: full-bleed graphite, amber only when it's a GO —
// same signal rule as the rest of "The Instrument."
export default function SessionHero({ spot, loading }: { spot?: SpotWithWind; loading: boolean }) {
  if (loading || !spot) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: C.bg, color: C.mute,
        fontFamily: MONO, fontSize: 12, letterSpacing: "0.12em" }}>
        {loading ? "LOADING SESSION…" : "NO LIVE SPOT"}
      </div>
    );
  }

  const w    = spot.wind;
  const avg  = w?.avg ?? null;
  const gust = w?.gust ?? null;
  const isGo = kiteVerdict(avg) === "GO";
  const pinTR = spot.type === "buoy" && w?.waveHeight != null
    ? `${w.waveHeight.toFixed(1)} m swell`
    : gust != null ? `gust ${Math.round(gust)} kt` : "—";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", isolation: "isolate",
      background: `linear-gradient(176deg, ${C.panel} 0%, ${C.bg} 60%)` }}>
      {/* pins */}
      {(() => {
        const pinBase = { position: "absolute" as const, zIndex: 3, fontFamily: MONO, fontSize: 11.5,
          letterSpacing: "0.08em", color: C.mute, textTransform: "uppercase" as const };
        const inset = "clamp(16px,3vw,40px)";
        return (
          <>
            <span className="tnum" style={{ ...pinBase, top: "clamp(58px,8vh,86px)", left: inset }}>
              [ {w?.directionText ?? "—"}{w?.direction != null ? ` ${Math.round(w.direction)}°` : ""} ]
            </span>
            <span className="tnum" style={{ ...pinBase, top: "clamp(58px,8vh,86px)", right: inset }}>[ {pinTR} ]</span>
            <span className="tnum" style={{ ...pinBase, bottom: inset, right: inset }}>[ {sourceLabel(w?.source)} ]</span>
          </>
        );
      })()}

      {/* copy */}
      <div style={{ position: "absolute", left: "clamp(18px,3vw,44px)", bottom: "clamp(24px,4vw,44px)", zIndex: 3, maxWidth: "86%" }}>
        <div className="tnum" style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: C.mute, textTransform: "uppercase", marginBottom: 12 }}>
          [ {spot.name} · {avg != null ? Math.round(avg) : "—"} KT ]
        </div>
        <h2 style={{ fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 0.92,
          fontSize: "clamp(2.4rem, 1.4rem + 4.5vw, 5.6rem)", color: isGo ? C.amber : C.ink, textTransform: "uppercase", whiteSpace: "pre-line", margin: 0 }}>
          {headline(avg)}
        </h2>
      </div>
    </div>
  );
}
