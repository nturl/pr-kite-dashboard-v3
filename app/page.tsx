"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import SpotCard from "@/components/SpotCard";
import GeminiChat from "@/components/GeminiChat";
import KiteProfile, { UserProfile } from "@/components/KiteProfile";
import Instrument from "@/components/Instrument";
import SessionHero from "@/components/SessionHero";
import Almanac from "@/components/Almanac";
import { getWindColor } from "@/components/WindGauge";
import { SpotWithWind } from "@/lib/spots";
import { SpotVerdict, RegionalSummary } from "@/lib/gemini";
import { C, REGION_COLORS } from "@/lib/theme";

const KiteMap = dynamic(() => import("@/components/KiteMap"), { ssr: false });

const REFRESH_MS = 5 * 60 * 1000;
const STALE_MS   = 15 * 60 * 1000; // if the data is older than this, don't claim "LIVE"
const REGIONS    = ["All", "NC", "NY", "NJ", "PR"] as const;
const TYPES      = ["All", "Kite Spots", "Airports", "Buoys"] as const;

type Pane = "session" | "map" | "almanac";

const MONO = "'JetBrains Mono', monospace";

// ── Header ────────────────────────────────────────────────────────────────
function Header({
  lastUpdated, loading, stale, onRefresh,
  onOpenProfile, userProfile, aiLoading,
}: {
  lastUpdated?: string;
  loading: boolean;
  stale: boolean;
  onRefresh: () => void;
  onOpenProfile: () => void;
  userProfile?: UserProfile;
  aiLoading: boolean;
}) {
  const statusColor = loading ? C.mute : stale ? "#ff4d4d" : C.amber;
  const statusLabel = loading ? "UPDATING" : stale ? "STALE" : "LIVE";
  const live = !loading && !stale;
  return (
    <header className="app-header" style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        "0 20px",
      height:         56,
      borderBottom:   `1px solid ${C.line}`,
      background:     "rgba(20,22,26,0.96)",
      backdropFilter: "blur(20px)",
      position:       "relative",
      zIndex:         100,
      flexShrink:     0,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
          <path d="M14 2 C8 2 3 7 3 13 C3 20 14 26 14 26 C14 26 25 20 25 13 C25 7 20 2 14 2Z"
            fill="none" stroke={C.amber} strokeWidth="1.5"/>
          <path d="M14 8 L19 20 L14 17 L9 20 Z" fill={C.amber} opacity="0.9"/>
          <path d="M14 8 L9 20 L14 17 L19 20 Z" fill={C.amber} opacity="0.3"/>
        </svg>
        <div>
          <div style={{
            fontSize:      14,
            fontWeight:    800,
            fontFamily:    MONO,
            color:         C.ink,
            letterSpacing: "-0.02em",
          }}>KITE SPOTS</div>
          <div style={{ fontSize: 8, color: C.mute, letterSpacing: "0.16em", marginTop: -1 }}>
            NC · NY · NJ · PR
          </div>
        </div>
      </div>

      {/* Status lamp */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {aiLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.mute, animation: "pulse 1s infinite" }} />
            <span style={{ fontSize: 9, color: C.mute, letterSpacing: "0.1em", fontWeight: 600 }}>GEMINI THINKING</span>
          </div>
        )}
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: statusColor,
          boxShadow: live ? `0 0 8px ${C.amber}aa` : "none",
        }} />
        <span style={{ fontSize: 9, color: live ? C.amber : C.mute, fontWeight: 700, letterSpacing: "0.12em", fontFamily: MONO }}>
          {statusLabel}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {lastUpdated && <span style={{ fontSize: 10, color: C.mute, fontFamily: MONO }} className="tnum hide-mobile">as of {lastUpdated}</span>}
        <button className="app-btn" onClick={onOpenProfile} style={{
          background:   "rgba(255,255,255,0.04)",
          border:       `1px solid ${userProfile ? "rgba(255,176,0,0.28)" : C.line}`,
          borderRadius: 8,
          padding:      "5px 12px",
          color:        userProfile ? C.amber : C.mute,
          fontSize:     10,
          fontWeight:   600,
          cursor:       "pointer",
          fontFamily:   MONO,
          letterSpacing: "0.04em",
        }}>
          {userProfile ? `${userProfile.weightKg}kg` : "Set Profile"}
        </button>
        <button className="app-btn" onClick={onRefresh} disabled={loading} style={{
          background:   "rgba(255,255,255,0.04)",
          border:       `1px solid ${C.line}`,
          borderRadius: 8,
          padding:      "5px 12px",
          color:        loading ? C.mute : C.ink,
          fontSize:     10,
          fontWeight:   600,
          cursor:       loading ? "not-allowed" : "pointer",
          fontFamily:   MONO,
          letterSpacing: "0.04em",
          transition:   "all 0.2s",
        }}>
          ↻ Refresh
        </button>
      </div>
    </header>
  );
}

// ── Quick bar ─────────────────────────────────────────────────────────────
function QuickBar({ spots }: { spots: SpotWithWind[] }) {
  const live = spots.filter((s) => s.wind?.avg != null);
  if (!live.length) return null;
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            0,
      padding:        "0 20px",
      height:         34,
      borderBottom:   `1px solid ${C.line}`,
      background:     "rgba(27,30,36,0.4)",
      overflowX:      "auto",
      flexShrink:     0,
    }}>
      <span style={{ fontSize: 8, color: C.mute, letterSpacing: "0.16em", marginRight: 16, whiteSpace: "nowrap", fontFamily: MONO }}>
        QUICK LOOK
      </span>
      {live.map((spot, i) => (
        <div key={spot.id} style={{
          display:     "flex",
          alignItems:  "center",
          gap:         6,
          padding:     "0 12px",
          borderLeft:  i > 0 ? `1px solid ${C.line}` : "none",
          whiteSpace:  "nowrap",
        }}>
          <div style={{
            width: 4, height: 4, borderRadius: "50%",
            background: getWindColor(spot.wind!.avg),
          }} />
          <span style={{ fontSize: 10, color: C.mute }}>{spot.name}</span>
          <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: getWindColor(spot.wind!.avg), fontFamily: MONO }}>
            {Math.round(spot.wind!.avg!)} kt
          </span>
          {spot.wind?.directionText && (
            <span style={{ fontSize: 9, color: C.mute, fontFamily: MONO }}>{spot.wind.directionText}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Regional summary bar ──────────────────────────────────────────────────
function RegionalBar({ summaries }: { summaries: RegionalSummary[] }) {
  if (!summaries.length) return null;
  return (
    <div style={{
      display:        "flex",
      gap:            1,
      borderBottom:   `1px solid ${C.line}`,
      flexShrink:     0,
      overflowX:      "auto",
    }}>
      {summaries.map((s) => (
        <div key={s.region} style={{
          flex:       "1 0 160px",
          padding:    "8px 14px",
          borderRight: `1px solid ${C.line}`,
          minWidth:   0,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            color: REGION_COLORS[s.region] ?? C.ink,
            marginBottom: 3, textTransform: "uppercase", fontFamily: MONO,
          }}>
            {s.region} · {s.bestSpot}
          </div>
          <div style={{ fontSize: 10, color: C.mute, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical" as const }}>
            {s.summary}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────
function FilterBar({
  region, setRegion, typeFilter, setTypeFilter,
}: {
  region: string;
  setRegion: (r: string) => void;
  typeFilter: string;
  setTypeFilter: (t: string) => void;
}) {
  return (
    <div style={{ padding: "8px 10px 6px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {TYPES.map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            background:   typeFilter === t ? "rgba(255,255,255,0.08)" : "transparent",
            border:       `1px solid ${typeFilter === t ? "rgba(255,255,255,0.2)" : C.line}`,
            borderRadius: 20,
            padding:      "3px 10px",
            color:        typeFilter === t ? C.ink : C.mute,
            fontSize:     9,
            fontWeight:   600,
            cursor:       "pointer",
            letterSpacing: "0.04em",
            fontFamily:   MONO,
            transition:   "all 0.15s",
          }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {REGIONS.map((r) => {
          const rc = REGION_COLORS[r] ?? C.ink;
          const on = region === r;
          return (
            <button key={r} onClick={() => setRegion(r)} style={{
              background:   on ? `${rc}22` : "transparent",
              border:       `1px solid ${on ? `${rc}66` : C.line}`,
              borderRadius: 20,
              padding:      "3px 10px",
              color:        on ? rc : C.mute,
              fontSize:     9,
              fontWeight:   700,
              cursor:       "pointer",
              letterSpacing: "0.06em",
              fontFamily:   MONO,
              transition:   "all 0.15s",
            }}>{r}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Pane toggle (SESSION / MAP / ALMANAC) ─────────────────────────────────
function PaneToggle({ pane, setPane }: { pane: Pane; setPane: (p: Pane) => void }) {
  const items: { key: Pane; label: string }[] = [
    { key: "session", label: "SESSION" },
    { key: "map",     label: "MAP" },
    { key: "almanac", label: "ALMANAC" },
  ];
  return (
    <div style={{
      position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
      zIndex: 1200, display: "flex", gap: 2, padding: 3,
      background: "rgba(20,22,26,0.92)", border: `1px solid ${C.line}`,
      borderRadius: 10, backdropFilter: "blur(16px)",
    }}>
      {items.map((it) => {
        const on = pane === it.key;
        return (
          <button key={it.key} onClick={() => setPane(it.key)} style={{
            background:    on ? C.amber : "transparent",
            color:         on ? "#161616" : C.mute,
            border:        "none",
            borderRadius:  7,
            padding:       "5px 13px",
            fontSize:      10,
            fontWeight:    700,
            letterSpacing: "0.1em",
            fontFamily:    MONO,
            cursor:        "pointer",
            transition:    "all 0.15s",
          }}>{it.label}</button>
        );
      })}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background:   "rgba(255,255,255,0.02)",
      border:       `1px solid ${C.line}`,
      borderLeft:   "3px solid rgba(255,255,255,0.05)",
      borderRadius: 8,
      padding:      "14px 16px",
    }}>
      <div style={{ height: 12, background: "rgba(255,255,255,0.05)", borderRadius: 4, marginBottom: 6, width: "50%" }} />
      <div style={{ height: 8,  background: "rgba(255,255,255,0.03)", borderRadius: 4, marginBottom: 14, width: "30%" }} />
      <div style={{ height: 80, background: "rgba(255,255,255,0.02)", borderRadius: 8 }} />
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [spots, setSpots]             = useState<SpotWithWind[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>();
  const [dataTime, setDataTime]       = useState<Date | undefined>();
  const [region, setRegion]           = useState<string>("All");
  const [typeFilter, setTypeFilter]   = useState<string>("All");
  const [pane, setPane]               = useState<Pane>("map");

  // AI state
  const [verdicts, setVerdicts]       = useState<SpotVerdict[]>([]);
  const [summaries, setSummaries]     = useState<RegionalSummary[]>([]);
  const [aiLoading, setAiLoading]     = useState(false);

  // User profile
  const [userProfile, setUserProfile] = useState<UserProfile | undefined>();
  const [profileOpen, setProfileOpen] = useState(false);

  // Persist profile in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("kite-profile");
    if (saved) {
      try { setUserProfile(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const saveProfile = (p: UserProfile) => {
    setUserProfile(p);
    localStorage.setItem("kite-profile", JSON.stringify(p));
  };

  // Fetch wind data
  const fetchSpots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spots");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json() as SpotWithWind[];
      setSpots(data);
      // Timestamp the data by when the SERVER actually fetched upstream (X-Fetched-At),
      // not "now" — otherwise the badge claims LIVE even over a frozen response.
      const fetchedHeader = res.headers.get("X-Fetched-At");
      const fetchedAt = fetchedHeader ? new Date(fetchedHeader) : new Date();
      setDataTime(fetchedAt);
      setLastUpdated(fetchedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      return data;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Gemini AI analysis (runs after wind data loads)
  const fetchAI = useCallback(async (spotsData: SpotWithWind[]) => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/conditions", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(spotsData),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.verdicts)  setVerdicts(data.verdicts);
      if (data.summaries) setSummaries(data.summaries);
    } catch { /* Gemini unavailable — app still works without it */ }
    finally { setAiLoading(false); }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchSpots().then((data) => {
      if (data) fetchAI(data);
    });
    const interval = setInterval(() => {
      fetchSpots().then((data) => { if (data) fetchAI(data); });
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchSpots, fetchAI]);

  const verdictMap = new Map(verdicts.map((v) => [v.spotId, v]));

  const filtered = spots
    .filter((s) => region === "All" || s.region === region)
    .filter((s) => {
      if (typeFilter === "All")       return true;
      if (typeFilter === "Airports")  return s.type === "airport";
      if (typeFilter === "Buoys")     return s.type === "buoy";
      return s.type === "kite";
    });

  const selectedSpot = spots.find((s) => s.id === selectedId);

  // Day's best live kite spot — the Session hero's default subject.
  const bestSpot = useMemo(() => {
    const rideable = spots.filter((s) => s.type === "kite" && s.wind?.avg != null);
    if (!rideable.length) return undefined;
    return rideable.reduce((a, b) => ((b.wind!.avg! > a.wind!.avg!) ? b : a));
  }, [spots]);

  const stale = dataTime ? Date.now() - dataTime.getTime() > STALE_MS : false;

  // Selecting a spot from the sidebar has no per-spot surface on the Almanac,
  // so drop to MAP (which shows the Instrument reading) when picking one there.
  const selectSpot = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
    if (pane === "almanac") setPane("map");
  };

  return (
    <div className="app-root" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: C.bg }}>
      <Header
        lastUpdated={lastUpdated}
        loading={loading}
        stale={stale}
        onRefresh={() => fetchSpots().then((d) => { if (d) fetchAI(d); })}
        onOpenProfile={() => setProfileOpen(true)}
        userProfile={userProfile}
        aiLoading={aiLoading}
      />

      <QuickBar spots={spots} />
      {summaries.length > 0 && <RegionalBar summaries={summaries} />}

      <div className="app-body" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <div className="app-sidebar" style={{
          width:       310,
          flexShrink:  0,
          display:     "flex",
          flexDirection: "column",
          borderRight: `1px solid ${C.line}`,
          background:  "rgba(20,22,26,0.7)",
          overflow:    "hidden",
        }}>
          <FilterBar region={region} setRegion={setRegion} typeFilter={typeFilter} setTypeFilter={setTypeFilter} />

          <div className="app-list" style={{ overflowY: "auto", flex: 1, padding: "0 10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {error && (
              <div style={{
                background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.25)",
                borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ff6b6b",
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ Cannot reach server</div>
                <code style={{ fontSize: 10, color: C.amber }}>npm run dev</code>
              </div>
            )}

            {loading && !spots.length
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
              : filtered.map((spot) => (
                  <SpotCard
                    key={spot.id}
                    spot={spot}
                    selected={spot.id === selectedId}
                    onClick={() => selectSpot(spot.id)}
                    verdict={verdictMap.get(spot.id)}
                    userProfile={userProfile}
                  />
                ))
            }

            <div style={{ paddingTop: 10, borderTop: `1px solid ${C.line}`, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.mute, lineHeight: 2, fontFamily: MONO }}>
                NOAA HRRR · NDBC buoys · airports<br />
                AI analysis by Gemini 2.0 Flash<br />
                Refreshes every 5 min
              </div>
            </div>
          </div>
        </div>

        {/* ── Right pane: SESSION / MAP / ALMANAC ── */}
        <div className="app-pane" style={{ flex: 1, position: "relative", overflow: "hidden", background: C.bg }}>
          <PaneToggle pane={pane} setPane={setPane} />

          {/* SESSION (B) — full-bleed duotone hero */}
          {pane === "session" && (
            <SessionHero spot={selectedSpot ?? bestSpot} loading={loading && !spots.length} />
          )}

          {/* ALMANAC (C) — week table */}
          {pane === "almanac" && (
            <Almanac region={region} selectedId={selectedId} onSelect={selectSpot} />
          )}

          {/* MAP + Instrument reading (A) */}
          {pane === "map" && (
            <>
              {spots.length > 0 && (
                <KiteMap
                  spots={spots}
                  selectedId={selectedId}
                  onSpotSelect={(id) => selectSpot(id)}
                  region={region}
                />
              )}

              {!spots.length && !error && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12,
                }}>
                  <div style={{ fontSize: 42, opacity: 0.1 }}>🪁</div>
                  <div style={{ color: C.mute, fontSize: 13, fontFamily: MONO }}>Loading spots…</div>
                </div>
              )}

              {/* Instrument reading — the go/no-go cluster for the selected spot */}
              {selectedSpot && selectedSpot.wind?.avg != null && (
                <Instrument spot={selectedSpot} onClose={() => setSelectedId(null)} />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Gemini chat ── */}
      <GeminiChat spots={spots} userProfile={userProfile} />

      {/* ── Profile modal ── */}
      {profileOpen && (
        <KiteProfile
          existing={userProfile}
          onSave={saveProfile}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}
