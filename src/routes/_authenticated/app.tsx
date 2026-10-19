import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { profileQuery, signOut } from "@/lib/data";
import { Onboarding } from "@/components/Onboarding";
import { PassengerHome } from "@/components/PassengerHome";
import { DriverHome } from "@/components/DriverHome";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Home — District Ride" },
      { name: "description", content: "Request a ride or find passengers in Rahim Yar Khan." },
      { property: "og:title", content: "District Ride" },
      { property: "og:description", content: "Request rides and compare driver offers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppHome,
});

function AppHome() {
  const { userId } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useQuery(profileQuery(userId));

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const ready = profile?.full_name && profile.account_type;

  return (
    <div className="mx-auto min-h-screen max-w-md pb-10">
      <header className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {profile?.account_type === "driver" ? "Driver" : "Passenger"}
          </p>
          <h1 className="text-xl font-extrabold text-primary">
            {ready ? `Hi, ${profile!.full_name!.split(" ")[0]}` : "District Ride"}
          </h1>
        </div>
        <button
          aria-label="Sign out"
          className="rounded-full bg-secondary p-2.5 text-secondary-foreground"
          onClick={async () => {
            await signOut(qc);
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="size-4" />
        </button>
      </header>
      {!ready ? (
        <Onboarding userId={userId} />
      ) : profile!.account_type === "driver" ? (
        <DriverHome profile={profile!} />
      ) : (
        <PassengerHome userId={userId} />
      )}
    </div>
  );
}
