import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VEHICLES, type Vehicle } from "@/lib/district";

export function Onboarding({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"passenger" | "driver">("passenger");
  const [vehicle, setVehicle] = useState<Vehicle>("rickshaw");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim().length < 2) return void toast.error("Enter your name");
    if (type === "driver" && plate.trim().length < 3) return void toast.error("Enter your vehicle number");
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: name.trim(),
        account_type: type,
        vehicle_type: type === "driver" ? vehicle : null,
        vehicle_plate: type === "driver" ? plate.trim().toUpperCase() : null,
      })
      .eq("id", userId);
    setBusy(false);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile", userId] });
  }

  return (
    <div className="space-y-6 px-5">
      <h2 className="text-2xl font-bold">Set up your account</h2>
      <Input
        placeholder="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-13 rounded-2xl bg-card"
      />
      <div className="grid grid-cols-2 gap-3">
        {(["passenger", "driver"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-2xl border-2 p-4 text-left transition ${
              type === t ? "border-primary bg-secondary" : "border-border bg-card"
            }`}
          >
            <div className="text-2xl">{t === "passenger" ? "🙋" : "🧑‍✈️"}</div>
            <div className="mt-2 font-bold capitalize">{t}</div>
            <div className="text-xs text-muted-foreground">
              {t === "passenger" ? "Book rides & parcels" : "Earn by giving rides"}
            </div>
          </button>
        ))}
      </div>
      {type === "driver" && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Your vehicle</p>
          <div className="grid grid-cols-5 gap-2">
            {VEHICLES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVehicle(v.id)}
                className={`rounded-xl border-2 py-2 text-center ${
                  vehicle === v.id ? "border-primary bg-secondary" : "border-border bg-card"
                }`}
              >
                <div className="text-xl">{v.emoji}</div>
                <div className="text-[10px] font-semibold">{v.label}</div>
              </button>
            ))}
          </div>
          <Input
            placeholder="Vehicle number, e.g. RYK-1234"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            className="h-13 rounded-2xl bg-card"
          />
        </div>
      )}
      <Button size="xl" onClick={save} disabled={busy}>
        Continue
      </Button>
    </div>
  );
}
