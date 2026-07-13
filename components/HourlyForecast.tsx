"use client";

import { useEffect, useState } from "react";
import { ForecastHour } from "@/lib/spots";
import { getWindColor } from "./WindGauge";

interface Props {
  lat: number;
  lon: number;
}

export default function HourlyForecast({ lat, lon }: Props) {
  const [data, setData]   = useState<ForecastHour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/forecast/hourly?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [lat, lon]);

  if (loading) return <div style={{ height: 60, background: "rgba(255,255,255,0.02)", borderRadius: 8 }} />;
  if (!data.length) return <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 8 }}>No forecast data</div>;

  const maxVal = Math.max(...data.map((h) => h.gust ?? h.avg ?? 0), 1);

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 3, minWidth: "max-content" }}>
        {data.map((h, i) => {
          const val   = h.avg ?? 0;
          const gust  = h.gust ?? 0;
          const color = getWindColor(val);
          const barH  = Math.max((val / maxVal) * 48, 2);
          const gustH = Math.max((gust / maxVal) * 48, 2);
          const hour  = new Date(h.time).toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: "America/New_York" });

          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 30 }}>
              <div style={{ fontSize: 9, color: color, fontWeight: 700, fontFamily: "monospace" }}>{Math.round(val)}</div>
              <div style={{ position: "relative", width: 10, height: 48, display: "flex", alignItems: "flex-end" }}>
                {/* Gust bar */}
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: gustH, background: `${color}25`, borderRadius: "2px 2px 0 0",
                }} />
                {/* Avg bar */}
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: barH, background: color, borderRadius: "2px 2px 0 0", opacity: 0.85,
                }} />
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", transform: "rotate(-45deg)", transformOrigin: "center", marginTop: 4 }}>
                {hour}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
