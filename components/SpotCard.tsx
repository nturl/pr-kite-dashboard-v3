"use client";

import { useState } from "react";
import { SpotWithWind } from "@/lib/spots";
import { SpotVerdict } from "@/lib/gemini";
import WindGauge, { getWindColor, getWindLabel } from "./WindGauge";
import WindArrow from "./WindArrow";
import HourlyForecast from "./HourlyForecast";
import DailyForecast from "./DailyForecast";
import { C, REGION_COLORS } from "@/lib/theme";

interface Props {
  spot:         SpotWithWind;
  selected:     boolean;
  onClick:      () => void;
  verdict?:     SpotVerdict;
  userProfile?: { heightCm: number; weightKg: number };
}

const MONO = "'JetBrains Mono', monospace";

// Provenance stays legible but desaturated so amber remains the only signal.
function sourceTint(src?: string): string {
  switch (src) {
    case "noaa":  return "#9a86b5";
    case "ndbc":  return "#5f9ea0";
    case "hrrr":  return "#8fa9b5";
    default:      return C.mute;
  }
}
function sourceName(src?: string): string {
  switch (src) {
    case "noaa":  return "NOAA";
    case "ndbc":  return "NDBC Buoy";
    case "hrrr":  return "NOAA HRRR · 3km";
    default:      return "Open-Meteo";
  }
}

export default function SpotCard({ spot, selected, onClick, verdict, userProfile }: Props) {
  const [forecastTab, setForecastTab]     = useState<"24h" | "7d">("24h");
  const [kiteRec, setKiteRec]             = useState<{ recommended: string; range: string; reasoning: string; safetyNote?: string } | null>(null);
  const [kiteLoading, setKiteLoading]     = useState(false);

  const wind        = spot.wind;
  const avg         = wind?.avg ?? null;
  const label       = getWindLabel(avg);
  const color       = getWindColor(avg);
  const regionColor = REGION_COLORS[spot.region] ?? C.ink;

  const handleKiteRec = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userProfile || avg == null || kiteLoading) return;
    setKiteLoading(true);
    try {
      const res = await fetch("/api/ai/kite-size", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          heightCm: userProfile.heightCm,
          weightKg: userProfile.weightKg,
          windAvg:  avg,
          windGust: wind?.gust ?? null,
          spotName: spot.name,
        }),
      });
      const data = await res.json();
      if (!data.error) setKiteRec(data);
    } finally {
      setKiteLoading(false);
    }
  };

  return (
    <div
      onClick={onClick}
      className="spot-card"
      style={{
        background:   selected ? "rgba(255,176,0,0.05)" : "rgba(255,255,255,0.025)",
        // Longhand borders only — mixing the `border` shorthand with `borderLeft`
        // makes React's style differ warn and can drop the override on rerender.
        borderTop:    `1px solid ${selected ? "rgba(255,176,0,0.35)" : C.line}`,
        borderRight:  `1px solid ${selected ? "rgba(255,176,0,0.35)" : C.line}`,
        borderBottom: `1px solid ${selected ? "rgba(255,176,0,0.35)" : C.line}`,
        borderLeft:   `3px solid ${avg != null ? color : "rgba(255,255,255,0.1)"}`,
        borderRadius: 8,
        padding:      "14px 16px",
        cursor:       "pointer",
        transition:   "all 0.2s ease",
        boxShadow:    selected ? `0 0 22px rgba(255,176,0,0.07)` : "none",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.ink }}>
            {spot.type === "airport" && <span style={{ fontSize: 11 }}>✈</span>}
            {spot.type === "buoy"    && <span style={{ fontSize: 11 }}>◑</span>}
            {spot.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: regionColor, textTransform: "uppercase", fontFamily: MONO }}>
              {spot.region}
            </span>
            <span style={{ fontSize: 9, color: C.mute }}>·</span>
            <span style={{ fontSize: 11, color: C.mute }}>{spot.location}</span>
          </div>
        </div>

        {/* Verdict badge (Gemini) or wind label */}
        <div style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px",
          borderRadius: 6, letterSpacing: "0.05em",
          background: `${color}18`,
          color,
          border:    `1px solid ${color}35`,
          whiteSpace: "nowrap",
          display:   "flex", alignItems: "center", gap: 4,
          fontFamily: MONO,
        }}>
          {verdict ? (
            <>{verdict.emoji} {verdict.headline}</>
          ) : (
            <>{label.emoji} {label.text}</>
          )}
        </div>
      </div>

      {/* ── Wind reading ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <WindGauge avg={avg} gust={wind?.gust ?? null} size={110} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <WindArrow direction={wind?.direction ?? null} directionText={wind?.directionText ?? null} size={56} />
          <div style={{ textAlign: "center" }}>
            {wind?.source && (
              <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
                color: sourceTint(wind.source), fontFamily: MONO,
              }}>
                {sourceName(wind.source)}
              </div>
            )}
            {wind?.timestamp && (
              <div className="tnum" style={{ fontSize: 10, color: C.mute, marginTop: 2, fontFamily: MONO }}>
                {formatTime(wind.timestamp)}
              </div>
            )}
            {wind?.waveHeight != null && (
              <div style={{ fontSize: 10, color: "#5f9ea0", marginTop: 3, fontWeight: 600 }}>
                ◑ {wind.waveHeight.toFixed(1)}m swell
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Live-vs-model gap (the headline: HRRR sees the sea breeze Windy misses) ── */}
      {wind?.modelGap != null && wind.modelGap >= 5 && (
        <div style={{
          marginTop:    10,
          padding:      "7px 11px",
          background:   "rgba(255,176,0,0.06)",
          border:       "1px solid rgba(255,176,0,0.22)",
          borderRadius: 6,
          display:      "flex",
          alignItems:   "center",
          gap:          8,
        }}>
          <span style={{ fontSize: 12, color: C.amber }}>▲</span>
          <span style={{ fontSize: 10, color: C.amber, fontWeight: 600, lineHeight: 1.35 }}>
            Sea breeze — global models under-calling by ~{Math.round(wind.modelGap)} kts
            {wind.globalAvg != null && (
              <span style={{ color: C.mute, fontWeight: 400 }}>
                {" "}· Windy-style global reads {Math.round(wind.globalAvg)}
              </span>
            )}
          </span>
        </div>
      )}

      {/* ── Gemini verdict detail (when selected) ── */}
      {selected && verdict?.detail && (
        <div style={{
          marginTop: 12, padding: "8px 12px",
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${C.line}`,
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 9, color: C.mute, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 3, fontFamily: MONO }}>
            ✦ GEMINI ANALYSIS
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{verdict.detail}</div>
          {verdict.kiteSizes && verdict.kiteSizes !== "N/A" && (
            <div style={{ fontSize: 11, color: C.amber, marginTop: 4, fontWeight: 600, fontFamily: MONO }}>
              Recommended kite: {verdict.kiteSizes}
            </div>
          )}
        </div>
      )}

      {/* ── Kite size rec (personalized) ── */}
      {selected && userProfile && avg != null && (
        <div style={{ marginTop: 10 }}>
          {!kiteRec ? (
            <button
              onClick={handleKiteRec}
              disabled={kiteLoading}
              style={{
                width: "100%", padding: "6px 0",
                background: "rgba(255,176,0,0.06)",
                border: "1px solid rgba(255,176,0,0.25)",
                borderRadius: 6, cursor: kiteLoading ? "wait" : "pointer",
                fontSize: 11, fontWeight: 600, color: C.amber,
                fontFamily: MONO,
                transition: "all 0.2s",
              }}
            >
              {kiteLoading ? "⟳ Getting your kite rec…" : "✦ What kite should I fly?"}
            </button>
          ) : (
            <div style={{
              padding: "10px 12px",
              background: "rgba(255,176,0,0.04)",
              border: "1px solid rgba(255,176,0,0.18)",
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 9, color: C.mute, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4, fontFamily: MONO }}>
                YOUR KITE SIZE
              </div>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 800, color: C.amber, fontFamily: MONO }}>
                {kiteRec.recommended}
                <span style={{ fontSize: 12, color: C.mute, marginLeft: 6 }}>({kiteRec.range} range)</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4, lineHeight: 1.5 }}>{kiteRec.reasoning}</div>
              {kiteRec.safetyNote && (
                <div style={{ fontSize: 11, color: "#ff8c42", marginTop: 6, padding: "4px 8px", background: "rgba(255,140,66,0.08)", borderRadius: 6 }}>
                  ⚠ {kiteRec.safetyNote}
                </div>
              )}
              <button onClick={(e) => { e.stopPropagation(); setKiteRec(null); }}
                style={{ marginTop: 6, fontSize: 9, color: C.mute, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Forecast (selected only) ── */}
      {selected && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: C.mute, textTransform: "uppercase", fontFamily: MONO }}>
              {forecastTab === "24h" ? "24-Hour Forecast" : "7-Day Forecast"}
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {(["24h", "7d"] as const).map((tab) => (
                <button key={tab} onClick={(e) => { e.stopPropagation(); setForecastTab(tab); }} style={{
                  background: forecastTab === tab ? "rgba(255,176,0,0.12)" : "transparent",
                  border: `1px solid ${forecastTab === tab ? "rgba(255,176,0,0.35)" : C.line}`,
                  borderRadius: 6, padding: "2px 8px",
                  color: forecastTab === tab ? C.amber : C.mute,
                  fontSize: 9, fontWeight: 600, cursor: "pointer",
                  fontFamily: MONO, letterSpacing: "0.06em",
                }}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {forecastTab === "24h"
            ? <HourlyForecast lat={spot.lat} lon={spot.lon} />
            : <DailyForecast  lat={spot.lat} lon={spot.lon} />
          }
        </div>
      )}
    </div>
  );
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts.includes("T") || ts.includes(" ") ? ts : Number(ts) * 1000);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
  } catch { return ""; }
}
