# BLIP Status Report

## Completed
- A1 Account creation & login (email + password) (temporary for testing)
- Auth UI tabs (personal/business/fleet) + pending login options (magic link/OAuth UI only)
- Map-first Home (map + clustering + spiderfy + recenter)
- Map search overlay with scope (rooms/businesses/posts)
- Search filters (open now, verified, tags)
- Feed screen (tabs, search, tags) + post creation
- Feed actions (share) + user profile drilldown + distance badge (UI)
- Post engagement: likes (personal accounts) + replies (business accounts)
- Room chat (realtime) + distance gating
- Business profile (hero, menu, offers, Q&A chat)
- Business chat join gating (blocked for shadowbanned/u2u-locked)
- Business reviews (storage + UI, rating + text)
- Business media uploads (hero/logo via storage; requires `business-media` bucket)
- Orders flow (menu -> cart -> order + order_items)
- Messages (business list + direct threads + direct chat)
- Profile (identity switch, level/xp, reputation/trust, device ID)
- Billing screen placeholder (no payments)
- Push notifications plumbing (device token capture + test push)
- AI moderation checks for posts + room/business/direct messages
- Analytics + funnels (edge ingest wired; screen views + core actions)
- Chat media uploads (rooms/business/direct via chat-media bucket)
- Business hours exceptions (holiday/temporary closures)
- Post media uploads (image attachments via post-media bucket)
- Customer loyalty / coupon codes
- Onboarding flow (privacy + interests)
- Help/support + bug reporting
- Feed stories placeholder (UI only, coming soon)
- Voice rooms placeholder (UI only, coming soon)
- Business Admin Portal (staff roles/permissions, staff lookup, audit log, menus/offers/orders)
- Business replies inbox (business-only, recent post replies + thread jump)
- UI color system applied (brand/reward/categories + map styling)
- Web parity placeholder polish (info-only)
- Blip Admin Portal (feature flags, verification queue, moderation ops)
- Side panel navigation drawer
- Business admin access gating (business accounts only)
- Account type enforcement (personal vs business, UI + RLS)
- KYC capture (name/phone/address) + delivery vs pickup order options
- KYC status badge UI (profile)
- KYC document upload placeholders (UI only)

## In-Progress
- Push notifications: set FCM/APNS keys + redeploy `push-send`

## Pending
- MUST-HAVE before rollout: magic link + email OTP deep-link auth (explicitly deferred)
- MUST-HAVE before rollout: Google OAuth (explicitly not implemented)
- MUST-HAVE before rollout: payments / billing (provider planned: Safepay; subscriptions are placeholders)
- MUST-HAVE before rollout: web support parity (location disabled on web; mobile-first only)
- Order notifications + receipts (provider chosen: SendGrid email + SMS4Connect SMS; integration pending)
- KYC ID upload + verification workflow (backend pending)
- A4 Invite-only tiers / access (disabled; open signup per decision)
- F1 Paid tiers (users) (disabled; no tiers for now)
- F3 Paid invites (disabled; no invite system)

## Upcoming
- Social: creator-style features (stories/ephemeral posts, highlights, pinned posts) (UI placeholder only)
- Messaging: voice rooms / voice channels (Discord-style) (UI placeholder only)
