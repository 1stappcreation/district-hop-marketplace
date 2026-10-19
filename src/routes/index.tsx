import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { VEHICLES } from "@/lib/district";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "District Ride — Name your fare in Rahim Yar Khan" },
      {
        name: "description",
        content:
          "Local rides and parcel delivery in Rahim Yar Khan. Suggest your fare, compare driver offers, and ride.",
      },
      { property: "og:title", content: "District Ride — Name your fare" },
      {
        property: "og:description",
        content: "Bikes, rickshaws, cars and mini-vans across Rahim Yar Khan district.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-hero text-primary-foreground">
      <div className="flex flex-1 flex-col px-6 pt-14">
        <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
          Rahim Yar Khan
        </span>
        <h1 className="mt-6 text-5xl font-extrabold leading-[1.05]">
          Your ride.
          <br />
          <span className="text-accent">Your price.</span>
        </h1>
        <p className="mt-4 text-lg text-primary-foreground/80">
          Suggest a fare, get offers from nearby drivers, pick the one you like.
        </p>
        <div className="mt-10 grid grid-cols-5 gap-2">
          {VEHICLES.map((v) => (
            <div
              key={v.id}
              className="flex flex-col items-center gap-1 rounded-2xl bg-primary-foreground/10 py-3"
            >
              <span className="text-2xl">{v.emoji}</span>
              <span className="text-[11px] font-semibold">{v.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 px-6 pb-10">
        <Button asChild variant="hero" size="xl">
          <Link to="/auth">Get started</Link>
        </Button>
        <p className="text-center text-xs text-primary-foreground/60">
          Passengers and drivers sign in with their mobile number
        </p>
      </div>
    </main>
  );
}
