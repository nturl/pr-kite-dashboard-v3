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
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current || mapInstanceRef.current) return;

    // Dynamic import to avoid SSR issues
    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current, {
        center:    [38.5, -75.0], // mid-Atlantic placeholder; fitBounds below frames the actual spots
        zoom:      6,
        zoomControl: false,
        attributionControl: false,
        fadeAnimation: false, // render tiles at full opacity immediately; the fade left tiles stuck faint when the container settled/re-fit
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

      // Frame the map to the spots (they span NC to Long Island, so a fixed
      // center/zoom won't do). In this flex layout the container reaches its
      // final size a few frames after the async Leaflet import resolves, so we
      // fit only once the size has SETTLED: a debounced ResizeObserver waits for
      // the size to stop changing, fits, then disconnects. Fitting repeatedly
      // (e.g. once per animation frame) restarts Leaflet's tile fade-in every
      // time and leaves the whole map stuck at partial opacity.
      const bounds = L.latLngBounds(spots.map((s) => [s.lat, s.lon] as [number, number]));
      let settleTimer = 0;
      const ro = new ResizeObserver(() => {
        clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => {
          if (mapInstanceRef.current !== map) return; // unmounted
          ro.disconnect();
          resizeObsRef.current = null;
          map.invalidateSize({ animate: false });
          if (spots.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11, animate: false });
        }, 250);
      });
      ro.observe(mapRef.current!);
      resizeObsRef.current = ro;
    });

    return () => {
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
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
    <div ref={mapRef} style={{ position: "absolute", inset: 0, background: "#0d1525" }}>
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
