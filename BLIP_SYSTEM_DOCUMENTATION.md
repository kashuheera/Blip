# BLIP System Documentation (Runbook + Feature Map)

This document is a “single source of truth” for what BLIP currently does, how each feature is implemented (client + database), what is known-broken/disabled, and how to reproduce/repair issues.

## 1) Repo layout (what to open first)
- `app/App.tsx`: The entire Expo / React Native app (all screens, state, Supabase calls, UI).
- `supabase/migrations/*.sql`: Database schema, RLS policies, triggers, and RPC functions.
- `supabase/functions/analytics-ingest/index.ts`: Edge function for analytics ingest.
- `supabase/functions/moderation-check/index.ts`: Edge function for AI safety checks.
- `supabase/functions/push-send/index.ts`: Edge function for push notifications (FCM/APNs).
- `supabase/scripts/backfill-business-city.mjs`: One-time backfill script for `businesses.city`.
- `STATUS_REPORT.md`: Feature status (Completed / In-Progress / Pending).
- `BLIP_FEATURES_SPEC.md`: Product spec (feature intent and rules).
- `BLIP_AI_RULES.md`: Dev constraints + product decisions.

## 2) Quick "works vs broken" summary (today)

### Works (implemented + expected to function)
- Map-first home with clustering + spiderfy + recenter.
- Map search overlay with scope (rooms/businesses/posts) and text match.
- Feed screen (tabs + search + tags) + create post.
- Stories placeholder card in Feed (UI only).
- Feed actions updated: like + share + reply (business-only) + user profile drilldown + distance badge (coarse location).
- Post engagement: likes (personal) + replies/comments (business-only).
- Orders: pickup + delivery options + KYC-required user details (name/phone/address).
- KYC status badge UI in profile (verified/pending/rejected).
- Auth screen with Personal/Business/Fleet tabs + pending buttons for Magic link/OTP + Google OAuth.
- Room chat with realtime updates + distance gating.
- Business profile (menu, offers, Q&A chat) + chat join gating.
- Business reviews (storage + UI) with ratings + text.
- Orders flow (menu -> cart -> order + order_items).
- Messages (business list + direct threads + direct chat).
- Voice rooms placeholder card in Messages (UI only).
- Profile (identity switch, level/xp, reputation/trust labels, device ID display).
- Billing placeholder screen (no payments).
- Push notifications plumbing (device token capture + test push).
- AI moderation checks for posts + room/business/direct messages.
- Onboarding flow (privacy + interests).
- Help/support + bug reporting.
- Business Admin Portal (staff roles/permissions, staff lookup, audit log, menus/offers/orders).
- Business replies inbox (business-only view of recent post replies + thread jump).
- Blip Admin Portal (feature flags, verification queue, moderation ops).
- Side panel navigation drawer (hamburger menu).
- Account types enforced (personal vs business; business accounts blocked from user screens).
- UI color system applied (brand/reward/categories + map styling).

### Known broken, disabled, or deferred
- Magic link / email OTP auth: deferred. Must-have before rollout with proper domain redirects/deep links (mobile cannot follow `127.0.0.1` links).
- Google OAuth: not implemented.
- Payments/billing: not implemented (billing screen is placeholder only).
- Stories + voice rooms: UI placeholders only (no functional media/voice backend).
- Business admin access requires a business account (owner/staff). Personal-only accounts are blocked from admin controls.
- KYC verification: CNIC/ID upload + verification workflow not implemented yet (badge UI is live).
- Push notifications delivery: requires FCM/APNS keys + redeploy `push-send`.
- Web support: location is disabled on web (mobile-first).
- Advanced search filters: open now/verified/tags are wired for businesses/rooms.
- Analytics + funnels: wired (edge ingest must be deployed with ANALYTICS_SERVICE_ROLE_KEY).
- Chat + post media uploads are wired (requires chat-media/post-media buckets).
- Full gap list / parity wishlist: see section 9.

## 3) How to run the app (local dev)

### Prereqs
- Node.js (LTS recommended)
- Expo tooling (`npx expo` works; the repo uses `expo start`)

### App env vars
Create `app/.env` with:
- `EXPO_PUBLIC_SUPABASE_URL=...`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`
- `EXPO_PUBLIC_GITHUB_ISSUES_URL=...` (optional)
- `EXPO_PUBLIC_SUPPORT_EMAIL=...` (optional)

Notes:
- The app reads these in `app/App.tsx` via `process.env.EXPO_PUBLIC_*`.
- If Supabase vars are missing, the app falls back to demo data for some screens.

### Start
From `c:\Blip\app`:
- `npm install`
- `npm start`

## 4) Database (Supabase) — schema + “why it exists”

### Source of truth
- Primary migration: `supabase/migrations/20260116154710_u2u_features.sql`
- Rate limit + paging/indexes: `supabase/migrations/20260116193000_n1_server_side_rate_limits.sql`
- Scale indexes + posts rate limit: `supabase/migrations/20260118120000_u4_delivery_nfr_scale_posts_rate_limit.sql`
- Fix migration: `supabase/migrations/20260119001000_fix_award_xp.sql`
- Profile avatar migration: `supabase/migrations/20260119002000_add_profile_avatar.sql`
- Profile interests migration: `supabase/migrations/20260119003000_add_profile_interests.sql`
- Post engagement migration: `supabase/migrations/20260119004000_add_post_engagement.sql`
- Follows migration: `supabase/migrations/20260119006000_add_follows.sql`
- Place lists migration: `supabase/migrations/20260119007000_add_place_lists.sql`
- Business reviews migration: `supabase/migrations/20260119008000_add_business_reviews.sql`
- Business reviews (refresh): `supabase/migrations/20260129093000_add_business_reviews.sql`
- Direct messaging presence migration: `supabase/migrations/20260119009000_add_direct_realtime_signals.sql`
- Direct messaging media migration: `supabase/migrations/20260119010000_add_direct_message_media.sql`
- Direct messaging continuity migration: `supabase/migrations/20260119011000_add_direct_chat_continuity.sql`
- Room/business messaging media migration: `supabase/migrations/20260119012000_add_room_business_message_media.sql`
- Chat media storage bucket: `supabase/migrations/20260119013000_add_chat_media_storage.sql`
- Business media storage bucket: `supabase/migrations/20260129100500_add_business_media_storage.sql`
- Business hours exceptions: `supabase/migrations/20260129102500_add_business_hours_exceptions.sql`
- Post media fields: `supabase/migrations/20260129104500_add_post_media.sql`
- Post media storage bucket: `supabase/migrations/20260129104600_add_post_media_storage.sql`
- Business coupons: `supabase/migrations/20260129105000_add_business_coupons.sql`
- Account types + KYC + delivery + post location: `supabase/migrations/20260131093000_account_type_kyc_delivery_posts.sql`
- Business verification workflow: `supabase/migrations/20260120091000_add_business_verification_workflow.sql`
- Analytics events: `supabase/migrations/20260120093000_add_analytics_events.sql`
- Safety + push + reputation + room roles: `supabase/migrations/20260122090000_add_safety_push_reputation.sql`
- Business staff roles/permissions: `supabase/migrations/20260122130000_add_business_staff.sql`
- Business audit log + staff email lookup: `supabase/migrations/20260122153000_add_business_audit_and_staff_lookup.sql`
- Business audit actor handle: `supabase/migrations/20260122154500_add_business_audit_actor_handle.sql`
- Feature flags (Blip Admin Portal): `supabase/migrations/20260122160000_add_feature_flags.sql`
- Business city lookup: `supabase/migrations/20260123113000_add_business_city.sql`

### Core tables (and what they power)
- `profiles`: user profile + moderation flags + XP/level/chat-points state + `avatar_url`, `interests`.
- `user_private`: KYC details (name/phone/address/CNIC) visible to the user and only to businesses for their orders.
- `handle_history`: stores previously-used handles to enforce “no reuse for 3 months”.
- `businesses`: business profiles (owner-managed), location + city, description + hero image, categories/amenities, verification status/notes.
- `business_verification_requests`: owner-submitted verification requests with admin review status.
- `business_messages`: public Q&A messages for a business (optional media fields).
- `business_offers`: offers/announcements for a business.
- `menu_items`: business menu/product list for ordering.
- `orders`: orders placed by users to businesses (pickup-only for now).
- `order_items`: items inside an order.
- `rooms`: local rooms with location + radius.
- `room_messages`: public/local room messages (optional media fields).
- `room_members`: join/leave tracking and basic “presence” counts.
- `room_roles`: room owner/moderator roles for community moderation actions.
- `direct_threads`: chat request objects (pending/accepted/rejected) + metadata.
- `direct_messages`: direct messages with `expires_at` for 1-hour TTL behavior (optional media fields).
- `direct_thread_keeps`: per-user keep-chat settings for DM continuity.
- `direct_presence`: per-thread last-seen timestamps for DM presence.
- `direct_typing`: per-thread typing pings for DM typing indicators.
- `direct_reads`: per-thread read receipts for DM "read" state.
- `blocks`: user-to-user block relationships.
- `reports`: reports for users/content/businesses (admin-visible) + auto-lock trigger.
- `posts`: local feed posts keyed by `area_key`.
- `post_comments`: comments on feed posts.
- `post_reactions`: reactions on feed posts (one per user).
- `post_reposts`: reposts of feed posts.
- `post_bookmarks`: saved posts per user.
- `analytics_events`: event log for funnel analytics (admin-only access).
- `follows`: follow relationships (stores follower + followed handles).
- `place_lists`: user-defined saved-place lists (favorites + collections).
- `place_saves`: saved rooms/businesses mapped to lists.
- `business_reviews`: ratings + written reviews for businesses.
- `business_staff`: staff roles and permission assignments for business admin access.
- `business_audit_log`: immutable audit trail of business admin actions (staff/menu/offers/orders), includes actor handle snapshot.
- `feature_flags`: global feature toggles (admin-only writes, public reads).
- `device_fingerprints`: lightweight device identifiers per user (anti-abuse).
- `device_tokens`: push notification tokens (FCM/APNs).
- `moderation_events`: AI moderation audit log (text/image checks).
- `bug_reports`: in-app bug reports submitted by anyone (admin-visible).
- `appeal_requests`: appeals submitted by locked users (owner + admin-visible).
- Storage bucket: `chat-media` (public) for room/business/DM media uploads.

### DB functions (RPC) used by the app
- `compute_level(xp int) -> int`
  - Purpose: converts XP into a level with doubling thresholds (2,4,8,...).
  - Called from: DB (`award_xp`) and indirectly by the app XP system.
- `award_xp() -> (xp int, level int)`
  - Purpose: increments the signed-in user’s XP and recomputes level.
  - Called from client: `awardXp()` helper in `app/App.tsx`.
  - Note: fixed in `20260119001000_fix_award_xp.sql` (earlier version had OUT-param name ambiguity).
  - Also increments `reputation_score` + `trust_score`.
- `award_reputation(p_delta int) -> (reputation_score int, trust_score int)`
  - Purpose: increments reputation + trust score directly (used for actions that do not award XP).
  - Called from client: `awardReputation()` helper in `app/App.tsx`.
- `lookup_business_staff_by_email(p_business_id uuid, p_email text) -> (user_id uuid, email text, current_handle text)`
  - Purpose: staff invite lookup by email for the business admin dashboard.
  - Called from client: Business admin staff lookup (email -> user ID).
- `consume_chat_point() -> (ok, remaining, max_points, shadowbanned, u2u_locked, notice)`
  - Purpose: implements daily “chat points” economy and penalties that can lead to lock/shadowban.
  - Called from client: `consumeChatPoint()` helper in `app/App.tsx`.
- `accept_chat_request(p_thread_id uuid)` / `reject_chat_request(p_thread_id uuid)`
  - Purpose: lets the recipient accept/reject a pending chat request; acceptance also seeds a first DM that expires in 1 hour.
  - Called from client: Direct chat request handling in `DirectChatScreen`.
- `approve_appeal(p_appeal_id uuid)` / `reject_appeal(p_appeal_id uuid)`
  - Purpose: admin-only moderation actions to resolve an appeal and optionally reset user lock state.
  - Called from client: `ModerationScreen`.
- `assign_room_owner()` (trigger)
  - Purpose: assigns the room creator as `owner` in `room_roles` after room creation.
  - Trigger: `rooms_assign_owner` after insert on `rooms`.

### Server-side rate limiting (DB triggers)
Implemented as `before insert` triggers that raise exceptions like “Slow down…” or “Too many…”.

These protect (at minimum):
- rooms, businesses
- room_messages, business_messages, direct_messages
- business_offers, menu_items
- reports, orders, bug_reports
- posts (10-minute window)

Client-side mirrors exist too (basic timestamp pruning), but the DB triggers are the enforcement layer.

### RLS (Row Level Security) — high-level intent
Most tables have RLS enabled. Policies are designed around:
- Public read for discovery content (rooms/businesses/posts/offers/menus/messages)
- Owner-only write for business objects
- Participant-only read for direct threads/messages
- Admin-only read/update for reports, appeals, bug reports
- Owner-only access for device fingerprints/tokens
- Room roles viewable by members; owner/admin can manage roles
- Moderation events viewable by content owner or admin

## 5) Feature inventory (what it does + how it’s implemented)

The sections below map “product features” to concrete implementation artifacts.

### A) Identity & Accounts

#### A1 — Account creation & login
- What it does: allows users to sign in and persist a session.
- Current implementation (testing): email + password.
  - Client: `AuthScreen` in `app/App.tsx` uses `supabase.auth.signInWithPassword` and `supabase.auth.signUp`.
  - Session handling: `AuthProvider` uses `supabase.auth.getSession()` + `onAuthStateChange`.
- Must-have before rollout (deferred): magic link + email OTP + proper domain redirects/deep links.
  - Why: Supabase email links currently contain `127.0.0.1` redirects which do not work on mobile email clients.
- Common failure modes:
  - “Account created. Check your email to confirm…”: Supabase email confirmations are enabled; user must confirm before session exists.
  - Existing user created via magic link has no password: password sign-in fails until password is set/reset.

#### A2 - Pseudonymous profile
- What it does: provides a lightweight identity (bio + interests + badges + social proof) without real-name social graph.
- Client:
  - Profile loading/creation: `AuthProvider.loadProfile()` selects/creates a `profiles` row after login.
  - Profile editing: `ProfileScreen` (bio + birth year + avatar URL + interests).
  - Badges + social proof: computed on the profile using posts, rooms, orders, and connections.
- DB:
  - `profiles` table stores `birth_year`, `bio`, `avatar_url`, `interests`, plus flags and XP fields.
  - RLS restricts profile reads/writes to the owner.

#### A3 – Rotating handles (5 min rotation; 3-month reuse ban)
- What it does: periodically assigns a new pseudonymous handle and prevents reuse for 3 months.
- Client:
  - `rotateHandleIfNeeded()` checks `handle_updated_at`, generates a new candidate, updates `profiles.current_handle`, inserts into `handle_history`.
- DB:
  - `handle_history` stores per-user handle usage timestamps to enforce the reuse ban.

#### A4 - Dual profiles (personal vs business identity)
- What it does: lets a signed-in user switch between their personal handle and a business identity when posting or commenting.
- Client:
  - `IdentityProvider` persists the active identity in AsyncStorage (`blip.identity.v1`) and resets on sign-out.
  - `ProfileScreen` shows the active identity card + switcher modal; owned businesses load from `businesses.owner_id`.
  - `CreateScreen` and `PostCommentsScreen` use the active identity label as `author_handle`.
- DB:
  - Uses existing `businesses` rows to populate owned identities (no new schema).

### B) Location, Map & Discovery

#### B1 — Map-first home
- What it does: shows nearby rooms + city-scoped businesses on a map (no list).
- Client:
  - `HomeScreen` requests foreground location (mobile only) via `expo-location`.
  - Uses `react-native-maps` for rendering.
  - Loads rooms within ~500m and businesses either by `city` match (when available) or a fallback radius.
- DB:
- `rooms` and `businesses` tables store coordinates; `businesses.city` stores the reverse-geocoded city.
  - Indexes for scale: `rooms_location_idx`, `businesses_location_idx`.

#### B2 — Location privacy (approx area, not precise pin)
- What it does: rounds the user’s coordinates before using them for display and scoping.
- Client:
  - `approxCoords` rounds to `APPROX_DECIMALS` and is used everywhere in UI fetches and `area_key` construction.

#### B3 ? Fixed map radius + room radius rules
- What it does: keeps the map zoomed to ~1km while rooms stay within 500m of the user.
- Client:
  - `MAP_VIEW_RADIUS_METERS` is locked to 1km; map region deltas are clamped on pan.
  - `ROOM_NEARBY_RADIUS_METERS` filters rooms to 500m.

#### B4 ? Map markers + detail sheet
- What it does: renders clustered markers and shows an inline detail sheet on pin tap.
- Client:
  - `visibleRegion` + `clusterEntities()` drive markers.
  - `handleSelectEntity` animates to the pin and opens the in-map sheet (no navigation).

#### B5 – Local feed posts + engagement
- What it does: shows a local posts feed and lets users react, comment, repost, and save.
- Client:
  - `DiscoverScreen` loads posts and renders engagement actions.
  - `PostCommentsScreen` loads and posts comments.
  - `ProfileScreen` shows a saved posts list from bookmarks.
- DB:
  - `post_reactions`, `post_comments`, `post_reposts`, `post_bookmarks` tables with RLS.
  - Engagement counts are computed client-side from per-post rows.

#### B6 ? Search + filters (rooms/businesses/posts)
- What it does: searches map entities and posts; filters map results by text + tags.
- Client:
  - `HomeScreen` search bar filters map entities by text + tags in the visible region.
  - `DiscoverScreen` search bar filters posts by text + author handle.
- DB:
  - Uses existing `rooms`/`businesses` fields (`category`, `categories`, `amenities`, `flags`, `verified`); no new schema.

#### B7 – Saved places + lists
- What it does: lets users save rooms/businesses into Favorites or custom lists.
- Client:
  - `PlaceSaveModal` lets users pick a list or create a new one from detail/business views.
  - `ProfileScreen` shows saved places grouped by list and supports opening/removing items.
- DB:
  - `place_lists` and `place_saves` tables with owner-only write and optional shareable read (no UI toggle yet).


#### B8 - Map polish (bottom sheets + radius UI + saved pins)
- What it does: adds map UI polish for quick previews and spatial context.
- Client:
  - `HomeScreen` shows a bottom sheet preview on marker tap.
  - Radius ring + overlay label for active radius.
  - Saved pins are highlighted using `place_saves`.
- DB:
  - Uses existing `place_saves` rows for saved pin highlighting.


#### B9 - Discovery ranking (feed)
- What it does: ranks local feed posts by trending or for-you signals.
- Client:
  - `DiscoverScreen` supports sort modes: Trending, For you, Newest.
  - For-you boosts followed authors and interest keyword matches.
- DB:
  - Uses existing engagement tables for counts; ranking is client-side for now.

#### S1 – Following / friends system
- What it does: lets users follow each other; mutual follows are treated as friends.
- Client:
  - `DiscoverScreen` follow/unfollow button on posts.
  - `ProfileScreen` shows followers, following, mutuals, and friend activity.
- DB:
  - `follows` stores follower/followed ids and their current handles.
  - Handle rotations update `follows` so lists stay fresh.

### C) Rooms & Messaging (Public)

#### C1 — Local rooms geo-locked (radius check)
- What it does: rooms have a radius; users outside radius are shown “outside radius” UI and blocked from sending.
- Client:
  - `RoomScreen` computes `isWithinRadius` and blocks sending when outside.
- DB:
  - `rooms.radius_meters` defines the allowed radius.

#### C2 — Room lifecycle / expiry rules
- What it does: rooms persist; direct user chats are ephemeral.
- Client + DB:
  - Room messages persist in `room_messages`.
  - Direct messages use `expires_at` and are filtered out client-side (`.gt('expires_at', now)`).

#### C3 — Create room
- Client:
  - `CreateRoomScreen` inserts into `rooms` and navigates into the room.
- DB:
  - `rooms` insert is rate-limited by a trigger (2 rooms / 10 minutes per user).

#### C4 — Join/leave + presence (non-realtime count)
- Client:
  - `RoomScreen` inserts/deletes `room_members` rows to represent membership.
  - Presence count is derived from `room_members` (no realtime subscriptions).
- DB:
  - `room_members` table stores `(room_id, user_id)` membership and timestamps.

#### C5 — Room messaging
- Client:
  - `RoomScreen` inserts into `room_messages`.
  - Uses both client-side throttling and DB triggers.
- DB:
  - `room_messages` is public-readable; inserts rate-limited.
  - Media uploads are stored in `media_type`, `media_url`, `media_meta`.

#### C6 — Direct messaging presence (online/typing/read receipts)
- What it does: shows online state, typing indicator, and read receipts in DMs.
- Client:
  - `DirectChatScreen` upserts `direct_presence`, `direct_typing`, and `direct_reads`.
  - Uses Supabase realtime subscriptions to update presence/typing/read state.
  - Presence pings every 30 seconds; typing pings are throttled.
- DB:
  - `direct_presence`, `direct_typing`, `direct_reads` tables with participant-only RLS.

#### C7 — Direct messaging media (image/GIF/video/voice/location)
- What it does: lets users upload media to DMs after 10 messages (room/business chats also support uploads).
- Client:
  - `DirectChatScreen` uploads attachments to Supabase Storage and renders previews.
  - Media uses public storage URLs (no signed URLs yet; DM media is obscured but not private).
- DB:
  - `direct_messages.media_type`, `media_url`, `media_meta` store attachment metadata.

#### C8 — Chat continuity controls (mutual opt-in)
- What it does: lets both DM participants opt in to keep chat history beyond the 1-hour TTL.
- Client:
  - `DirectChatScreen` shows a continuity card and lets each user opt in/out.
  - When both opt in, the chat shows full history (TTL filtering is bypassed).
- DB:
  - `direct_thread_keeps` stores per-user keep preferences with participant-only RLS.

### D) Businesses & Ordering (Pickup-only)

#### D1 — Business listings + owner-only edits
- What it does: users can create a business listing; only the owner can edit it.
- Client:
  - `CreateBusinessScreen` inserts into `businesses`.
  - `BusinessEditScreen` updates `businesses` fields.
  - `BusinessScreen` shows a demo analytics summary (views, chat volume, saves, orders).
  - `BusinessAdminScreen` uploads hero/logo images to `business-media` storage and updates `image_url` + `logo_url`.
  - `BusinessAdminScreen` manages holiday/temporary closures via `business_hours_exceptions`.
- DB:
  - `businesses.owner_id` controls edit permissions via RLS.
  - Metadata fields: `businesses.categories`, `businesses.amenities`.

#### D2 — Business verification workflow
- What it does: owners submit a verification request; admins approve or reject.
- Client:
  - `BusinessScreen` submits verification requests.
  - `ModerationScreen` reviews requests and approves/rejects.
- DB:
  - `business_verification_requests` stores submissions (status + notes + evidence URL).
  - `businesses.verification_status` + `businesses.verified` drive the badge.
  - RPC: `review_business_verification` updates both request + business status.

#### D3 — Business room (public Q&A)
- What it does: users can post questions/messages on a business profile.
- Client:
  - `BusinessScreen` inserts into `business_messages`.
  - Business page includes a Chat tab plus a preview modal before joining.
  - Chat access is disabled for flagged/shadowbanned users (no preview/join CTA).
  - FAQ + quick reply presets are shown for common questions (demo-only, not persisted).
- DB:
  - `business_messages` public-readable; inserts rate-limited.
  - Media uploads are stored in `media_type`, `media_url`, `media_meta`.
- Ops note:
  - Business rooms are moderated by Blip management until a business claim is approved.

#### D4 — Offers / announcements
- Client:
  - `BusinessScreen` and/or `BusinessEditScreen` create and list `business_offers`.
- DB:
  - RLS: viewable by anyone, editable by owner; inserts rate-limited.

#### D5 — Menus / product list
- Client:
  - `BusinessScreen` lists `menu_items`.
  - `BusinessEditScreen` can add/update items.
  - Grocery businesses surface menu availability as in-stock/out-of-stock.
- DB:
  - RLS: viewable by anyone, insert/update by owner; inserts rate-limited.

#### D6 — Integrated ordering (no payments, pickup-only)
- What it does: lets a user place an order (with line items) and the business owner view it.
- Client:
  - `OrderScreen` inserts into `orders` + `order_items`.
  - `OrdersScreen` shows the user’s orders.
  - `BusinessScreen` shows business-side orders.
  - Orders show an in-app receipt summary after submission.
  - Order submission can trigger push notifications (requires `push-send` keys).
  - Email/SMS receipts are pending (provider selection deferred).
- DB:
  - RLS: orders visible by buyer or business owner; items share similar rules.
  - Inserts are rate-limited.
- Known limitations:
  - No payment processor integration.
  - Delivery is handled by businesses outside the app; delivery fields exist in DB but are not active in the UI.

#### D7 — Business reviews + ratings
- What it does: lets users rate and review businesses, with optional photo URLs and reportable reviews.
- Client:
  - `BusinessScreen` lists reviews and supports create/update/remove.
  - Reviews can be reported via the existing report flow (`target_type = review`).
- DB:
  - `business_reviews` stores rating, body, photo URL.
  - RLS: public read, owner/admin update/delete.

### E) Safety, Moderation, Anti-spam

#### E1 — Block user
- What it does: prevents interaction with specific users.
- Client:
  - `blocks` are checked in DMs and interactions to prevent messaging.
- DB:
  - `blocks` has unique `(blocker_id, blocked_id)` and RLS to restrict to blocker.

#### E2 — Report content/user/business
- What it does: users can submit reports for admin review.
- Client:
  - `ReportScreen` inserts into `reports`.
- DB:
  - Trigger: `reports` insert can auto-lock a reported user (`u2u_locked`) when target is a user.
  - RLS: insertable by authed, viewable/updatable by admins.

#### E3 — Rate limiting & anti-spam
- What it does: throttles spam across content creation.
- Client:
  - Local rate limiting helper (`getRateLimitError` + timestamp pruning) for fast feedback.
- DB:
  - Enforcement triggers raise user-facing errors (“Slow down…”, “Too many…”).
  - Posts also have a 10-minute-window limit.

#### E4 — Moderation tooling (in-app admin console)
- What it does: allows admins to review reports, bug reports, and appeals and take action.
- Client:
  - `ModerationScreen` is the in-app console (not a separate web portal).
- DB:
  - Admin is determined by `profiles.is_admin`.
  - Admin RPC: `approve_appeal`, `reject_appeal` (security definer).
- Known limitation:
  - There is no UI to grant admin; it must be set in DB.

#### E5 - AI-assisted safety checks
- What it does: blocks unsafe text content before saving.
- Client:
  - `runModerationCheck()` helper in `app/App.tsx`.
  - Currently called from Create (posts), Room chat, Business chat, Direct chat.
- Edge:
  - `supabase/functions/moderation-check` (OpenAI Moderation API).
- DB:
  - `moderation_events` stores audit rows (status + categories).

#### E6 — Reputation + trust score
- What it does: maintains a per-user reputation + trust score that increments with actions.
- Client:
  - `awardReputation()` for room/business messages.
  - XP-granting actions call `award_xp()` which also increments reputation/trust.
- DB:
  - `profiles.reputation_score`, `profiles.trust_score`.
  - RPC: `award_reputation(p_delta int)`.

#### E7 - Community moderation roles (rooms)
- What it does: allows room owners to grant/remove moderator roles.
- Client:
  - Room header shows a Moderator badge for owners/admins.
- DB:
  - `room_roles` table; `assign_room_owner` trigger assigns room creator as owner.

#### E8 - Safer onboarding (phone verification + device fingerprinting)
- What it does: adds optional phone verification and lightweight device ID tracking.
- Client:
  - Profile shows a Phone verification CTA (OTP flow to be wired).
  - Device ID is generated locally and stored in AsyncStorage, then upserted to DB after login.
- DB:
  - `device_fingerprints` stores device IDs linked to user accounts.

### F) Monetization (placeholders)
- Business subscriptions: UI placeholder only; no billing/gating.
- Appeals “payment choice”: UI/DB capture only; no provider wired.

### U) User Systems

#### U1 — XP + leveling
- What it does: increments XP for “real actions” and shows a level badge.
- Client:
  - Calls `award_xp()` RPC after eligible actions.
  - Review submissions award XP once (first review only).
- DB:
  - `profiles.xp`, `profiles.level` updated by `award_xp()`.
  - `compute_level()` enforces doubling thresholds.

#### U2 — Chat requests + chat points + lockouts
- What it does: restricts unsolicited DMs via a request/accept flow and daily points.
- Client:
  - Uses `direct_threads` for requests and `direct_messages` for accepted threads.
  - Calls `consume_chat_point()` before sending a request.
- DB:
  - `consume_chat_point()` tracks daily points and penalties; can escalate to lock/shadowban.
  - Acceptance seeds the first message and sets `expires_at = now() + 1 hour`.

#### U3 — Appeals (manual review)
- What it does: lets locked users submit an appeal; admins approve/reject.
- Client:
  - `AppealScreen` inserts into `appeal_requests`.
  - `ModerationScreen` calls approve/reject RPC.
- DB:
  - `appeal_requests` table stores appeal state.

### N) Scale / Performance

#### N1 — Server-side rate limiting + paging support
- What it does: adds DB indexes for paged queries and server-side write throttles.
- DB:
  - Adds composite indexes on message tables and created_at orderings.
  - Trigger-based rate limiting described above.

#### NFR-Scale — 10k concurrent hardening (in progress)
- Status: in progress; partial work is indexes and server-side throttles.
- Current hardening present:
  - Location indexes for bounding-box queries.
  - Direct thread/message indexes for pagination.
  - Posts index for profile filtering and feed.

#### Load test baseline (2026-01-27)
- Tool: `supabase/scripts/load-test.mjs` against REST endpoints with anon key.
- Read-only (map businesses + rooms + feed posts):
  - 500 concurrent / 30s: p95 ~0.85s, ~0% errors.
  - 800 concurrent / 45s: p95 ~2.3–2.5s, 0% errors (p99 up to ~9s).
  - 1000 concurrent / 45s: ~11% errors, p95 ~3.2s.
- Mixed (80% reads / 20% writes to `bug_reports` only):
  - 500 concurrent / 45s: p95 ~1.0s, 0% errors.
  - 800 concurrent / 45s: p95 ~1.7s, ~0.01% errors.
  - 1000 concurrent / 45s: ~9% errors, p95 ~9–14s.
- Note: auth-required writes (posts/chat) are not exercised unless `LOAD_TEST_EMAIL` +
  `LOAD_TEST_PASSWORD` are provided; this mixed run uses public bug report inserts only.

### UX) UI polish

#### POL0 - Empty states + skeleton loaders
- What it does: shows loading placeholders to avoid blank screens.
- Client: `ListSkeleton`, `CardSkeletonList`, `FeedSkeleton` in `app/App.tsx` for Home, Discover, Messages, Orders.

#### POL2 - Onboarding tutorial + first-run setup
- What it does: first-run walkthrough (permissions, privacy, rooms).
- Client: `OnboardingModal` in `app/App.tsx`; stored under `blip.onboarding.v1` in AsyncStorage.

#### POL3 - Micro-interactions (pressed feedback)
- What it does: adds pressed feedback on primary actions.
- Client: `pressablePressed` style in `app/App.tsx` applied to primary `Pressable` buttons.

#### POL4 - Analytics + funnels
- What it does: tracks key funnel events and surfaces a 7-day snapshot for admins.
- Client:
  - `trackAnalyticsEvent()` queues events in AsyncStorage (`blip.analytics.queue.v1`) before login.
  - Events flush after sign-in using `supabase/functions/analytics-ingest`.
  - Screen views and core actions are tracked in `app/App.tsx`.
- Edge:
  - `supabase/functions/analytics-ingest/index.ts` validates event names and writes with service role.
- DB:
  - `analytics_events` table with admin-only read policy.
- Status:
  - Requires `ANALYTICS_SERVICE_ROLE_KEY` secret + deployed function.

#### POL5 - Help/support center
- What it does: in-app FAQ + contact support link.
- Client: `HelpScreen` in `app/App.tsx` using `EXPO_PUBLIC_SUPPORT_EMAIL`.

#### POL6 - Push notifications
- What it does: registers push tokens and can trigger a test notification.
- Client:
  - `registerForPushAsync()` captures a device token (native or Expo fallback).
  - Profile screen shows token/status and includes a "Send test push" button.
- Edge:
  - `supabase/functions/push-send` (FCM/APNs) required for real delivery.
- DB:
  - `device_tokens` stores per-device push tokens.
- Status:
  - Delivery requires FCM/APNS keys + redeploy `push-send`.

## 6) Troubleshooting / “how to recreate when it breaks”

### App shows demo data / nothing loads
Checklist:
- Confirm `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set in `app/.env`.
- Confirm network connectivity.
- Confirm Supabase project is reachable.

### Onboarding does not re-appear
Cause:
- Onboarding is shown once and stored in AsyncStorage.
Fix:
- Clear the AsyncStorage key `blip.onboarding.v1` to show onboarding again.

### Auth can’t sign in
Common causes:
- Email confirmation required: user must confirm before session exists.
- Existing user has no password (created via magic link): requires password reset/set flow.
Rollout requirement:
- Add proper deep links + domain so magic links / OTP can complete on mobile.

### Feed is empty
Expected if:
- No posts exist for the current `area_key` (rounded location bucket).
Debug:
- In Supabase, check `posts.area_key` values and whether the user’s `area_key` matches.

### “Slow down…” / “Too many…”
Cause:
- DB rate limit triggers are blocking inserts.
Fix:
- Wait for the window to reset, or adjust the relevant trigger function thresholds in migrations (future change).

### Moderation screen doesn’t show anything
Cause:
- User is not an admin (`profiles.is_admin` false), or there are no rows to show.
Fix:
- Set `profiles.is_admin = true` for your user in Supabase to enable admin-only policies.

### Analytics snapshot is empty
Cause:
- Edge function not deployed, or `ANALYTICS_SERVICE_ROLE_KEY` secret missing.
- Admin is not signed in (analytics are admin-only).
Fix:
- Deploy `analytics-ingest` and set `ANALYTICS_SERVICE_ROLE_KEY`.
- Sign in as an admin and generate events (screen views, posts, messages).

## 7) DB migration operations (how to re-apply DB changes)

This repo includes a local wrapper:
- `c:\\Blip\\supabase.cmd`

Usage:
- `cd c:\\Blip`
- `.\supabase.cmd db push`

If `supabase.cmd` says the CLI is missing:
- Install app deps first: `cd app && npm install`

### Edge functions (analytics ingest)
- Deploy: `supabase functions deploy analytics-ingest`
- Secrets: `supabase secrets set ANALYTICS_SERVICE_ROLE_KEY=...`
- Notes: events are queued locally before sign-in and flushed after auth.

### Edge functions (moderation checks)
- Deploy: `supabase functions deploy moderation-check`
- Secrets:
  - `supabase secrets set OPENAI_API_KEY=...`
  - `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` (or reuse `ANALYTICS_SERVICE_ROLE_KEY`)
- Notes: called by the app before saving posts/comments/messages/reviews/orders.

### Edge functions (push notifications)
- Deploy: `supabase functions deploy push-send`
- Secrets:
  - `supabase secrets set FCM_SERVER_KEY=...`
  - `supabase secrets set APNS_KEY=... APNS_KEY_ID=... APNS_TEAM_ID=... APNS_BUNDLE_ID=...`
  - `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` (or reuse `ANALYTICS_SERVICE_ROLE_KEY`)
- Notes: requires native push credentials and device tokens captured in `device_tokens`.

## 8) Security audit (npm)

Last audit summary:
- Command: `npm.cmd audit` (2026-01-22)
- Result: 0 vulnerabilities (info/low/moderate/high/critical)
- Dependency counts: total 839
- Remediation applied: restored `supabase` dev dependency to `^2.72.8` and pinned `tar` via `overrides`.
- Change made: added `overrides.tar = 7.5.6` in `app/package.json`.
- Removed: none.

## 9) Feature gaps (must-have + parity wishlist)

This section lists missing features (not implemented yet) so you can track rollout blockers and avoid losing requirements over time.

### Must-have gaps (block rollout / scale)
- Magic link / email OTP deep-link auth (explicitly deferred)
  - Function: passwordless sign-in that works from mobile email clients.
  - Status: deferred (current dev auth is email+password).
  - Why blocked: Supabase links redirect to `127.0.0.1` which points to the phone itself, not your dev machine.
  - Needed to implement: real domain + correct Supabase redirect URLs + deep-link handling (iOS universal links / Android intent filters) + in-app session exchange.
- Google OAuth (explicitly not implemented)
  - Function: 1-tap login via Google.
  - Status: not implemented.
  - Needed to implement: Google OAuth app + Supabase provider config + `signInWithOAuth` UI + redirect/deep-link handling.
- Payments / billing (explicitly not implemented; subscriptions are placeholders)
  - Function: collect payments for subscriptions/tiers, payouts, and/or appeals.
  - Status: not implemented (UI placeholders exist, no gating or provider).
  - Needed to implement: payment provider (e.g., Stripe) + server-side verification/webhooks + DB tables for entitlements + client gating.
- Web support parity (location disabled on web; mobile-first only)
  - Function: allow feature-complete web usage (map/feed/rooms/businesses).
  - Status: not supported; web path disables location flows.
  - Needed to implement: web location permissions + alternate UX for map/geo + responsive layouts.

### Social features missing (vs Reddit/IG/Snap/BeReal/Discord)
- Creator-style features: stories/ephemeral post format, highlights, pinned posts (UI placeholder in Feed only).

### Messaging & community missing (vs Discord/Snap/Bumble)
- Voice rooms / voice channels (Discord-style) (UI placeholder in Messages only).

### Local + map experience missing (vs Google Maps/Snap Map)
- None currently tracked; core map polish and business metadata are implemented.

### Safety & moderation missing (beyond current block/report/admin console/appeals)
- None currently tracked beyond future enhancements.

### Product polish missing (to feel finished)
- None currently tracked.













