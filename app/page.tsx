"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import SpotCard from "@/components/SpotCard";
import GeminiChat from "@/components/GeminiChat";
import KiteProfile, { UserProfile } from "@/components/KiteProfile";
import { getWindColor } from "@/components/WindGauge";
import { SpotWithWind } from "@/lib/spots";
import { SpotVerdict, RegionalSummary } from "@/lib/gemini";

const KiteMap = dynamic(() => import("@/components/KiteMap"), { ssr: false });

const REFRESH_MS = 5 * 60 * 1000;
const STALE_MS   = 15 * 60 * 1000; // if the data is older than this, don't claim "LIVE"
const REGIONS    = ["All", "NC", "NY", "NJ", "PR"] as const;
const TYPES      = ["All", "Kite Spots", "Airports", "Buoys"] as const;

const REGION_COLORS: Record<string, string> = {
  NC: "#00e5ff",
  NY: "#b6ff4a",
  NJ: "#ff8c42",
  PR: "#c084fc",
};

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
  const statusColor = loading ? "#ff8c42" : stale ? "#ff4757" : "#b6ff4a";
  const statusLabel = loading ? "UPDATING" : stale ? "STALE" : "LIVE";
  return (
    <header style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        "0 20px",
      height:         56,
      borderBottom:   "1px solid rgba(255,255,255,0.07)",
      background:     "rgba(5,10,20,0.96)",
      backdropFilter: "blur(20px)",
      position:       "relative",
      zIndex:         100,
      flexShrink:     0,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
          <path d="M14 2 C8 2 3 7 3 13 C3 20 14 26 14 26 C14 26 25 20 25 13 C25 7 20 2 14 2Z"
            fill="none" stroke="#00e5ff" strokeWidth="1.5"/>
          <path d="M14 8 L19 20 L14 17 L9 20 Z" fill="#00e5ff" opacity="0.9"/>
          <path d="M14 8 L9 20 L14 17 L19 20 Z" fill="#00e5ff" opacity="0.3"/>
        </svg>
        <div>
          <div style={{
            fontSize:              14,
            fontWeight:            800,
            fontFamily:            "'JetBrains Mono', monospace",
            background:            "linear-gradient(90deg, #00e5ff, #b6ff4a)",
            WebkitBackgroundClip:  "text",
            WebkitTextFillColor:   "transparent",
            letterSpacing:         "-0.02em",
          }}>KITE SPOTS</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: "0.16em", marginTop: -1 }}>
            NC · NY · NJ
          </div>
        </div>
      </div>

      {/* AI status indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {aiLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#b6ff4a", boxShadow: "0 0 6px #b6ff4a", animation: "pulse 1s infinite" }} />
            <span style={{ fontSize: 9, color: "rgba(182,255,74,0.6)", letterSpacing: "0.1em", fontWeight: 600 }}>GEMINI THINKING</span>
          </div>
        )}
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: `0 0 7px ${statusColor}` }} />
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: "0.1em" }}>
          {statusLabel}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {lastUpdated && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>as of {lastUpdated}</span>}
        <button onClick={onOpenProfile} style={{
          background:   userProfile ? "rgba(182,255,74,0.08)" : "rgba(255,255,255,0.04)",
          border:       `1px solid ${userProfile ? "rgba(182,255,74,0.2)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 8,
          padding:      "5px 12px",
          color:        userProfile ? "#b6ff4a" : "rgba(255,255,255,0.4)",
          fontSize:     10,
          fontWeight:   600,
          cursor:       "pointer",
          fontFamily:   "'JetBrains Mono', monospace",
          letterSpacing: "0.04em",
        }}>
          {userProfile ? `🪁 ${userProfile.weightKg}kg` : "Set Profile"}
        </button>
        <button onClick={onRefresh} disabled={loading} style={{
          background:   "rgba(0,229,255,0.06)",
          border:       "1px solid rgba(0,229,255,0.2)",
          borderRadius: 8,
          padding:      "5px 12px",
          color:        loading ? "rgba(255,255,255,0.2)" : "#00e5ff",
          fontSize:     10,
          fontWeight:   600,
          cursor:       loading ? "not-allowed" : "pointer",
          fontFamily:   "'JetBrains Mono', monospace",
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
      borderBottom:   "1px solid rgba(255,255,255,0.06)",
      background:     "rgba(13,21,37,0.4)",
      overflowX:      "auto",
      flexShrink:     0,
    }}>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", letterSpacing: "0.16em", marginRight: 16, whiteSpace: "nowrap" }}>
        QUICK LOOK
      </span>
      {live.map((spot, i) => (
        <div key={spot.id} style={{
          display:     "flex",
          alignItems:  "center",
          gap:         6,
          padding:     "0 12px",
          borderLeft:  i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
          whiteSpace:  "nowrap",
        }}>
          <div style={{
            width: 4, height: 4, borderRadius: "50%",
            background: getWindColor(spot.wind!.avg),
            boxShadow:  `0 0 5px ${getWindColor(spot.wind!.avg)}99`,
          }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{spot.name}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: getWindColor(spot.wind!.avg), fontFamily: "'JetBrains Mono', monospace" }}>
            {Math.round(spot.wind!.avg!)} kts
          </span>
          {spot.wind?.directionText && (
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{spot.wind.directionText}</span>
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
      borderBottom:   "1px solid rgba(255,255,255,0.06)",
      flexShrink:     0,
      overflowX:      "auto",
    }}>
      {summaries.map((s) => (
        <div key={s.region} style={{
          flex:       "1 0 160px",
          padding:    "8px 14px",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          minWidth:   0,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            color: REGION_COLORS[s.region] ?? "#fff",
            marginBottom: 3, textTransform: "uppercase",
          }}>
            {s.region} · {s.bestSpot}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical" as const }}>
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
            background:   typeFilter === t ? "rgba(255,255,255,0.1)" : "transparent",
            border:       `1px solid ${typeFilter === t ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 20,
            padding:      "3px 10px",
            color:        typeFilter === t ? "#fff" : "rgba(255,255,255,0.3)",
            fontSize:     9,
            fontWeight:   600,
            cursor:       "pointer",
            letterSpacing: "0.04em",
            transition:   "all 0.15s",
          }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {REGIONS.map((r) => (
          <button key={r} onClick={() => setRegion(r)} style={{
            background:   region === r ? `${(REGION_COLORS[r] ?? "#fff")}18` : "transparent",
            border:       `1px solid ${region === r ? `${(REGION_COLORS[r] ?? "#fff")}45` : "rgba(255,255,255,0.06)"}`,
            borderRadius: 20,
            padding:      "3px 10px",
            color:        region === r ? (REGION_COLORS[r] ?? "#fff") : "rgba(255,255,255,0.3)",
            fontSize:     9,
            fontWeight:   600,
            cursor:       "pointer",
            letterSpacing: "0.04em",
            transition:   "all 0.15s",
          }}>{r}</button>
        ))}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background:   "rgba(255,255,255,0.02)",
      border:       "1px solid rgba(255,255,255,0.06)",
      borderLeft:   "3px solid rgba(255,255,255,0.05)",
      borderRadius: 14,
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

  const stale = dataTime ? Date.now() - dataTime.getTime() > STALE_MS : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#050a14" }}>
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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <div style={{
          width:       310,
          flexShrink:  0,
          display:     "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          background:  "rgba(5,10,20,0.7)",
          overflow:    "hidden",
        }}>
          <FilterBar region={region} setRegion={setRegion} typeFilter={typeFilter} setTypeFilter={setTypeFilter} />

          <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {error && (
              <div style={{
                background: "rgba(255,71,87,0.08)", border: "1px solid rgba(255,71,87,0.2)",
                borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#ff4757",
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ Cannot reach server</div>
                <code style={{ fontSize: 10, color: "#ff8c42" }}>npm run dev</code>
              </div>
            )}

            {loading && !spots.length
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
              : filtered.map((spot) => (
                  <SpotCard
                    key={spot.id}
                    spot={spot}
                    selected={spot.id === selectedId}
                    onClick={() => setSelectedId(spot.id === selectedId ? null : spot.id)}
                    verdict={verdictMap.get(spot.id)}
                    userProfile={userProfile}
                  />
                ))
            }

            <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", lineHeight: 2 }}>
                NOAA HRRR · NDBC buoys · airports<br />
                AI analysis by Gemini 2.0 Flash<br />
                Refreshes every 5 min
              </div>
            </div>
          </div>
        </div>

        {/* ── Map ── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {spots.length > 0 && (
            <KiteMap
              spots={spots}
              selectedId={selectedId}
              onSpotSelect={(id) => setSelectedId(id === selectedId ? null : id)}
              region={region}
            />
          )}

          {!spots.length && !error && (
            <div style={{
              position:       "absolute",
              inset:          0,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              flexDirection:  "column",
              gap:            12,
            }}>
              <div style={{ fontSize: 42, opacity: 0.1 }}>🪁</div>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Loading spots...</div>
            </div>
          )}

          {/* Selected spot overlay */}
          {selectedSpot?.wind?.avg != null && (() => {
            const s     = selectedSpot;
            const color = getWindColor(s.wind!.avg);
            const v     = verdictMap.get(s.id);
            return (
              <div style={{
                position:       "absolute",
                top:            14,
                right:          14,
                background:     "rgba(5,10,20,0.95)",
                border:         `1px solid ${color}30`,
                borderRadius:   16,
                padding:        "14px 18px",
                backdropFilter: "blur(24px)",
                zIndex:         1000,
                minWidth:       190,
                boxShadow:      `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${color}15`,
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>
                  {s.region} · {s.location}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
                  {s.name}
                </div>
                <div style={{ fontSize: 38, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color, lineHeight: 1 }}>
                  {Math.round(s.wind!.avg!)}
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 4, opacity: 0.5 }}>kts</span>
                </div>
                {s.wind?.gust != null && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
                    G {Math.round(s.wind.gust)} kts · {s.wind.directionText ?? ""}
                  </div>
                )}
                {v && (
                  <div style={{
                    marginTop:    8,
                    display:      "flex",
                    alignItems:   "center",
                    gap:          5,
                    background:   `${color}12`,
                    border:       `1px solid ${color}25`,
                    borderRadius: 20,
                    padding:      "3px 10px",
                    fontSize:     10,
                    fontWeight:   700,
                    color,
                    letterSpacing: "0.04em",
                  }}>
                    {v.emoji} {v.headline}
                  </div>
                )}
              </div>
            );
          })()}
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
