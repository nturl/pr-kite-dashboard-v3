"use client";

import { useEffect, useState } from "react";
import { getWindColor } from "./WindGauge";
import { C, REGION_COLORS } from "@/lib/theme";

const MONO = "'JetBrains Mono', monospace";

interface AlmanacRow { id: string; name: string; region: string; max: (number | null)[] }
interface AlmanacData { days: string[]; spots: AlmanacRow[] }

function weekday(date: string): string {
  const d = new Date(date + "T12:00:00");
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}
function monthDay(date: string): string {
  const d = new Date(date + "T12:00:00");
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The Almanac (C): you are planning the week across every spot, not deciding
// today — a whole-network weekly sheet, peak-kt as typography, one amber mark
// on the single best window of the week. Dark, not warm paper (a bet Cleo keeps
// off Noel's work; see the mockup's own "trades away" note).
export default function Almanac({
  region, selectedId, onSelect,
}: { region: string; selectedId: string | null; onSelect: (id: string) => void }) {
  const [data, setData]       = useState<AlmanacData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false);
    fetch("/api/almanac")
      .then((r) => r.json())
      .then((d) => { if (!alive) return; if (d?.spots) setData(d); else setError(true); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rows = (data?.spots ?? []).filter((s) => region === "All" || s.region === region);
  const days = data?.days ?? [];

  // Single best window of the week across the visible grid → the one amber mark.
  let best = { r: -1, c: -1, v: -Infinity };
  rows.forEach((row, r) => row.max.forEach((v, c) => { if (v != null && v > best.v) best = { r, c, v }; }));

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", background: C.bg, padding: "58px 20px 24px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "clamp(18px,3vw,30px)" }}>
        {/* masthead */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16,
          borderBottom: `2px solid ${C.line}`, paddingBottom: 14, flexWrap: "wrap" }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: "clamp(1.3rem,0.9rem+1.6vw,2rem)", letterSpacing: "0.02em", color: C.ink }}>
            THE KITE <span style={{ color: C.amber }}>ALMANAC</span>
          </div>
          <div className="tnum" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.mute, textAlign: "right", lineHeight: 1.7 }}>
            {days.length ? `Week of ${monthDay(days[0])} – ${monthDay(days[days.length - 1])}` : "Loading week…"}<br />
            {rows.length} spots · {region === "All" ? "NC / NY / NJ / PR" : region}<br />
            peak kt per day
          </div>
        </div>

        {loading && (
          <div style={{ padding: "40px 0", textAlign: "center", color: C.mute, fontFamily: MONO, fontSize: 12, letterSpacing: "0.12em" }}>
            LOADING WEEKLY OUTLOOK…
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#ff6b6b", fontFamily: MONO, fontSize: 12 }}>
            Weekly outlook unavailable
          </div>
        )}

        {!loading && !error && data && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }} />
                  {days.map((d) => (
                    <th key={d} style={{ padding: "8px 6px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em",
                      color: C.mute, fontWeight: 500, borderBottom: `1px solid ${C.line}`, textAlign: "center" }}>
                      {weekday(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, r) => {
                  const rc = REGION_COLORS[row.region] ?? C.ink;
                  const sel = row.id === selectedId;
                  return (
                    <tr key={row.id} onClick={() => onSelect(row.id)} style={{ cursor: "pointer", background: sel ? "rgba(255,255,255,0.03)" : "transparent" }}>
                      <th style={{ textAlign: "left", whiteSpace: "nowrap", padding: "7px 14px 7px 4px", borderBottom: `1px solid ${C.line}` }}>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: C.ink }}>{row.name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", color: rc, marginLeft: 7 }}>{row.region}</span>
                      </th>
                      {days.map((_, c) => {
                        const v = row.max[c] ?? null;
                        const isBest = r === best.r && c === best.c;
                        const col = isBest ? C.amber : getWindColor(v);
                        const pct = v != null ? Math.min(v / 35, 1) : 0;
                        return (
                          <td key={c} style={{ padding: "7px 6px", textAlign: "center", borderBottom: `1px solid ${C.line}` }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: isBest ? 700 : 500, color: v == null ? "#4a4e55" : col }}>
                                {v != null ? Math.round(v) : "·"}
                              </span>
                              <span style={{ display: "block", width: 22, height: 3, borderRadius: 2, background: "#23272e", overflow: "hidden" }}>
                                <span style={{ display: "block", height: "100%", width: `${pct * 100}%`, background: col, opacity: 0.85 }} />
                              </span>
                              {isBest && <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: "0.1em", color: C.amber }}>BEST</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 14,
          fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: C.mute }}>
          <span>Reading: figure = day&apos;s peak · bar = strength vs 35 kt</span>
          <span>One <span style={{ color: C.amber }}>amber</span> mark = best window of the week</span>
        </div>
      </div>
    </div>
  );
}
