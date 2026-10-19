import { queryOptions } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Ride = Database["public"]["Tables"]["rides"]["Row"];
export type Offer = Database["public"]["Tables"]["ride_offers"]["Row"];

export const profileQuery = (uid: string) =>
  queryOptions({
    queryKey: ["profile", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Share the driver's GPS position every 5 seconds while enabled. */
export function useLocationBroadcast(driverId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    let last: GeolocationPosition | null = null;
    const watch = navigator.geolocation.watchPosition(
      (p) => (last = p),
      () => {},
      { enableHighAccuracy: true },
    );
    const push = () => {
      if (!last) return;
      supabase
        .from("driver_status")
        .upsert({
          driver_id: driverId,
          is_online: true,
          lat: last.coords.latitude,
          lng: last.coords.longitude,
          updated_at: new Date().toISOString(),
        })
        .then(() => {});
    };
    const t = setInterval(push, 5000);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(t);
    };
  }, [driverId, enabled]);
}

export async function signOut(qc: { cancelQueries: () => Promise<void>; clear: () => void }) {
  await qc.cancelQueries();
  qc.clear();
  await supabase.auth.signOut();
}
