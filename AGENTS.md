<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Ride flow data lives in Lovable Cloud tables (profiles, driver_status, rides, ride_offers); clients talk to them directly under RLS, with live updates via realtime subscriptions. Why: low-latency bidding without a custom socket server.
- Accepting an offer goes through the `accept_offer` database function. Why: assigns the driver and rejects other offers atomically.
- The district geofence is enforced by a database trigger and mirrored in `src/lib/district.ts`. Why: the client check is for UX only; the DB is the source of truth.
- Google Maps JS is loaded lazily inside `MapView` effects with the managed browser key. Why: keeps SSR safe.
