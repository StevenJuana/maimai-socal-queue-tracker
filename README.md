# maimai SoCal Queue Tracker

A mobile-first community tracker for current maimai DX play and queue counts at Southern California Round1 locations. Anyone can browse; manually approved players can submit counts. Updates are append-only history records, and the home page shows the most recent report.

## Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS 4 (with a small amount of custom CSS)
- Supabase Auth, PostgreSQL, Row Level Security, private Storage
- Vercel deployment
- Installable PWA manifest and lightweight service worker

The browser uses only the public Supabase anon/publishable key. A server-only Supabase service-role key is required for admin account deletion; never put it in `NEXT_PUBLIC_*` or browser code. The MVP intentionally has no maimai API, paid service, maps, analytics, or email vendor.

## Local setup

1. Install Node.js 20.9 or newer.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon/publishable key.
3. Install packages and start Next.js:

   ```sh
   npm install
   npm run dev
   ```

4. Open http://localhost:3000.

Without Supabase environment values, the site displays a connection friendly empty/error state; signup and writes are disabled.

## Supabase setup

1. Create a Supabase project on the Free plan. In Project Settings → API, copy the Project URL and anon/publishable key into `.env.local`.
2. Apply the migrations in timestamp order using the Supabase SQL Editor or the Supabase CLI linked to your project. For the existing hardened project, apply `supabase/migrations/202609240004_account_management.sql` after the security-hardening migration. It adds normalized display-name uniqueness, preserves status history on account deletion, and keeps the curated public view available. The hardening migration itself is not in this checkout's tracked migrations, so use the existing reviewed/applied hardening SQL when setting up a fresh database before applying `004`.
3. The migration creates profiles, locations, verification requests, append-only status updates, RLS policies, a private screenshot bucket, an admin review function, and the seven initial Round1 locations. Location records can be added/edited in the Supabase Table Editor; set `active=false` to hide a location without deleting its history.
4. In Authentication → Providers → Email, turn off **Confirm email** for the simplest $0 onboarding flow. If enabled, users may need to confirm and then log in before submitting their screenshot from My account. Supabase's built-in email delivery has low limits and is not a production email service.

### First administrator

1. Sign up for the app and make sure the `profiles` row exists (`auth.users` insert creates it automatically).
2. In Supabase SQL Editor, find your user UUID under Authentication → Users, then run (replace the UUID):

   ```sql
   update public.profiles
   set role = 'admin'
   where id = '00000000-0000-0000-0000-000000000000';
   ```

This uses the trusted Supabase SQL Editor and does not put an admin email or password in the source. Admin status and verification state cannot be changed through a normal user's profile update. Admins can then review pending screenshot requests and approved accounts at `/admin`.

## Security and privacy

- Locations and public status counts are readable without login. The `public_status_updates` view exposes only counts, time, location, and display name.
- Inserts into `status_updates` require the signed-in user to be approved and the inserted user ID to match their account. Counts are constrained to 0–99 in both UI and database.
- Verification and role changes are protected by RLS and a database trigger. The security-definer review function checks the caller's admin role before changing either status.
- Screenshot storage is private, capped at 4MB, and only the owner can upload to their UUID folder. Only admins can read or delete images. The admin UI creates a five-minute signed URL. After review, it attempts to delete the screenshot; database review remains saved if storage deletion fails. Admin account deletion removes that account's private Storage folder through the Storage API before deleting the Auth user.
- Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and in Vercel's Production (and Preview, if used) environment. It is read only by a `server-only` module for the narrow admin account-deletion action. It is not sent to the browser. `.env.local` is ignored by Git.
- Account deletion is limited server-side to a different, approved, non-admin player. The Supabase Auth user is deleted; their profile and verification request cascade away, status history remains with a null `user_id`, and the public view labels that reporter “Deleted player.”

## PWA and stale data

The manifest sets the app name, short name, theme, portrait preference, and standalone display mode; the included SVG icon is used for app identity. On iPhone, open the deployed site in Safari → Share → Add to Home Screen. This is a web app, not a native iOS app. The service worker caches the public home shell as a network fallback; authenticated pages are not cached.

Status counts are treated as current for less than 6 hours from the update's `created_at` timestamp. At 6 hours or older, the card hides the old counts and shows the no-current-status state; the history record remains stored. For current reports, the page shows elapsed time and reporter.

## Deploy to Vercel

1. Push the project to a Git provider, then import it in Vercel. The Hobby plan can deploy the app using the provided `*.vercel.app` URL.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel Project Settings → Environment Variables for Production (and Preview if desired).
3. Deploy. Add the Vercel URL to Supabase Authentication → URL Configuration → Site URL and allowed redirect URLs if you later enable confirmation or OAuth.
4. Confirm the free-plan limits for your expected traffic and storage before launch; free tiers can change and may pause inactive projects.

## Commands

- `npm run dev` — local development
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript checks
- `npm run build` — production build

## Free-tier notes

Supabase and Vercel free tiers have quotas and policies that may change. Supabase Free projects have limited database/storage/egress and can be paused after inactivity; Vercel Hobby is aimed at personal/non-commercial use. This repo adds no paid APIs, custom domain, or paid hosting dependency. Image resizing is attempted in the browser; upload remains capped at 4MB. Screenshot cleanup runs after admin review, with failed deletes left for a later manual cleanup from Storage.
