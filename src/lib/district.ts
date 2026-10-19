// Rahim Yar Khan district service area (approximate bounding box). Mirrors the database geofence.
export const DISTRICT = {
  name: "Rahim Yar Khan",
  center: { lat: 28.4202, lng: 70.2952 },
  bounds: { south: 27.65, north: 29.3, west: 69.45, east: 71.05 },
};

export type LatLng = { lat: number; lng: number };

export function inDistrict(p: LatLng) {
  const b = DISTRICT.bounds;
  return p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east;
}

export function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Vehicle = "motorcycle" | "rickshaw" | "car" | "minivan" | "delivery";

export const VEHICLES: { id: Vehicle; label: string; emoji: string; base: number; perKm: number }[] = [
  { id: "motorcycle", label: "Bike", emoji: "🏍️", base: 50, perKm: 20 },
  { id: "rickshaw", label: "Rickshaw", emoji: "🛺", base: 70, perKm: 30 },
  { id: "car", label: "Car", emoji: "🚗", base: 120, perKm: 50 },
  { id: "minivan", label: "Mini-van", emoji: "🚐", base: 200, perKm: 70 },
  { id: "delivery", label: "Parcel", emoji: "📦", base: 80, perKm: 25 },
];

/** Suggested fare in PKR, rounded to the nearest 10. */
export function suggestedFare(vehicle: Vehicle, km: number) {
  const v = VEHICLES.find((x) => x.id === vehicle)!;
  return Math.max(v.base, Math.round((v.base + v.perKm * km) / 10) * 10);
}

export const vehicleLabel = (v: string) => VEHICLES.find((x) => x.id === v)?.label ?? v;

export const STATUS_LABEL: Record<string, string> = {
  searching: "Looking for drivers",
  accepted: "Driver on the way",
  arrived: "Driver has arrived",
  in_progress: "On the trip",
  completed: "Completed",
  cancelled: "Cancelled",
};
