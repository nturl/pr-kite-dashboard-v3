"use client";

import { useEffect, useState } from "react";
import { SpotWithWind, ForecastHour } from "@/lib/spots";
import { getWindColor } from "./WindGauge";
import { C, REGION_COLORS, kiteVerdict, Verdict } from "@/lib/theme";

const MONO = "'JetBrains Mono', monospace";
const LAMPS: Verdict[] = ["GO", "MARGINAL", "NO"];

function sourceLabel(src?: string): string {
  switch (src) {
    case "noaa":  return "NOAA METAR";
    case "ndbc":  return "NDBC BUOY";
    case "hrrr":  return "HRRR · 3KM";
    default:      return "OPEN-METEO";
  }
}

function fmtTime(ts: string | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts.includes("T") || ts.includes(" ") ? ts : Number(ts) * 1000);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  } catch { return ""; }
}

// The instrument cluster: one go/no-go answer above all else — segment speed,
// status lamp, and the live hourly wind-window strip for the selected spot.
export default function Instrument({ spot, onClose }: { spot: SpotWithWind; onClose: () => void }) {
  const [hours, setHours] = useState<ForecastHour[]>([]);

  useEffect(() => {
    let alive = true;
    setHours([]);
    fetch(`/api/forecast/hourly?lat=${spot.lat}&lon=${spot.lon}`)
      .then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d)) setHours(d.slice(0, 16)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [spot.lat, spot.lon]);

  const w        = spot.wind;
  const avg      = w?.avg ?? null;
  const gust     = w?.gust ?? null;
  const color    = getWindColor(avg);
  const verdict  = kiteVerdict(avg);
  const regionC  = REGION_COLORS[spot.region] ?? C.ink;
  const maxH     = Math.max(...hours.map((h) => h.avg ?? 0), 1);

  return (
    <div style={{
      position:   "absolute",
      top:        64,
      right:      14,
      width:      "min(440px, calc(100% - 28px))",
      background: C.panel,
      border:     `1px solid ${C.line}`,
      borderRadius: 6,
      padding:    "18px 20px 16px",
      zIndex:     1000,
      boxShadow:  "0 18px 50px rgba(0,0,0,0.55)",
    }}>
      {/* top rail: identity · provenance */}
      <div style={{
        display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
        fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.09em", textTransform: "uppercase",
        color: C.mute, borderBottom: `1px solid ${C.line}`, paddingBottom: 12,
      }}>
        <span style={{ color: regionC, fontWeight: 700 }}>{spot.region} · {spot.name}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span className="tnum">{sourceLabel(w?.source)}{w?.timestamp ? ` · ${fmtTime(w.timestamp)}` : ""}</span>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: C.mute, fontSize: 13,
            cursor: "pointer", lineHeight: 1, padding: 0,
          }} aria-label="Close reading">✕</button>
        </span>
      </div>

      {/* main: reading + lamp column */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, padding: "18px 0 16px" }}>
        <div>
          <div className="tnum" style={{
            fontFamily: MONO, fontWeight: 500, fontSize: 68, lineHeight: 0.9,
            letterSpacing: "-0.03em", color, display: "flex", alignItems: "baseline", gap: 8,
          }}>
            {avg != null ? Math.round(avg) : "—"}
            <span style={{ fontSize: 15, letterSpacing: "0.16em", color: C.mute }}>KT</span>
          </div>
          <div className="tnum" style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.08em", color: C.mute, marginTop: 10 }}>
            {w?.directionText ?? "—"}
            {w?.direction != null ? ` · ${Math.round(w.direction)}°` : ""}
            {gust != null ? ` · gust ${Math.round(gust)}` : ""}
          </div>
          {w?.modelGap != null && w.modelGap >= 5 && (
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.04em", color: C.amber, marginTop: 8 }}>
              ▲ sea breeze · globals under-calling ~{Math.round(w.modelGap)} kt
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: "flex-end" }}>
          {LAMPS.map((l) => {
            const on = l === verdict;
            return (
              <div key={l} style={{
                display: "flex", alignItems: "center", gap: 9,
                fontFamily: MONO, fontSize: 12, letterSpacing: "0.14em",
                color: on ? C.amber : "#4a4e55",
              }}>
                {l}
                <span style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: on ? C.amber : "#2f333a",
                  boxShadow: on ? `0 0 12px ${C.amber}8c` : "none",
                }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* hourly window strip */}
      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 52 }}>
          {hours.length === 0
            ? Array.from({ length: 16 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: "22%", borderRadius: 1, background: "#23272e" }} />
              ))
            : hours.map((h, i) => {
                const v = h.avg ?? 0;
                return (
                  <div key={i} title={`${fmtTime(h.time)} · ${Math.round(v)} kt`} style={{
                    flex: 1, height: `${Math.max(8, (v / maxH) * 100)}%`,
                    borderRadius: 1, background: getWindColor(v), opacity: 0.9,
                  }} />
                );
              })}
        </div>
        <div className="tnum" style={{
          display: "flex", justifyContent: "space-between", marginTop: 8,
          fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", color: "#5a5e65",
        }}>
          {hours.length >= 2
            ? [0, Math.floor(hours.length / 3), Math.floor((2 * hours.length) / 3), hours.length - 1]
                .map((idx, k) => <span key={k}>{fmtTime(hours[idx].time).slice(0, 2)}</span>)
            : <span>next 16h</span>}
        </div>
      </div>
    </div>
  );
}
