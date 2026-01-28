# BLIP Status Report

## Completed
- A1 Account creation & login (email + password) (temporary for testing)
- A2 Pseudonymous profile (handle + bio + birth year input + avatar URL)
- Social: profile richness (interests + badges + social proof)
- U6 Dual profiles (personal + business identity)
- Social: post engagement (likes/reactions/comments/repost/bookmarks)
- Saved posts list (Profile)
- Social: following / friends system (follow, mutuals, friend activity)
- A3 Rotating handles (5-minute rotation, 3-month reuse ban)
- B1 Map-first home (map + list)
- B2 Location fuzzing / privacy (approximate area)
- B3 Dynamic radius rules (client-side based on density)
- B4 Nearby discovery feed (map + list sync)
- Local/map: search + filters (rooms/businesses/posts; open now, distance, tags, verified)
- Local/map: save places / lists (favorites, collections; shareable flag stub)
- Local/map: business reviews & ratings (ratings, photos, review moderation)
- Local/map: business metadata (categories, amenities)
- Local/map: map polish (radius UI, bottom sheets, saved pins)
- C1 Local rooms geo-locked (radius check)
- C2 Room lifecycle / expiry (direct chats expire after 1 hour; rooms/business persist)
- C3 Create room
- C4 Join/leave + presence (non-realtime count)
- C5 Messaging (room + business + direct)
- Messaging: real-time presence (DMs: online, typing, read receipts)
- Messaging: media in chat (DMs + room/business uploads via public storage bucket)
- Messaging: chat continuity controls (mutual opt-in keeps DMs)
- D1 Business listings + profile persistence + owner-only edits
- D2 Business verification workflow (requests + admin review)
- D3 Business room (public Q&A)
- D4 Offers / announcements
- D5 Menus / product list
- D6 Integrated ordering (no payments)
- Business chatroom tabs + preview modal (restricted for flagged users)
- Business analytics summary panel (views, chat volume, saves, orders)
- Grocery inventory visibility (in-stock/out-of-stock via menu availability)
- Business FAQ + quick reply auto-responses (demo)
- E1 Block user
- E2 Report content/user/business
- E3 Rate limiting & anti-spam (server-side DB triggers + client-side checks)
- E4 Moderation tooling (basic admin console)
- Safety: AI-assisted moderation (text + image checks via edge function)
- Safety: community moderation roles (room owners/mods)
- Safety: safer onboarding (phone verification + device fingerprinting)
- Safety: reputation + trust score (profile fields + award RPC)
- F2 Business subscriptions (UI placeholder only; no billing/gating)
- Demo dashboard (feature checklist + quick checks) (to be replaced by BLIP RoadMap screen)
- UI chrome (persistent header + side pane + bottom tabs)
- Dark mode + theme preference (system/light/dark)
- Polish: empty states + skeleton loaders
- Polish: onboarding tutorial + first-run setup (permissions, privacy, rooms)
- Polish: help/support center (help articles + contact support flow)
- Polish: micro-interactions
- Polish: analytics + funnels (edge ingest + pre-login queue + admin snapshot)
- Polish: push notifications (chat/orders/room activity)
- Bug reporting (Supabase log + GitHub issue link)
- Feed screen (Discover -> Feed) + post creation
- Discovery ranking (feed: trending + for-you + newest)
- Profile Level badge (XP progress)
- BLIP RoadMap screen (replaces Demo dashboard)
- U1 User XP + leveling system (1 XP per real interaction/action; level thresholds double: 2, 4, 8, ...)
- U2 Chat requests + acceptance system (daily chat points; penalties; shadowban flagging)
- U3 Appeals (manual + in-app payment choice; no payment provider wired yet)
- U5 Reviews + business interaction XP (review submissions award XP)
- N1 Server-side rate limiting + paging (pagination + indexes; DB triggers)
- Posts rate limiting (server-side DB trigger)
- NFR-Scale baseline load testing (read-only + mixed public writes) documented
- Business Admin Portal dashboard (staff roles/permissions, menus/offers/orders management, staff email lookup, audit log)
- Blip Admin Portal dashboard (feature flags, verification queue, moderation ops)

## In-Progress
- NFR-Scale: handle 10,000 concurrent active users (indexes, load shedding, rate limiting)

## Pending
- MUST-HAVE before rollout: magic link + email OTP deep-link auth (explicitly deferred)
- MUST-HAVE before rollout: Google OAuth (explicitly not implemented)
- MUST-HAVE before rollout: payments / billing (explicitly not implemented; subscriptions are placeholders)
- MUST-HAVE before rollout: web support parity (location disabled on web; mobile-first only)
- A4 Invite-only tiers / access (disabled; open signup per decision)
- F1 Paid tiers (users) (disabled; no tiers for now)
- F3 Paid invites (disabled; no invite system)
- Business media uploads (hero/logo) instead of URL-only
- Order status notifications + receipts (email/SMS/push)
- Business hours exceptions (holiday/temporary closures)
- Customer loyalty / coupon codes

## Upcoming
- Social: creator-style features (stories/ephemeral posts, highlights, pinned posts)
- Messaging: voice rooms / voice channels (Discord-style)
