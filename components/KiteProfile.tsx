"use client";

import { useState, useEffect } from "react";

export interface UserProfile {
  heightCm: number;
  weightKg: number;
  heightUnit: "cm" | "ft";
  weightUnit: "kg" | "lbs";
}

interface Props {
  onSave: (profile: UserProfile) => void;
  onClose: () => void;
  existing?: UserProfile;
}

export default function KiteProfile({ onSave, onClose, existing }: Props) {
  const [heightVal, setHeightVal]     = useState(existing ? String(existing.heightUnit === "ft" ? cmToFt(existing.heightCm) : existing.heightCm) : "");
  const [weightVal, setWeightVal]     = useState(existing ? String(existing.weightUnit === "lbs" ? kgToLbs(existing.weightKg) : existing.weightKg) : "");
  const [heightUnit, setHeightUnit]   = useState<"cm" | "ft">(existing?.heightUnit ?? "cm");
  const [weightUnit, setWeightUnit]   = useState<"kg" | "lbs">(existing?.weightUnit ?? "kg");

  const valid = heightVal !== "" && weightVal !== "" && !isNaN(Number(heightVal)) && !isNaN(Number(weightVal));

  const handleSave = () => {
    if (!valid) return;
    const h = Number(heightVal);
    const w = Number(weightVal);
    onSave({
      heightCm:   heightUnit === "ft" ? ftToCm(h) : h,
      weightKg:   weightUnit === "lbs" ? lbsToKg(w) : w,
      heightUnit,
      weightUnit,
    });
    onClose();
  };

  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      background:     "rgba(0,0,0,0.7)",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      zIndex:         3000,
      backdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:   "rgba(13,21,37,0.98)",
          border:       "1px solid rgba(182,255,74,0.2)",
          borderRadius: 20,
          padding:      "28px 32px",
          width:        360,
          boxShadow:    "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(182,255,74,0.08)",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "#fff", marginBottom: 4 }}>
            🪁 Your Rider Profile
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
            Gemini uses your height and weight to recommend the right kite size for current conditions.
          </div>
        </div>

        {/* Height */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
            Height
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={heightVal}
              onChange={(e) => setHeightVal(e.target.value)}
              placeholder={heightUnit === "cm" ? "e.g. 178" : "e.g. 5.10"}
              type="number"
              style={{
                flex:         1,
                background:   "rgba(255,255,255,0.06)",
                border:       "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding:      "10px 14px",
                fontSize:     14,
                color:        "#fff",
                outline:      "none",
                fontFamily:   "'JetBrains Mono', monospace",
              }}
            />
            <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              {(["cm", "ft"] as const).map((u) => (
                <button key={u} onClick={() => setHeightUnit(u)} style={{
                  padding:    "0 14px",
                  background: heightUnit === u ? "rgba(182,255,74,0.15)" : "rgba(255,255,255,0.04)",
                  color:      heightUnit === u ? "#b6ff4a" : "rgba(255,255,255,0.35)",
                  border:     "none",
                  cursor:     "pointer",
                  fontSize:   12,
                  fontWeight: 600,
                }}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Weight */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
            Weight
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={weightVal}
              onChange={(e) => setWeightVal(e.target.value)}
              placeholder={weightUnit === "kg" ? "e.g. 75" : "e.g. 165"}
              type="number"
              style={{
                flex:         1,
                background:   "rgba(255,255,255,0.06)",
                border:       "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding:      "10px 14px",
                fontSize:     14,
                color:        "#fff",
                outline:      "none",
                fontFamily:   "'JetBrains Mono', monospace",
              }}
            />
            <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              {(["kg", "lbs"] as const).map((u) => (
                <button key={u} onClick={() => setWeightUnit(u)} style={{
                  padding:    "0 14px",
                  background: weightUnit === u ? "rgba(182,255,74,0.15)" : "rgba(255,255,255,0.04)",
                  color:      weightUnit === u ? "#b6ff4a" : "rgba(255,255,255,0.35)",
                  border:     "none",
                  cursor:     "pointer",
                  fontSize:   12,
                  fontWeight: 600,
                }}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex:         1,
            padding:      "12px 0",
            background:   "rgba(255,255,255,0.04)",
            border:       "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            color:        "rgba(255,255,255,0.4)",
            fontSize:     13,
            cursor:       "pointer",
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!valid} style={{
            flex:         2,
            padding:      "12px 0",
            background:   valid ? "rgba(182,255,74,0.12)" : "rgba(255,255,255,0.04)",
            border:       `1px solid ${valid ? "rgba(182,255,74,0.35)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 12,
            color:        valid ? "#b6ff4a" : "rgba(255,255,255,0.2)",
            fontSize:     13,
            fontWeight:   700,
            cursor:       valid ? "pointer" : "default",
            fontFamily:   "'JetBrains Mono', monospace",
          }}>
            Save Profile ✦
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Unit helpers ─────────────────────────────────────────────────────────
function cmToFt(cm: number) { return Math.round(cm / 30.48 * 100) / 100; }
function ftToCm(ft: number) { return Math.round(ft * 30.48); }
function kgToLbs(kg: number) { return Math.round(kg * 2.20462); }
function lbsToKg(lbs: number) { return Math.round(lbs / 2.20462); }
