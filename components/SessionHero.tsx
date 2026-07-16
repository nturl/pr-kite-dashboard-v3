"use client";

import { SpotWithWind } from "@/lib/spots";
import { C, kiteVerdict } from "@/lib/theme";

const MONO = "'JetBrains Mono', monospace";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

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

// The Session (B): the reason you check is the feeling — lead with the spot as
// a duotone session, live numbers riding on it as bracket-mono pins.
export default function SessionHero({ spot, loading }: { spot?: SpotWithWind; loading: boolean }) {
  if (loading || !spot) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(176deg,#123f3c,#0f2b2a 70%,#0e1f1e)", color: "rgba(236,226,209,0.5)",
        fontFamily: MONO, fontSize: 12, letterSpacing: "0.12em" }}>
        {loading ? "LOADING SESSION…" : "NO LIVE SPOT"}
      </div>
    );
  }

  const w    = spot.wind;
  const avg  = w?.avg ?? null;
  const gust = w?.gust ?? null;
  const pinTR = spot.type === "buoy" && w?.waveHeight != null
    ? `${w.waveHeight.toFixed(1)} m swell`
    : gust != null ? `gust ${Math.round(gust)} kt` : "—";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", isolation: "isolate" }}>
      {/* duotone sky */}
      <div style={{ position: "absolute", inset: 0,
        background:
          "radial-gradient(120% 90% at 74% 16%, rgba(232,220,196,0.85), rgba(232,220,196,0) 46%)," +
          "linear-gradient(176deg, #123f3c 0%, #0f4b45 34%, #1b6a5c 60%, #2f8a72 100%)" }} />
      {/* lower shade for text legibility */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "48%",
        background: "linear-gradient(180deg, rgba(9,26,24,0) 0%, rgba(9,26,24,0.72) 100%)" }} />
      {/* water */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "30%",
        background: "linear-gradient(180deg,#0d3b37,#08201e)", opacity: 0.9 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "30%", height: 1, background: "rgba(232,220,196,0.4)" }} />
      {/* grain */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", opacity: 0.14,
        mixBlendMode: "overlay", backgroundImage: GRAIN }} />

      {/* kite */}
      <svg viewBox="0 0 200 150" fill="none" aria-hidden="true" style={{
        position: "absolute", top: "12%", left: "16%", width: "min(28%,220px)", height: "auto",
        filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.3))" }}>
        <path d="M14 40 C60 8, 140 8, 186 40 C150 44, 120 52, 100 60 C80 52, 50 44, 14 40 Z" fill="#0e2b28" fillOpacity="0.92" />
        <path d="M14 40 C60 8, 140 8, 186 40" stroke="#e8dcc4" strokeOpacity="0.5" strokeWidth="1" />
        <line x1="30" y1="43" x2="97" y2="128" stroke="#e8dcc4" strokeOpacity="0.5" strokeWidth="1" />
        <line x1="170" y1="43" x2="103" y2="128" stroke="#e8dcc4" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="100" cy="122" r="4" fill="#0e2b28" />
      </svg>

      {/* pins */}
      {(() => {
        const pinBase = { position: "absolute" as const, zIndex: 3, fontFamily: MONO, fontSize: 11.5,
          letterSpacing: "0.08em", color: "#ece2d1", textTransform: "uppercase" as const };
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
        <div className="tnum" style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.16em", color: "#ece2d1", textTransform: "uppercase", marginBottom: 12 }}>
          [ {spot.name} · {avg != null ? Math.round(avg) : "—"} KT ]
        </div>
        <h2 style={{ fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 0.92,
          fontSize: "clamp(2.4rem, 1.4rem + 4.5vw, 5.6rem)", color: "#f3ead9", textTransform: "uppercase", whiteSpace: "pre-line", margin: 0 }}>
          {headline(avg)}
        </h2>
      </div>
    </div>
  );
}
