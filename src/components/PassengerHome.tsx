import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapView, PIN, type MapMarker } from "@/components/MapView";
import {
  DISTRICT,
  STATUS_LABEL,
  VEHICLES,
  distanceKm,
  inDistrict,
  suggestedFare,
  vehicleLabel,
  type LatLng,
  type Vehicle,
} from "@/lib/district";

export function PassengerHome({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle>("rickshaw");
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [drop, setDrop] = useState<LatLng | null>(null);
  const [picking, setPicking] = useState<"pickup" | "drop">("pickup");
  const [pickupText, setPickupText] = useState("");
  const [dropText, setDropText] = useState("");
  const [fare, setFare] = useState("");
  const [payment, setPayment] = useState("cash");
  const [parcel, setParcel] = useState("");
  const [busy, setBusy] = useState(false);

  const km = pickup && drop ? distanceKm(pickup, drop) * 1.3 : null; // road factor estimate
  const suggestion = km != null ? suggestedFare(vehicle, km) : null;

  const history = useQuery({
    queryKey: ["my-rides", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("passenger_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const markers = useMemo(() => {
    const m: MapMarker[] = [];
    if (pickup) m.push({ id: "pickup", position: pickup, label: "Pickup", color: PIN.pickup });
    if (drop) m.push({ id: "drop", position: drop, label: "Drop-off", color: PIN.drop });
    return m;
  }, [pickup, drop]);

  function pick(p: LatLng) {
    if (!inDistrict(p)) return toast.error(`Only inside ${DISTRICT.name} district`);
    if (picking === "pickup") {
      setPickup(p);
      setPicking("drop");
    } else setDrop(p);
  }

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!inDistrict(p)) return toast.error(`You're outside ${DISTRICT.name} district`);
        setPickup(p);
        setPickupText("My location");
        setPicking("drop");
      },
      () => toast.error("Couldn't get your location"),
      { enableHighAccuracy: true },
    );
  }

  async function request() {
    if (!pickup || !drop) return toast.error("Set pickup and drop-off on the map");
    const amount = parseInt(fare || String(suggestion), 10);
    if (!amount || amount < 30) return toast.error("Enter your fare (min PKR 30)");
    setBusy(true);
    const { data, error } = await supabase
      .from("rides")
      .insert({
        passenger_id: userId,
        vehicle_type: vehicle,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        pickup_address: pickupText || null,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
        drop_address: dropText || null,
        distance_km: km ? Number(km.toFixed(2)) : null,
        offered_fare: amount,
        payment_method: payment,
        parcel_note: vehicle === "delivery" ? parcel || null : null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/ride/$id", params: { id: data.id } });
  }

  const active = history.data?.find((r) => !["completed", "cancelled"].includes(r.status));

  return (
    <div className="space-y-4 px-5">
      {active && (
        <Link
          to="/ride/$id"
          params={{ id: active.id }}
          className="block rounded-2xl bg-accent p-4 text-accent-foreground shadow-glow"
        >
          <p className="text-xs font-bold uppercase">Current ride</p>
          <p className="font-bold">{STATUS_LABEL[active.status]} →</p>
        </Link>
      )}

      <div className="grid grid-cols-5 gap-2">
        {VEHICLES.map((v) => (
          <button
            key={v.id}
            onClick={() => setVehicle(v.id)}
            className={`rounded-2xl border-2 py-2.5 text-center transition ${
              vehicle === v.id ? "border-primary bg-secondary" : "border-transparent bg-card shadow-card"
            }`}
          >
            <div className="text-2xl">{v.emoji}</div>
            <div className="text-[11px] font-semibold">{v.label}</div>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl bg-card shadow-card">
        <div className="relative">
          <MapView markers={markers} onPick={pick} line={pickup && drop ? [pickup, drop] : null} className="h-64" />
          <div className="absolute left-3 top-3 rounded-full bg-card px-3 py-1.5 text-xs font-bold shadow-card">
            Tap map to set {picking === "pickup" ? "pickup" : "drop-off"}
          </div>
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPicking("pickup")}
              className={`size-3 shrink-0 rounded-full bg-success ${picking === "pickup" ? "ring-4 ring-secondary" : ""}`}
              aria-label="Set pickup on map"
            />
            <Input
              placeholder={pickup ? "Pickup set on map — add a landmark" : "Pickup"}
              value={pickupText}
              onChange={(e) => setPickupText(e.target.value)}
              onFocus={() => setPicking("pickup")}
              className="h-11 rounded-xl border-0 bg-muted"
            />
            <button onClick={useMyLocation} aria-label="Use my location" className="rounded-xl bg-secondary p-3 text-primary">
              <Crosshair className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPicking("drop")}
              className={`size-3 shrink-0 rounded-sm bg-foreground ${picking === "drop" ? "ring-4 ring-secondary" : ""}`}
              aria-label="Set drop-off on map"
            />
            <Input
              placeholder={drop ? "Drop-off set on map — add a landmark" : "Drop-off"}
              value={dropText}
              onChange={(e) => setDropText(e.target.value)}
              onFocus={() => setPicking("drop")}
              className="h-11 rounded-xl border-0 bg-muted"
            />
          </div>
        </div>
      </div>

      {vehicle === "delivery" && (
        <Input
          placeholder="What are you sending? (e.g. documents, small box)"
          value={parcel}
          onChange={(e) => setParcel(e.target.value)}
          className="h-12 rounded-2xl bg-card"
        />
      )}

      <div className="rounded-3xl bg-card p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="font-bold">Offer your fare</p>
          {km != null && (
            <p className="text-xs text-muted-foreground">
              ~{km.toFixed(1)} km · suggested PKR {suggestion}
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-lg font-bold text-muted-foreground">PKR</span>
          <Input
            inputMode="numeric"
            placeholder={suggestion ? String(suggestion) : "200"}
            value={fare}
            onChange={(e) => setFare(e.target.value.replace(/\D/g, ""))}
            className="h-13 rounded-2xl border-0 bg-muted text-2xl font-bold"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold">
          {[
            { id: "cash", label: "💵 Cash", on: true },
            { id: "easypaisa", label: "Easypaisa", on: false },
            { id: "jazzcash", label: "JazzCash", on: false },
          ].map((p) => (
            <button
              key={p.id}
              disabled={!p.on}
              onClick={() => setPayment(p.id)}
              className={`rounded-xl border-2 py-2 disabled:opacity-40 ${
                payment === p.id ? "border-primary bg-secondary" : "border-border"
              }`}
            >
              {p.label}
              {!p.on && <span className="block text-[9px] font-normal">soon</span>}
            </button>
          ))}
        </div>
      </div>

      <Button size="xl" onClick={request} disabled={busy || !!active}>
        {active ? "You already have an active ride" : busy ? "Requesting…" : `Find ${vehicleLabel(vehicle)} drivers`}
      </Button>

      {!!history.data?.length && (
        <section className="pt-4">
          <h3 className="mb-2 font-bold">Recent</h3>
          <div className="space-y-2">
            {history.data.map((r) => (
              <Link
                key={r.id}
                to="/ride/$id"
                params={{ id: r.id }}
                className="flex items-center justify-between rounded-2xl bg-card p-3 shadow-card"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {vehicleLabel(r.vehicle_type)} · {r.drop_address || "Drop-off"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()} · {STATUS_LABEL[r.status]}
                  </p>
                </div>
                <p className="font-bold">PKR {r.final_fare ?? r.offered_fare}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
