/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { DISTRICT, type LatLng } from "@/lib/district";

declare global {
  interface Window {
    __districtRideMapsReady?: () => void;
  }
}

let loader: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.google?.maps?.Map) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    window.__districtRideMapsReady = () => resolve();
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"];
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__districtRideMapsReady&channel=${channel}`;
    s.async = true;
    s.onerror = () => reject(new Error("Map failed to load"));
    document.head.appendChild(s);
  });
  return loader;
}

export type MapMarker = { id: string; position: LatLng; label: string; color: string };

export function MapView({
  markers,
  onPick,
  className,
  line,
}: {
  markers: MapMarker[];
  onPick?: (p: LatLng) => void;
  className?: string;
  line?: [LatLng, LatLng] | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pins = useRef<Map<string, google.maps.Marker>>(new Map());
  const poly = useRef<google.maps.Polyline | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !el.current) return;
        const b = DISTRICT.bounds;
        map.current = new google.maps.Map(el.current, {
          center: DISTRICT.center,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          restriction: { latLngBounds: b, strictBounds: false },
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
        });
        map.current.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) pickRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const icon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: m.color,
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      };
      const existing = pins.current.get(m.id);
      if (existing) {
        existing.setPosition(m.position);
        existing.setIcon(icon);
      } else {
        pins.current.set(
          m.id,
          new google.maps.Marker({ map: map.current, position: m.position, title: m.label, icon }),
        );
      }
    }
    for (const [id, pin] of pins.current) {
      if (!seen.has(id)) {
        pin.setMap(null);
        pins.current.delete(id);
      }
    }
    if (markers.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend(m.position));
      map.current.fitBounds(bounds, 60);
    } else if (markers.length === 1) {
      map.current.panTo(markers[0]!.position);
    }
  }, [ready, markers]);

  useEffect(() => {
    if (!ready || !map.current) return;
    poly.current?.setMap(null);
    if (line) {
      poly.current = new google.maps.Polyline({
        map: map.current,
        path: line,
        strokeColor: "#1f6b4a",
        strokeWeight: 4,
        strokeOpacity: 0.8,
      });
    }
  }, [ready, line]);

  return (
    <div className={`relative overflow-hidden bg-muted ${className ?? ""}`}>
      <div ref={el} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {failed ? "Map unavailable" : "Loading map…"}
        </div>
      )}
    </div>
  );
}

// Marker colors (map canvas needs literal colors, not CSS classes)
export const PIN = { pickup: "#1f8a55", drop: "#111827", driver: "#9bd31a", me: "#2563eb" };
