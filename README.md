# BLIP

Map-first local discovery and commerce. BLIP blends nearby rooms, businesses, and chat into a single mobile-first experience backed by Supabase.

## Highlights (implemented)
- Map-first Home with clustering, spiderfy, recenter, and scoped search (rooms/businesses/posts).
- Feed with tabs, search, tags, and post creation (media uploads supported).
- Realtime chat for rooms, businesses, and direct messages (media uploads supported).
- Business profiles (menu, offers, Q&A chat, reviews, ratings, hours exceptions).
- Orders flow (menu -> cart -> order + order_items).
- Business Admin Portal and Blip Admin Portal (staff, audit logs, verification queue).
- Analytics ingest, AI moderation checks, device ID, and onboarding flow.

## Rollout blockers / pending
- Magic link + email OTP auth (proper domain + deep links required).
- Google OAuth.
- Payments / billing provider and webhooks.
- Web parity (location disabled on web; mobile-first only).
- Push delivery requires FCM/APNS keys + redeploy `push-send`.

## Repo layout
- `app/App.tsx`: Single-file Expo/React Native app.
- `app/.env`: Client env vars (see `.env.example`).
- `supabase/migrations/*.sql`: Database schema + RLS policies.
- `supabase/functions/*`: Edge functions (analytics, moderation, push).
- `supabase/scripts/*`: Utility scripts (e.g., city backfill).
- `BLIP_SYSTEM_DOCUMENTATION.md`: Current system state and how things work.
- `STATUS_REPORT.md`: Completed/In-Progress/Pending.
- `BLIP_FEATURES_SPEC.md`: Product spec and requirements.
- `BLIP_AI_RULES.md`: Product decisions and constraints.
- `app/SMOKE_CHECKLIST.md`: UI smoke checklist.
- `backups/`: Local UI snapshots (App.tsx backups per task).

## Quick start (local)
Prereqs:
- Node.js (LTS)
- npm

Steps:
1) Install dependencies:
   - `cd app`
   - `npm install`
2) Configure env:
   - Copy `app/.env.example` to `app/.env`
   - Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3) Run:
   - `npm start`
   - Or `npm run android` / `npm run ios`

If Supabase env vars are missing, the app uses demo data for some screens.

## Supabase setup (optional but recommended)
You will need the Supabase CLI to apply migrations and deploy edge functions.

Apply migrations:
- `supabase db push`

Deploy functions:
- `supabase functions deploy analytics-ingest`
- `supabase functions deploy moderation-check`
- `supabase functions deploy push-send`

Push notifications require secrets (set in Supabase):
- `FCM_SERVER_KEY`, `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`
- `SUPABASE_SERVICE_ROLE_KEY` (or reuse `ANALYTICS_SERVICE_ROLE_KEY`)

Storage buckets (created by migrations):
- `chat-media`
- `post-media`
- `business-media`

## Environment variables
From `app/.env.example`:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GITHUB_ISSUES_URL` (optional)
- `EXPO_PUBLIC_SUPPORT_EMAIL` (optional)

## Build / release notes
APK/AAB release requires:
- A unique Android package name in Expo config.
- Signing keystore (or EAS-managed keys).
- `eas.json` (if using EAS Build) and an Expo account linked.

## Status and docs
Start here for up-to-date behavior and limitations:
- `BLIP_SYSTEM_DOCUMENTATION.md`
- `STATUS_REPORT.md`

