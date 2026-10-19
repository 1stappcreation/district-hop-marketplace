import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLocationBroadcast, type Profile, type Ride } from "@/lib/data";
import { STATUS_LABEL, distanceKm, vehicleLabel, type LatLng } from "@/lib/district";

export function DriverHome({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const uid = profile.id;
  const [online, setOnline] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);

  useLocationBroadcast(uid, online);

  useEffect(() => {
    supabase
      .from("driver_status")
      .select("is_online")
      .eq("driver_id", uid)
      .maybeSingle()
      .then(({ data }) => setOnline(!!data?.is_online));
  }, [uid]);

  useEffect(() => {
    if (!online) return;
    const w = navigator.geolocation.watchPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("Allow location access to receive nearby rides"),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(w);
  }, [online]);

  async function toggle(v: boolean) {
    setOnline(v);
    const { error } = await supabase
      .from("driver_status")
      .upsert({ driver_id: uid, is_online: v, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
  }

  const requests = useQuery({
    queryKey: ["open-rides", profile.vehicle_type],
    enabled: online,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("status", "searching")
        .eq("vehicle_type", profile.vehicle_type!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const myOffers = useQuery({
    queryKey: ["my-offers", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("ride_offers").select("*").eq("driver_id", uid);
      if (error) throw error;
      return data;
    },
  });

  const myRides = useQuery({
    queryKey: ["driver-rides", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("driver_id", uid)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`driver-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => {
        qc.invalidateQueries({ queryKey: ["open-rides"] });
        qc.invalidateQueries({ queryKey: ["driver-rides", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_offers", filter: `driver_id=eq.${uid}` }, () =>
        qc.invalidateQueries({ queryKey: ["my-offers", uid] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);

  const active = myRides.data?.find((r) => ["accepted", "arrived", "in_progress"].includes(r.status));
  const completed = myRides.data?.filter((r) => r.status === "completed") ?? [];
  const today = completed.filter((r) => new Date(r.created_at).toDateString() === new Date().toDateString());
  const sum = (rs: Ride[]) => rs.reduce((s, r) => s + (r.final_fare ?? 0), 0);

  const sorted = [...(requests.data ?? [])]
    .map((r) => ({ r, km: me ? distanceKm(me, { lat: r.pickup_lat, lng: r.pickup_lng }) : null }))
    .filter((x) => x.km == null || x.km <= 15)
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0));

  return (
    <div className="space-y-4 px-5">
      <div className={`flex items-center justify-between rounded-3xl p-5 shadow-card ${online ? "bg-hero text-primary-foreground" : "bg-card"}`}>
        <div>
          <p className="text-lg font-bold">{online ? "You're online" : "You're offline"}</p>
          <p className={`text-xs ${online ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {vehicleLabel(profile.vehicle_type ?? "")} · {profile.vehicle_plate}
          </p>
        </div>
        <Switch checked={online} onCheckedChange={toggle} aria-label="Go online" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Today", v: `PKR ${sum(today)}` },
          { l: "All time", v: `PKR ${sum(completed)}` },
          { l: "Trips", v: completed.length },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl bg-card p-3 shadow-card">
            <p className="text-[11px] font-semibold text-muted-foreground">{s.l}</p>
            <p className="font-bold">{s.v}</p>
          </div>
        ))}
      </div>

      {active && (
        <Link to="/ride/$id" params={{ id: active.id }} className="block rounded-2xl bg-accent p-4 text-accent-foreground shadow-glow">
          <p className="text-xs font-bold uppercase">Active trip · PKR {active.final_fare}</p>
          <p className="font-bold">{STATUS_LABEL[active.status]} — open →</p>
        </Link>
      )}

      <section>
        <h3 className="mb-2 font-bold">Ride requests</h3>
        {!online ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Go online to see nearby requests.</p>
        ) : sorted.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">No requests right now. New ones appear here automatically.</p>
        ) : (
          <div className="space-y-3">
            {sorted.map(({ r, km }) => (
              <RequestCard key={r.id} ride={r} km={km} driverId={uid} offer={myOffers.data?.find((o) => o.ride_id === r.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RequestCard({
  ride,
  km,
  driverId,
  offer,
}: {
  ride: Ride;
  km: number | null;
  driverId: string;
  offer?: { amount: number; status: string };
}) {
  const qc = useQueryClient();
  const [counter, setCounter] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(amount: number) {
    setBusy(true);
    const { error } = await supabase
      .from("ride_offers")
      .upsert({ ride_id: ride.id, driver_id: driverId, amount, status: "pending" }, { onConflict: "ride_id,driver_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Offer of PKR ${amount} sent`);
    setCounter("");
    qc.invalidateQueries({ queryKey: ["my-offers", driverId] });
  }

  const nav = `https://www.google.com/maps/dir/?api=1&destination=${ride.pickup_lat},${ride.pickup_lng}`;

  return (
    <div className="rounded-3xl bg-card p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-extrabold">PKR {ride.offered_fare}</p>
          <p className="text-xs text-muted-foreground">
            {km != null ? `${km.toFixed(1)} km away · ` : ""}
            {ride.distance_km ? `${ride.distance_km} km trip` : ""} · {ride.payment_method}
          </p>
        </div>
        <a href={nav} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary">
          View pickup
        </a>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <p>🟢 {ride.pickup_address || "Pickup pin"}</p>
        <p>⚫ {ride.drop_address || "Drop-off pin"}</p>
        {ride.parcel_note && <p>📦 {ride.parcel_note}</p>}
      </div>
      {offer ? (
        <p className="mt-3 rounded-xl bg-secondary p-2.5 text-center text-sm font-semibold text-secondary-foreground">
          Your offer: PKR {offer.amount} · waiting for passenger
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <Button className="w-full rounded-xl" disabled={busy} onClick={() => send(ride.offered_fare)}>
            Accept for PKR {ride.offered_fare}
          </Button>
          <div className="flex gap-2">
            {[1.1, 1.2].map((m) => {
              const v = Math.round((ride.offered_fare * m) / 10) * 10;
              return (
                <Button key={m} variant="outline" size="sm" className="rounded-xl" disabled={busy} onClick={() => send(v)}>
                  {v}
                </Button>
              );
            })}
            <Input
              inputMode="numeric"
              placeholder="Your price"
              value={counter}
              onChange={(e) => setCounter(e.target.value.replace(/\D/g, ""))}
              className="h-8 rounded-xl"
            />
            <Button size="sm" variant="secondary" className="rounded-xl" disabled={busy || !counter} onClick={() => send(parseInt(counter, 10))}>
              Offer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
