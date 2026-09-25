# maimai SoCal Queue Tracker

A small community project for checking maimai DX queue conditions at Round1 locations around Southern California. Updates are crowdsourced, so they can change quickly.

**Try the app:** [maimai SoCal Queue Tracker](https://maimai-socal-queue-tracker.vercel.app/)

## What it does

- Shows recent play and queue counts for eight SoCal Round1 locations: Burbank, Lakewood, Main Place, Puente Hills, Mission Viejo, Temecula, Moreno Valley, and Plaza Bonita.
- Lets approved players submit updates after an admin reviews their maimai profile screenshot.
- Includes admin tools for verification, approved-player account management, test status data, and status moderation.
- Keeps status history while showing only eligible, fresh reports publicly.

## Stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS 4 with a small amount of custom CSS
- Supabase Auth, PostgreSQL, Row Level Security, and private Storage
- Vercel deployment and an installable PWA

The app uses username and password for sign-in. Supabase Auth still stores an internal email identifier; the normal app UI does not show it. The app has no maimai API, paid API, map service, analytics vendor, or email vendor.

## Run it locally

You’ll need Node.js 20.9 or newer and a Supabase project of your own for development.

1. Fork and clone the repository.
2. Copy `.env.example` to `.env.local` and add your own Supabase project values. Keep the service-role key server-side and out of Git.
3. Install dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

Without Supabase values, the app can show a connection/error state; sign-up and database writes will not work.

## Supabase setup

Use a development Supabase project, not the production project. Set up the schema by applying every file in `supabase/migrations/` in timestamp order:

1. `202609240001_initial_schema.sql` — core tables, RLS, storage bucket, admin review RPC, and initial locations.
2. `202609240002_correct_socal_locations.sql` — corrects the initial Round1 location set.
3. `202609240003_security_integrity_hardening.sql` — restricts raw-table access and adds the original database-side integrity protections.
4. `202609240004_account_management.sql` — normalized display-name uniqueness and account-deletion history handling.
5. `202609240005_add_plaza_bonita_location.sql` — adds Plaza Bonita.
6. `202609240006_status_update_test_data.sql` — adds protected test-status support.
7. `202609240007_status_update_removal.sql` — adds admin-only soft removal and moderation history.
8. `202609250001_username_auth.sql` — adds unique usernames and username-based authentication support.

The repository includes the hardening migration needed for a fresh database setup. Use the Supabase SQL Editor or Supabase CLI against your own development project.

In Supabase Authentication → Providers → Email, turn **Confirm email** off. New accounts use random internal email identifiers that users cannot receive mail at. Self-service password recovery is not available; an administrator handles account recovery for now.

To make the first administrator, create an account in the app, find its UUID in Supabase Authentication → Users, then set its profile role from the SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = '00000000-0000-0000-0000-000000000000';
```

Replace the example UUID with the account’s UUID. Admin role and verification state cannot be changed through a normal user profile update.

## Security and privacy

- Public queue data comes from the curated `public_status_updates` view. Public clients do not have direct read access to raw `status_updates` history.
- Approved players can submit their own reports. Counts are constrained to 0–99.
- Verification screenshots are stored privately. Owners can upload to their own folder; admins can review them. Screenshots are removed after review when cleanup succeeds.
- Admin actions are checked server-side and by database authorization. Status moderation soft-removes a row; it does not erase its history.
- Status history is retained, including after account deletion. A deleted reporter is shown as “Deleted player.”
- Public status is fresh for less than six hours based on `created_at`.
- The browser uses only the public Supabase publishable key. `SUPABASE_SERVICE_ROLE_KEY` is server-only, is used for privileged username/auth operations and account deletion, bypasses normal RLS, and must never be exposed through `NEXT_PUBLIC_*`, sent to the browser, or committed.

See [SECURITY.md](SECURITY.md) for how to report a security issue privately.

## PWA

The app is installable and uses `public/maimai-queue-tracker-logo.png` as its app icon. On iPhone, open the site in Safari, tap **Share**, then **Add to Home Screen**. It remains a web app, not a native iOS app. Authenticated pages are not cached; the service worker can use the public home shell as an offline fallback.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

## Free-tier hosting

The project can run on Supabase Free and Vercel Hobby without a paid API or custom domain. Free-tier quotas, policies, and eligibility can change, so check the providers’ current terms for your use.
