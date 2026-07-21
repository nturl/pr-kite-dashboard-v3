"use client";

import { useEffect, useRef } from "react";
import { SpotWithWind } from "@/lib/spots";
import { getWindColor } from "./WindGauge";

// Instrument-palette ramp for the animated wind field: muted grey in calm air,
// warming to the app's amber (#ffb000) as wind reaches kite strength, so the
// map's single accent keeps its meaning (amber = wind worth chasing).
const WIND_COLORS = [
  "rgb(140,144,150)", // ~0 kt   muted grey
  "rgb(168,170,168)",
  "rgb(196,192,178)", // light   pale ink
  "rgb(220,196,132)",
  "rgb(240,186,74)",
  "rgb(255,176,0)",   // strong  amber
];

// leaflet-velocity's dist is a bare-global script (it does `L.velocityLayer = …`
// against a global `L`), which webpack's module scoping won't wire up via
// import(). Load it as a real <script> so it extends the same global L we set.
// Vendored to /public so it ships as a static asset. One shared promise keeps it
// to a single injection across mounts (incl. React StrictMode double-mount).
let velocityPluginPromise: Promise<void> | null = null;
function loadVelocityPlugin(L: { velocityLayer?: unknown }): Promise<void> {
  if (L.velocityLayer) return Promise.resolve();
  if (velocityPluginPromise) return velocityPluginPromise;
  velocityPluginPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/leaflet-velocity.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { velocityPluginPromise = null; reject(new Error("leaflet-velocity failed to load")); };
    document.head.appendChild(s);
  });
  return velocityPluginPromise;
}

interface Props {
  spots:          SpotWithWind[];
  selectedId:     string | null;
  onSpotSelect:   (id: string) => void;
  region:         string;
}

export default function KiteMap({ spots, selectedId, onSpotSelect, region }: Props) {
  const mapRef       = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef   = useRef<Map<string, unknown>>(new Map());
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const velocityRef  = useRef<unknown>(null);

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
            background: ${isSelected ? color : "rgba(20,22,26,0.92)"};
            border: 2px solid ${color};
            border-radius: ${spot.type === "buoy" ? "50%" : "8px"};
            padding: 3px 7px;
            font-size: 11px;
            font-weight: 700;
            color: ${isSelected ? "#14161a" : color};
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

      // ── Animated wind-flow layer (Windy-style, Instrument palette) ──────────
      // A field of drifting particles advected by the u/v grid served at
      // /api/windfield. Pale in calm air, warming to amber at kite strength.
      // Toggleable via the WIND control; off by default under reduced-motion.
      //
      // Windy-style coverage: two fields, swapped by viewport. When the view sits
      // inside the fine regional grid we use it; zoom or pan beyond and the layer
      // swaps to a coarse whole-earth grid so particles cover every visible pixel
      // instead of rendering a hard-edged data box.
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      type WindScope = "region" | "global";
      // Must stay in sync with GRIDS.region in app/api/windfield/route.ts.
      const REGION_BOX = { latN: 46, latS: 10, lonW: -92, lonE: -55 };
      let velocityLayer: { addTo: (m: unknown) => void; setData: (d: unknown) => void } | null = null;
      const windFields: Partial<Record<WindScope, unknown>> = {};
      let windScope: WindScope | null = null; // scope the layer currently renders
      let windOn = !prefersReduced;

      const pickScope = (): WindScope => {
        const b = (map as L.Map).getBounds();
        const inside =
          b.getNorth() <= REGION_BOX.latN && b.getSouth() >= REGION_BOX.latS &&
          b.getWest()  >= REGION_BOX.lonW && b.getEast()  <= REGION_BOX.lonE;
        return inside ? "region" : "global";
      };

      const fetchField = async (scope: WindScope): Promise<unknown> => {
        if (windFields[scope]) return windFields[scope];
        const res = await fetch(`/api/windfield?scope=${scope}`);
        if (!res.ok) return null;
        const parsed = await res.json();
        if (!Array.isArray(parsed)) return null;
        windFields[scope] = parsed;
        return parsed;
      };
      let toggleBtn: HTMLButtonElement | null = null;
      const syncBtn = () => toggleBtn?.setAttribute("aria-pressed", String(windOn && !!velocityLayer && (map as L.Map).hasLayer(velocityLayer as unknown as L.Layer)));

      let windInitBusy = false;
      const enableWind = async () => {
        if (mapInstanceRef.current !== map || windInitBusy) return;
        windInitBusy = true;
        try {
        if (!velocityLayer) {
          try {
            (window as unknown as { L: unknown }).L = L; // the plugin script reads a global L
            await loadVelocityPlugin(L as { velocityLayer?: unknown });
            let scope = pickScope();
            let windData = await fetchField(scope);
            if (!windData) {
              // Desired field unavailable (rate limit, outage): fall back to the
              // other one so the layer still shows something rather than nothing.
              scope = scope === "global" ? "region" : "global";
              windData = await fetchField(scope);
            }
            if (!windData) return;
            if (mapInstanceRef.current !== map) return; // unmounted mid-fetch
            windScope = scope;
            velocityLayer = (L as unknown as { velocityLayer: (o: unknown) => typeof velocityLayer }).velocityLayer({
              data:               windData,
              displayValues:      false,
              colorScale:         WIND_COLORS,
              minVelocity:        0,
              maxVelocity:        26,      // kt — amber saturates approaching strong wind
              velocityScale:      0.006,   // particle travel speed — drift, not dart (fade is hardcoded in the vendor build, so speed also sets trail length; below ~0.005 streaks collapse into dabs)
              particleAge:        90,
              particleMultiplier: 1 / 260, // density
              lineWidth:          1.1,
              frameRate:          22,
              opacity:            0.92,
            });
          } catch (e) {
            console.error("wind layer init failed:", (e as Error).message);
            return;
          }
        }
        if (mapInstanceRef.current !== map || !velocityLayer) return;
        velocityLayer.addTo(map);
        velocityRef.current = velocityLayer;
        syncBtn();
        } finally { windInitBusy = false; }
      };

      const disableWind = () => {
        if (velocityLayer) (map as L.Map).removeLayer(velocityLayer as unknown as L.Layer);
        syncBtn();
      };

      const WindToggle = (L.Control as unknown as { extend: (o: unknown) => new (o: unknown) => L.Control }).extend({
        onAdd: function () {
          const btn = L.DomUtil.create("button", "wind-toggle") as HTMLButtonElement;
          btn.type = "button";
          btn.innerHTML = `<span class="wind-dot"></span>WIND`;
          btn.title = "Toggle animated wind flow";
          btn.setAttribute("aria-pressed", "false");
          L.DomEvent.disableClickPropagation(btn);
          L.DomEvent.on(btn, "click", () => {
            windOn = !windOn;
            if (windOn) enableWind(); else disableWind();
          });
          toggleBtn = btn;
          return btn;
        },
      });
      map.addControl(new WindToggle({ position: "bottomleft" }));

      // Swap between the regional and global fields as the viewport moves.
      // setData clears and restarts the particle animation in place.
      const syncScope = async () => {
        if (!windOn || !velocityLayer) return;
        const want = pickScope();
        if (want === windScope) return;
        const data = await fetchField(want);
        // Re-check after the await: the map may have moved again or unmounted.
        if (!data || mapInstanceRef.current !== map || !velocityLayer) return;
        if (pickScope() !== want || want === windScope) return;
        windScope = want;
        velocityLayer.setData(data);
      };
      map.on("moveend zoomend", syncScope);
      // The windfield API fills its grids incrementally when Open-Meteo's rate
      // window is tight — a fetch may 503 several times before the field is
      // ready. Nudge periodically: finish initial setup if it never got data,
      // and swap scopes once the right field becomes available (syncScope
      // no-ops when the rendered scope already matches the viewport).
      const windHeal = setInterval(() => {
        if (mapInstanceRef.current !== map) { clearInterval(windHeal); return; }
        if (windOn && !velocityLayer) { enableWind(); return; }
        syncScope();
      }, 120_000);

      // Enable straight away when not reduced-motion. enableWind's own async
      // work (script load + windfield fetch) lets the map reach its settled size
      // before the layer is added; leaflet-velocity then restarts cleanly on the
      // fit's move/zoom events.
      if (windOn) enableWind();
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
            background: ${isSelected ? color : "rgba(20,22,26,0.92)"};
            border: 2px solid ${color};
            border-radius: ${spot.type === "buoy" ? "50%" : "8px"};
            padding: 3px 7px;
            font-size: 11px;
            font-weight: 700;
            color: ${isSelected ? "#14161a" : color};
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

  // Re-frame the map when the region filter changes. Spots span Puerto Rico to
  // Long Island (~1500 mi), so fitting all of them at once is a very wide view;
  // selecting a region zooms the map to just those spots. (Runs only on region
  // change, not on the 5-min data refresh, so it never fights a user's pan/zoom.)
  useEffect(() => {
    const map = mapInstanceRef.current as L.Map | null;
    if (!map) return; // not created yet — the initial ResizeObserver fit frames the first view
    const framed = region === "All" ? spots : spots.filter((s) => s.region === region);
    if (!framed.length) return;
    import("leaflet").then((L) => {
      const bounds = L.latLngBounds(framed.map((s) => [s.lat, s.lon] as [number, number]));
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9, animate: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  return (
    <div ref={mapRef} style={{ position: "absolute", inset: 0, background: "#1b1e24" }}>
      <style>{`
        .kite-tooltip {
          background: rgba(20,22,26,0.95) !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          color: #fff !important;
          font-size: 12px !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .kite-tooltip::before { display: none !important; }
        .leaflet-control-zoom a {
          background: rgba(20,22,26,0.92) !important;
          color: rgba(255,255,255,0.7) !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .wind-toggle {
          display: flex; align-items: center; gap: 6px;
          background: rgba(20,22,26,0.92);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.62);
          font: 700 9px/1 'JetBrains Mono', monospace;
          letter-spacing: 0.14em;
          padding: 7px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .wind-toggle .wind-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #3a3e44; transition: background 0.15s, box-shadow 0.15s;
        }
        .wind-toggle[aria-pressed="true"] {
          color: #ffb000; border-color: rgba(255,176,0,0.4);
        }
        .wind-toggle[aria-pressed="true"] .wind-dot {
          background: #ffb000; box-shadow: 0 0 6px #ffb000;
        }
      `}</style>
    </div>
  );
}
