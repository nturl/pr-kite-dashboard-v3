"use client";

import { useEffect, useState } from "react";
import { ForecastDay } from "@/lib/spots";
import { getWindColor, getWindLabel } from "./WindGauge";

interface Props {
  lat: number;
  lon: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DailyForecast({ lat, lon }: Props) {
  const [data, setData]       = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/forecast/daily?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [lat, lon]);

  if (loading) return <div style={{ height: 100, background: "rgba(255,255,255,0.02)", borderRadius: 8 }} />;
  if (!data.length) return <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 8 }}>No forecast data</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {data.map((d, i) => {
        const color = getWindColor(d.max);
        const label = getWindLabel(d.max);
        const day   = DAYS[new Date(d.date + "T12:00:00").getDay()];
        const pct   = d.max != null ? Math.min(d.max / 35, 1) : 0;

        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{day}</div>
            <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ width: 30, fontSize: 11, color, fontWeight: 700, fontFamily: "monospace", textAlign: "right" }}>
              {d.max != null ? Math.round(d.max) : "—"}
            </div>
            <div style={{ width: 14, fontSize: 12, textAlign: "center" }}>{label.emoji}</div>
          </div>
        );
      })}
    </div>
  );
}
