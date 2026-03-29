"use client";

import { useEffect, useRef } from "react";
import { SpotWithWind } from "@/lib/spots";
import { getWindColor } from "./WindGauge";

interface Props {
  spots:          SpotWithWind[];
  selectedId:     string | null;
  onSpotSelect:   (id: string) => void;
}

export default function KiteMap({ spots, selectedId, onSpotSelect }: Props) {
  const mapRef       = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef   = useRef<Map<string, unknown>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current || mapInstanceRef.current) return;

    // Dynamic import to avoid SSR issues
    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        center:    [18.2, -66.5],
        zoom:      9,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap © CARTO",
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapInstanceRef.current = map;

      // Render markers for all spots
      spots.forEach((spot) => {
        const color    = getWindColor(spot.wind?.avg ?? null);
        const windText = spot.wind?.avg != null ? `${Math.round(spot.wind.avg)}kts` : "—";
        const isSelected = spot.id === selectedId;

        const icon = L.divIcon({
          className: "",
          html: `<div style="
            background: ${isSelected ? color : "rgba(5,10,20,0.9)"};
            border: 2px solid ${color};
            border-radius: ${spot.type === "buoy" ? "50%" : "8px"};
            padding: 3px 7px;
            font-size: 11px;
            font-weight: 700;
            color: ${isSelected ? "#050a14" : color};
            white-space: nowrap;
            font-family: 'JetBrains Mono', monospace;
            box-shadow: 0 0 10px ${color}55;
            cursor: pointer;
            transition: all 0.2s;
          ">${windText}</div>`,
          iconSize:   [50, 24],
          iconAnchor: [25, 12],
        });

        const marker = L.marker([spot.lat, spot.lon], { icon })
          .addTo(map as L.Map)
          .on("click", () => onSpotSelect(spot.id));

        (marker as L.Marker).bindTooltip(`<strong>${spot.name}</strong><br/>${spot.location}`, {
          permanent: false,
          direction: "top",
          className: "kite-tooltip",
        });

        markersRef.current.set(spot.id, marker);
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as L.Map).remove();
        mapInstanceRef.current = null;
        markersRef.current.clear();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker styles when spots or selection changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      spots.forEach((spot) => {
        const marker = markersRef.current.get(spot.id) as L.Marker | undefined;
        if (!marker) return;
        const color     = getWindColor(spot.wind?.avg ?? null);
        const windText  = spot.wind?.avg != null ? `${Math.round(spot.wind.avg)}kts` : "—";
        const isSelected = spot.id === selectedId;
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            background: ${isSelected ? color : "rgba(5,10,20,0.9)"};
            border: 2px solid ${color};
            border-radius: ${spot.type === "buoy" ? "50%" : "8px"};
            padding: 3px 7px;
            font-size: 11px;
            font-weight: 700;
            color: ${isSelected ? "#050a14" : color};
            white-space: nowrap;
            font-family: 'JetBrains Mono', monospace;
            box-shadow: 0 0 ${isSelected ? "16px" : "10px"} ${color}${isSelected ? "88" : "55"};
            cursor: pointer;
          ">${windText}</div>`,
          iconSize:   [50, 24],
          iconAnchor: [25, 12],
        });
        marker.setIcon(icon);
      });
    });
  }, [spots, selectedId]);

  return (
    <div ref={mapRef} style={{ width: "100%", height: "100%", background: "#0d1525" }}>
      <style>{`
        .kite-tooltip {
          background: rgba(5,10,20,0.95) !important;
          border: 1px solid rgba(0,229,255,0.3) !important;
          color: #fff !important;
          font-size: 12px !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .kite-tooltip::before { display: none !important; }
        .leaflet-control-zoom a {
          background: rgba(5,10,20,0.9) !important;
          color: rgba(255,255,255,0.7) !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
      `}</style>
    </div>
  );
}
