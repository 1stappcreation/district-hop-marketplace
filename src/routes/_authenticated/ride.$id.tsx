import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Phone, Siren } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MapView, PIN, type MapMarker } from "@/components/MapView";
import { useLocationBroadcast } from "@/lib/data";
import { STATUS_LABEL, distanceKm, vehicleLabel } from "@/lib/district";

export const Route = createFileRoute("/_authenticated/ride/$id")({
  head: () => ({
    meta: [
      { title: "Your ride — District Ride" },
      { name: "description", content: "Live ride status, driver offers and tracking." },
      { property: "og:title", content: "Ride — District Ride" },
      { property: "og:description", content: "Live ride status and tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RidePage,
});

const NEXT: Record<string, { to: "arrived" | "in_progress" | "completed"; label: string }> = {
  accepted: { to: "arrived", label: "I've arrived" },
  arrived: { to: "in_progress", label: "Start trip" },
  in_progress: { to: "completed", label: "Complete trip" },
};

function RidePage() {
  const { id } = Route.useParams();
  const { userId } = Route.useRouteContext();
  const qc = useQueryClient();
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);

  const ride = useQuery({
    queryKey: ["ride", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rides").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const r = ride.data;
  const isPassenger = r?.passenger_id === userId;
  const isDriver = !!r && r.driver_id === userId;

  const offers = useQuery({
    queryKey: ["offers", id],
    enabled: isPassenger && r?.status === "searching",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_offers")
        .select("*")
        .eq("ride_id", id)
        .eq("status", "pending")
        .order("amount");
      if (error) throw error;
      return data;
    },
  });

  const peopleIds = [r?.driver_id, r?.passenger_id, ...(offers.data?.map((o) => o.driver_id) ?? [])].filter(Boolean) as string[];
  const people = useQuery({
    queryKey: ["people", peopleIds.sort().join(",")],
    enabled: peopleIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, phone, vehicle_type, vehicle_plate").in("id", peopleIds);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`ride-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides", filter: `id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["ride", id] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_offers", filter: `ride_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["offers", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  // Live driver location
  const driverId = r?.driver_id;
  const live = !!r && ["accepted", "arrived", "in_progress"].includes(r.status);
  useEffect(() => {
    if (!driverId || !live) return;
    supabase
      .from("driver_status")
      .select("lat,lng")
      .eq("driver_id", driverId)
      .maybeSingle()
      .then(({ data }) => data?.lat && setDriverPos({ lat: data.lat, lng: data.lng! }));
    const ch = supabase
      .channel(`loc-${driverId}-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_status", filter: `driver_id=eq.${driverId}` }, (p) => {
        const n = p.new as { lat: number | null; lng: number | null };
        if (n.lat && n.lng) setDriverPos({ lat: n.lat, lng: n.lng });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [driverId, live, id]);

  useLocationBroadcast(userId, isDriver && live);

  const markers = useMemo(() => {
    if (!r) return [];
    const m: MapMarker[] = [
      { id: "pickup", position: { lat: r.pickup_lat, lng: r.pickup_lng }, label: "Pickup", color: PIN.pickup },
      { id: "drop", position: { lat: r.drop_lat, lng: r.drop_lng }, label: "Drop-off", color: PIN.drop },
    ];
    if (driverPos && live) m.push({ id: "driver", position: driverPos, label: "Driver", color: PIN.driver });
    return m;
  }, [r, driverPos, live]);

  if (ride.isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!r) return <div className="p-8 text-center">Ride not found. <Link to="/app" className="text-primary">Back</Link></div>;

  async function accept(offerId: string) {
    const { error } = await supabase.rpc("accept_offer", { _offer_id: offerId });
    if (error) toast.error(error.message);
    else toast.success("Driver confirmed!");
  }
  async function setStatus(status: "cancelled" | "arrived" | "in_progress" | "completed") {
    const { error } = await supabase.from("rides").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
  }

  const driver = r.driver_id ? people.data?.[r.driver_id] : null;
  const passenger = people.data?.[r.passenger_id];
  const other = isPassenger ? driver : passenger;
  const pickup = { lat: r.pickup_lat, lng: r.pickup_lng };
  const eta = driverPos && r.status === "accepted" ? Math.max(1, Math.round((distanceKm(driverPos, pickup) * 1.3 * 60) / 25)) : null;
  const navTarget = r.status === "in_progress" ? `${r.drop_lat},${r.drop_lng}` : `${r.pickup_lat},${r.pickup_lng}`;

  return (
    <div className="mx-auto min-h-screen max-w-md pb-28">
      <div className="relative">
        <MapView markers={markers} className="h-[45vh]" line={[pickup, { lat: r.drop_lat, lng: r.drop_lng }]} />
        <Link to="/app" aria-label="Back" className="absolute left-4 top-4 rounded-full bg-card p-2.5 shadow-card">
          <ArrowLeft className="size-5" />
        </Link>
      </div>

      <div className="-mt-6 relative space-y-4 rounded-t-3xl bg-background px-5 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{vehicleLabel(r.vehicle_type)}</p>
            <h1 className="text-2xl font-extrabold">{STATUS_LABEL[r.status]}</h1>
            {eta && <p className="text-sm text-primary">Arriving in ~{eta} min</p>}
          </div>
          <p className="text-2xl font-extrabold">PKR {r.final_fare ?? r.offered_fare}</p>
        </div>

        <div className="space-y-1 rounded-2xl bg-card p-4 text-sm shadow-card">
          <p>🟢 {r.pickup_address || "Pickup pin"}</p>
          <p>⚫ {r.drop_address || "Drop-off pin"}</p>
          {r.parcel_note && <p>📦 {r.parcel_note}</p>}
          <p className="pt-1 text-xs text-muted-foreground">
            {r.distance_km ? `~${r.distance_km} km · ` : ""}Pay by {r.payment_method}
          </p>
        </div>

        {isPassenger && r.status === "searching" && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-success" />
              </span>
              <p className="font-bold">Driver offers ({offers.data?.length ?? 0})</p>
            </div>
            {offers.data?.length === 0 && (
              <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                Waiting for nearby drivers to respond…
              </p>
            )}
            {offers.data?.map((o) => {
              const d = people.data?.[o.driver_id];
              return (
                <div key={o.id} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-card">
                  <div>
                    <p className="font-bold">{d?.full_name ?? "Driver"}</p>
                    <p className="text-xs text-muted-foreground">{d?.vehicle_plate}</p>
                    <p className="mt-1 text-xl font-extrabold">
                      PKR {o.amount}
                      {o.amount !== r.offered_fare && <span className="ml-2 text-xs font-semibold text-muted-foreground">counter-offer</span>}
                    </p>
                  </div>
                  <Button variant="hero" onClick={() => accept(o.id)}>Accept</Button>
                </div>
              );
            })}
            <Button variant="outline" className="w-full rounded-2xl" onClick={() => setStatus("cancelled")}>
              Cancel request
            </Button>
          </section>
        )}

        {other && live && (
          <div className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-card">
            <div>
              <p className="text-xs text-muted-foreground">{isPassenger ? "Your driver" : "Passenger"}</p>
              <p className="font-bold">{other.full_name}</p>
              {isPassenger && <p className="text-xs text-muted-foreground">{driver?.vehicle_plate}</p>}
            </div>
            {other.phone && (
              <a href={`tel:${other.phone}`} className="rounded-full bg-secondary p-3 text-primary" aria-label="Call">
                <Phone className="size-5" />
              </a>
            )}
          </div>
        )}

        {isDriver && NEXT[r.status] && (
          <div className="space-y-2">
            <Button size="xl" onClick={() => setStatus(NEXT[r.status].to)}>
              {NEXT[r.status].label}
            </Button>
            <Button asChild variant="outline" className="w-full rounded-2xl">
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${navTarget}`} target="_blank" rel="noreferrer">
                Navigate in Google Maps
              </a>
            </Button>
          </div>
        )}

        {isPassenger && r.status === "accepted" && (
          <Button variant="outline" className="w-full rounded-2xl" onClick={() => setStatus("cancelled")}>
            Cancel ride
          </Button>
        )}
      </div>

      {live && (
        <a href="tel:15" className="fixed bottom-6 right-6">
          <Button variant="sos" size="lg" className="pointer-events-none">
            <Siren className="size-5" /> SOS
          </Button>
        </a>
      )}
    </div>
  );
}
