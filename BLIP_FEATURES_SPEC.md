# BLIP Feature Spec (Agent-Ready)

This spec is a direct conversion of the provided catalog. Anything not already part of the vision remains labeled Proposed.

## MVP Stance (Confirmed)
- MVP includes businesses: Yes
- MVP includes rotating handles: Yes
- MVP includes ephemeral message expiry: Yes

## Product Decisions (Locked)
- Auth (testing): email + password (to unblock dev logins).
- Auth (must-have before rollout): email magic link + email OTP with proper domain redirects / deep links (no 127.0.0.1 links).
- Handle rotation: every 5 minutes; never reuse a handle within 3 months.
- Handle generation: use birth year only to choose the wordlist (Gen Z vs general); do not store full DOB or expose it publicly.
- Gen Z cohort definition: birth years 1997-2012 (adjustable).
- Message retention: user-to-user chats expire after 1 hour; room messages do not expire; business chats do not expire.
- Access: open signup; no invite-only or waitlist in MVP.
- Tiers: not included for now.
- Ordering: included (no payments in MVP; pickup only in app; delivery handled by businesses outside BLIP).
- Safer onboarding: Supabase phone OTP + in-house device ID (lightweight device fingerprint).
- AI safety: use Moderation API for text + media checks (edge function).
- Push notifications: native FCM/APNs via edge function + device tokens.

## Implementation snapshot (2026-01-29)
- Implemented: map-first Home with clustering + spiderfy + recenter; search overlay with scope; Feed + Create Post.
- Implemented: Room chat with distance gating; Business profile (menu/offers/Q&A); Reviews storage + UI.
- Implemented: Orders cart flow + `order_items`; Messages (business list + direct threads + direct chat).
- Implemented: Profile identity switch + reputation/trust labels + device ID display; billing placeholder.
- Implemented: AI safety checks for posts + room/business/direct messages.
- Implemented: Push plumbing (device tokens + test push), but delivery requires FCM/APNS keys.
- Admin: Business Admin Portal + Blip Admin Portal in-app screens.
- Implemented: UI placeholders for Stories (Feed) + Voice rooms (Messages).
- Not implemented yet: magic link/OTP, Google OAuth, payments, stories/highlights/pinned, voice rooms.

## Scope Tags
- MVP: required for the first release
- V1: next iteration after MVP
- Proposed: explicitly not committed yet

---

# Part 1 - Product Definition

## 1) One-liner
BLIP is a map-first, location-based, pseudonymous social layer + local business layer, designed to enable nearby discovery and local utility without follower culture or precise tracking.

## 2) Core pillars (must remain true)
1. Pseudonymous by default (no real-name social graph)
2. Map-first discovery (local radius-based visibility)
3. Ephemeral / low-permanence for direct user chats (rooms and business chats persist for now)
4. Anti-clout mechanics (no public follower counts/leaderboards; counts are private)
5. Local commerce is native (business rooms + listings, with radius limits)

## 3) Key constraints
- No precise user pin shown publicly; location must be fuzzed or bucketed
- Visibility is radius-based and can be dynamic
- Handles rotate to prevent persistent identity tracking

---

# Part 2 - Feature Catalog (Agent-Ready)

## A) Identity & Accounts

### A1. Account creation & login
- Scope: MVP
- What: Sign up / login via email + password (testing), basic account record.
- Must-have before rollout: email magic link + email OTP auth with proper domain redirects / deep links (so mobile can complete login flows).
- Rules:
  - Minimal PII
  - Birth year is collected only to derive an age cohort for handle generation
  - User can exist without public profile details
- Edge cases:
  - Account exists without any public profile fields set
  - User logs in with only email enabled
- Acceptance:
  - User can create an account, log in, and reach the map

### A2. Pseudonymous profile
- Scope: MVP
- What: A public identity shell that is not real-name based.
- Fields (suggested):
  - Current handle (active)
  - Optional avatar
  - Optional bio (short)
  - Interests (tag list)
  - Earned badges (beyond XP level)
  - Social proof stats (posts, rooms, connections)
- Rules:
  - No public follower leaderboard; follower/following counts live on the user's own profile
  - No public likes metric visible
- Edge cases:
  - Profile renders with only a handle and no optional fields
- Acceptance:
  - Profile exists and displays without revealing real identity
  - Interests, badges, and social proof render on the profile

### A3. Rotating handles
- Scope: MVP (confirmed)
- What: User handle changes on a fixed time interval.
- Rules:
  - Rotate every 5 minutes
  - Never reuse a handle within 3 months
  - Wordlist is chosen by birth-year cohort (Gen Z vs general)
  - Gen Z cohort is birth years 1997-2012 (adjustable)
  - Old handles not publicly searchable
- Edge cases:
  - Handle rotates while user is active in a room
  - Old handle lookup fails after rotation
  - If DOB is missing, fall back to the general wordlist
- Acceptance:
  - Handle changes occur automatically; old handle no longer resolves publicly

### A4. Dual profiles (personal vs business identity)
- Scope: V1 (implemented)
- What: Let business owners post/comment as their business identity or as their personal handle.
- Rules:
  - Only the account owner can switch into a business identity tied to their `businesses.owner_id`.
  - Personal identity uses the rotating handle; business identity uses the business name.
  - Identity switching is local to the device and resets on sign-out.
- Edge cases:
  - No owned businesses available (personal-only identity).
  - Personal handle rotates while the user is in business mode (personal label should update on next switch).
- Acceptance:
  - User can switch identity from the Profile screen.
  - Posts/comments show the active identity label.

### A5. Invite-only tiers / access
- Scope: V1
- What: Optional gating or tiering in the future; MVP is open signup.
- Rules:
  - No invite or waitlist in MVP
  - If enabled later, invites can be limited per user
  - Tiers can define visibility radius / features
- Edge cases:
  - Invalid or expired invite code (only when enabled)
- Acceptance:
  - MVP allows anyone to create an account
  - Invite code required only when feature is enabled; tier attached to user

---

## B) Location, Map & Discovery

### B1. Map-first home
- Scope: MVP
- What: Primary view is a map showing nearby entities: rooms + businesses + (optional) people presence markers.
- Rules:
  - No exact user coordinates shown to others
- Edge cases:
  - No entities within radius (empty state)
- Acceptance:
  - User sees nearby entities within a configured radius

### B2. Location fuzzing / privacy layer
- Scope: MVP
- What: Prevents exact pinpointing of users.
- Mechanisms (choose one or combine):
  - Grid/bucket location (geohash, cells)
  - Random jitter + minimum distance
  - Area objects (neighborhood zones)
- Rules:
  - Must be consistent enough for utility, but not precise enough to track
- Edge cases:
  - Two users in the same area still cannot derive each other's exact coordinates
- Acceptance:
  - Two users cannot derive exact coordinates of each other from UI or API responses

### B3. Dynamic radius rules
- Scope: V1
- What: Radius can adjust based on density, tier, room type, or safety mode.
- Rules:
  - Lower radius in dense areas
  - Higher radius in sparse areas
  - Business radius defaults separate from social radius
- Edge cases:
  - Radius changes without a client update (server truth wins)
- Acceptance:
  - Radius changes correctly under defined conditions; UI communicates scope (e.g., "within 2km")

### B4. Nearby discovery feed (map + list)
- Scope: MVP
- What: A list view of what is nearby (sorted by distance/relevance).
- Rules:
  - Only show entities inside visibility rules
- Edge cases:
  - Pagination when many entities exist in dense areas
- Acceptance:
  - List matches map contents; pagination works

### B5. Search + filters (rooms/businesses/posts)
- Scope: V1
- What: Search rooms, businesses, and posts; filter map results by status, distance, and tags.
- Rules:
  - Text search matches name/category/tags.
  - Open now and verified filters apply to businesses.
  - Distance filter limits results within the selected radius.
- Edge cases:
  - No results after applying filters.
- Acceptance:
  - Search and filters refine map/list results and feed posts correctly.

### B6. Save places / lists
- Scope: V1
- What: Users save rooms/businesses into Favorites or custom collections.
- Rules:
  - Saves are private by default; lists can be marked shareable later.
  - Each place is stored once per user (moving between lists updates the list).
- Edge cases:
  - Saving without a list should prompt list selection/creation.
- Acceptance:
  - Users can save, remove, and open saved places from their profile.

### B7. Map polish (bottom sheets + radius UI + saved pins)
- Scope: V1
- What: Improve map usability with quick previews and stronger spatial cues.
- Rules:
  - Bottom sheet preview appears on marker tap.
  - Radius is visualized and labeled.
  - Saved places are highlighted on the map.
- Acceptance:
  - Users can preview a place on the map, see their radius, and recognize saved pins.

### B8. Discovery ranking (trending + personalized feed)
- Scope: V1
- What: Feed ranking blends recency, engagement, and personalization.
- Rules:
  - Trending uses engagement + recency decay.
  - For-you boosts followed authors and interest keyword matches.
  - Newest sorts by time only.
- Acceptance:
  - Users can switch between Trending, For you, and Newest in the feed.

---

## C) Rooms (Core Social Unit)

### C1. Local rooms (geo-locked)
- Scope: MVP
- What: Chat rooms exist inside a geographic constraint.
- Room types:
  - Public local room (default)
  - Topic rooms (coffee, jobs, photography, etc.)
  - Pop-up/event rooms
- Rules:
  - Only users within radius can view/join
- Edge cases:
  - User moves outside radius while in a room
- Acceptance:
  - A user outside radius cannot see or join the room

### C2. Room lifecycle (retention rules)
- Scope: MVP (confirmed)
- What: Define which messages expire and which persist.
- Rules:
  - Room messages do not expire
  - Business chats do not expire
  - Direct user-to-user chats expire after 1 hour
- Edge cases:
  - Expired direct messages should not appear in search or history
- Acceptance:
  - Room/business messages persist; direct messages expire after 1 hour

### C3. Create room
- Scope: MVP
- What: User can create a room at/within their permitted area.
- Rules:
  - Rate-limited
  - Category required
  - Basic moderation hooks
- Edge cases:
  - Attempted creation outside allowed area
- Acceptance:
  - Room appears on map for eligible users

### C4. Join/leave + presence in room
- Scope: MVP
- What: User can join, chat, leave.
- Rules:
  - Presence is temporary; no permanent membership unless explicitly designed
- Edge cases:
  - Presence should not leak outside radius rules
- Acceptance:
  - Join/leave updates are reflected; presence not visible outside rules

### C5. Messaging (text-first)
- Scope: MVP
- What: Text messages with minimal extras.
- Rules:
  - Anti-spam rate limits
  - Report/block actions
  - Message retention follows C2 (room/business persist, direct chats expire after 1 hour)
- Edge cases:
  - Repeated identical text triggers throttling
- Acceptance:
  - Messages deliver reliably; rate-limits trigger cleanly

### C6. Direct messaging presence (online/typing/read receipts)
- Scope: V1
- What: Shows online status, typing indicators, and read receipts inside DMs.
- Rules:
  - Presence pings are periodic, not exact tracking.
  - Typing and read states are scoped to a direct thread only.
- Edge cases:
  - Presence goes stale after inactivity.
- Acceptance:
  - Users see typing and read states for the active DM thread.

### C7. Media in chat (images/video/voice/GIFs/location)
- Scope: V1
- What: Attach media uploads to DMs, rooms, and business chats with previews.
- Rules:
  - Media uploads to Supabase Storage (public bucket for now).
  - Unlock after 10 accepted DM messages.
- Edge cases:
  - Oversized uploads are rejected client-side.
- Acceptance:
  - Users can attach and view media across DMs, rooms, and business chats.

### C8. Chat continuity controls (mutual keep)
- Scope: V1
- What: Both DM participants can opt in to keep chat history beyond the 1-hour TTL.
- Rules:
  - History stays visible only when both users opt in.
  - Toggling off returns the chat to 1-hour expiry behavior.
- Edge cases:
  - One user opts in; the other does not.
- Acceptance:
  - Mutual opt-in keeps the DM history visible.

---

## D) Businesses & Local Commerce

### D1. Business listings
- Scope: MVP
- What: Businesses appear on map/list as local entities.
- Fields (suggested):
  - Name, category, categories (tags), amenities, location area (not precise), hours, contact, services
- Rules:
  - Must be radius-limited
- Edge cases:
  - Business outside radius is not returned in list or map
- Acceptance:
  - Users see businesses within radius; can open business page

### D2. Business verification workflow
- Scope: V1
- What: Verification workflow with owner request and admin review.
- Rules:
  - Owners submit a verification request with notes/evidence
  - Admins approve/reject; status is shown on the profile
  - Verified badge visible when approved
- Edge cases:
  - Verification revoked or pending
- Acceptance:
  - Requests are tracked; status changes update badge and UI

### D3. Business room (public Q&A + discussion)
- Scope: MVP (confirmed by "businesses in MVP")
- What: Each business can host a room where locals ask questions and see responses publicly.
- Rules:
  - Businesses cannot DM-blast users
  - Business chats do not expire
  - Conversations are visible within radius
  - Business rooms are moderated by Blip management until a business claim is approved.
  - Chatroom preview shown before joining (demo polish)
  - Flagged/shadowbanned users cannot join business chatrooms
  - FAQ + quick replies can be surfaced for common questions (demo polish)
- Edge cases:
  - Business responses visible only to eligible locals
- Acceptance:
  - Business can respond; users can read and participate under radius rules
  - Preview modal shows recent messages and a Join CTA

### D4. Offers / announcements
- Scope: V1
- What: Businesses publish offers that show to eligible locals.
- Rules:
  - Must be clearly labeled as Offer
  - Frequency limited (anti-spam)
- Edge cases:
  - Offers suppressed if business exceeds rate limits
- Acceptance:
  - Offer appears on business page and optionally nearby feed

### D5. Menus / product list (lightweight catalog)
- Scope: V1
- What: Basic items, prices, availability.
- Rules:
  - No full e-commerce complexity unless ordering is enabled
  - Grocery items surface availability as in-stock/out-of-stock
- Edge cases:
  - Item marked unavailable should not be shown as purchasable
- Acceptance:
  - Users can view items and see last-updated

### D6. Integrated ordering (food/grocery/services)
- Scope: MVP (confirmed)
- What: Place an order directly in BLIP (no payments in MVP).
- Rules:
  - Store order requests and status updates only
  - Payment stays out-of-app for MVP
  - Delivery is handled by businesses outside the app (pickup-only in BLIP for now)
- Edge cases:
  - Ordering disabled should fall back to external link (if any)
- Acceptance:
  - Order request is created; order status updates

### D7. Business reviews & ratings
- Scope: V1
- What: Users can rate businesses and leave reviews with optional photo URLs.
- Rules:
  - One review per user per business (updates overwrite).
  - XP is awarded on first review submission (updates do not add XP).
  - Reviews are public; users can report abusive reviews.
- Edge cases:
  - User edits a review after handle rotation.
- Acceptance:
  - Reviews can be created, updated, and removed; rating summary updates.

---

## H) Social Graph

### H1. Following / friends system
- Scope: V1 (implemented)
- What: Users can follow each other; mutual follows are treated as friends.
- Rules:
  - Following is pseudonymous (handle-based).
  - Follow lists show the handle at the time of follow, refreshed on handle rotation.
  - No public follower leaderboard; counts remain profile-only.
- Acceptance:
  - Users can follow/unfollow from the feed.
  - Profile shows followers, following, mutuals, and recent friend activity.

---

## E) Safety, Trust, Moderation

### E1. Block user
- Scope: MVP
- What: Block prevents seeing each other's content.
- Edge cases:
  - Blocking should prevent future interactions in shared rooms when feasible
- Acceptance:
  - Blocked users cannot see/join same interactions (where feasible)

### E2. Report content/user/business
- Scope: MVP
- What: Report flows for moderation queue.
- Edge cases:
  - Duplicate reports on the same content
- Acceptance:
  - Reports recorded, triaged by type

### E3. Rate limiting & anti-spam
- Scope: MVP
- What: Limits for room creation, messages per minute, repeated identical text.
- Edge cases:
  - Abuse attempts using repeated content variants
- Acceptance:
  - Limits enforce consistently server-side

### E4. Moderation tooling (admin console)
- Scope: V1
- What: Review reports, ban accounts, hide rooms, remove business listings.
- Edge cases:
  - Reversing an action restores visibility where appropriate
- Acceptance:
  - Admin actions logged; reversible where appropriate

### E5. AI-assisted safety checks
- Scope: MVP (implemented)
- What: Safety checks for posts, comments, chats, reviews, and order notes (text + media).
- Rules:
  - Run server-side moderation before saving content.
  - Block unsafe content; return a friendly error message.
- Acceptance:
  - Unsafe content is blocked before insert; safe content flows normally.

### E6. Reputation / trust score
- Scope: MVP (implemented)
- What: Reputation + trust scores that increment with user actions.
- Rules:
  - XP-awarding actions also increase reputation/trust.
  - Non‑XP actions (e.g., room/business messages) increment reputation directly.
- Acceptance:
  - Profile shows reputation/trust and increments with actions.

### E7. Community moderation roles (rooms)
- Scope: MVP (implemented)
- What: Room owners can assign/remove moderators for their room.
- Rules:
  - Only room owner (or global admin) can manage roles.
  - Moderation controls are exposed in the room message menu.
- Acceptance:
  - Owner can promote/demote moderators; roles are visible in room UI.

### E8. Safer onboarding (phone verification + device fingerprinting)
- Scope: MVP (implemented)
- What: Optional phone verification and lightweight device fingerprinting.
- Rules:
  - Phone OTP uses Supabase SMS.
  - Device fingerprint is a local device ID stored and sent to DB.
- Acceptance:
  - Users can verify phone; device IDs are recorded per account.

---

## F) Monetization & Growth Controls

### F1. Paid tiers (users)
- Scope: Proposed
- What: Optional upgrades (larger radius, more room creation, etc.) are not included yet.
- Rules:
  - Do not create pay-to-harass
- Edge cases:
  - Tier downgrades reduce radius/limits immediately
- Acceptance:
  - Tier changes affect allowed operations

### F2. Business subscriptions
- Scope: V1
- What: Businesses pay for verified status, enhanced listing, "featured locally" placement (clearly labeled).
- Rules:
  - Must remain radius-limited
- Edge cases:
  - Lapsed subscription removes premium placement
- Acceptance:
  - Subscription gates features correctly

### F3. Paid invites
- Scope: V1 / Proposed (your call)
- What: Anti-spam + growth gating (not used in MVP).
- Edge cases:
  - Fraud attempts reusing invite purchases
- Acceptance:
  - Invite purchase (if enabled) issues valid codes; abuse prevention

---

## G) Admin Portals (Dashboards)

### G1. Business Admin Portal Dashboard
- Scope: MVP (implemented)
- What: A dashboard for businesses to manage their presence and operations.
- Modules (suggested):
  - Business profile: name/category/hours/phone/services, verification status + request history
  - Staff & permissions: multi-user login; owner grants roles/permissions (email lookup for staff invites)
  - Menus/products: CRUD, availability, pricing, bulk edits
  - Offers/announcements: create/schedule, rate-limited publishing
  - Orders: pickup-first queue, status updates, order notes, refunds/chargebacks placeholder (no payments in MVP)
  - Messaging: business room moderation, canned replies, escalation to support
  - Analytics: views, clicks, messages, orders by day, retention
  - Audit log: who changed what/when (owner/staff) (implemented)
- Rules:
  - Account owner must explicitly grant permissions to staff/team members
  - Least privilege by default; all sensitive actions audited
- Acceptance:
  - Owner can add/remove staff and assign permissions; staff actions respect permissions

### G2. Blip Admin Portal Dashboard
- Scope: MVP (implemented)
- What: An internal dashboard for the Blip team to operate and moderate the platform.
- Modules (suggested):
  - Global metrics: DAU/MAU, active rooms, messages, posts, orders, error rates
  - Moderation: reports queue, actions (hide content, lock users, shadowban), appeals review
  - Business ops: verification workflow, business takedowns, subscriptions (future)
  - Feature flags: toggles to enable/disable any feature (with safe defaults + audit log)
  - Support tooling: user lookup, account recovery, incident notes
  - Audit log: all admin actions immutable and queryable
- Rules:
  - Admin-only access; changes must be logged and reversible where possible
- Acceptance:
  - Team can review reports/appeals and toggle features without redeploying clients

---

## H) Analytics & Funnels

### H1. Analytics + funnels
- Scope: V1
- What: Event logging for key funnel steps (sessions, auth, posts, messages, orders, reviews, saves) via edge ingest.
- Rules:
  - Async logging; analytics must not block user flows.
  - Avoid logging sensitive content.
  - Pre-login events are queued locally and flushed after sign-in.
  - Ingest uses `supabase/functions/analytics-ingest` and requires auth.
  - Only whitelisted event names are accepted at ingest.
  - Admin-only access to aggregated counts.
- Acceptance:
  - Events land in `analytics_events` via edge function ingest.
  - Admins can see a 7-day funnel snapshot in the moderation console.
  - Event names include: screen_view, search_query, filter_toggle, identity_switch, phone_verification, push_permission, post_view, post_create, post_comment, post_reaction, post_repost, post_bookmark, post_share, message_send, chat_request_sent, order_place, review_submit, place_save, room_join, business_view, place_view, business_verification_requested, report_submit, appeal_submit, bug_report_submit, auth_sign_in, auth_sign_up, signup_confirmed, location_permission, onboarding_completed.

## I) Notifications

### I1. Push notifications
- Scope: MVP (implemented)
- What: Native push notifications for chats, room activity, and orders.
- Rules:
  - Requires FCM/APNs credentials + device tokens.
  - Should not block user flows if push fails.
- Acceptance:
  - Push is sent on room/business/DM messages and new orders.

# Part 3 - Non-Functional Requirements (Agent Must Respect)

## Privacy & Security
- Never expose raw coordinates publicly
- Keep sensitive logic server-side (Cloudflare Worker)
- Supabase RLS enforced for all reads/writes
- Audit logs for moderation + business actions

## Performance
- Nearby queries must be fast (geohash/cell indexing)
- Pagination required for lists
- Map clustering for dense areas
- Baseline load tests recorded in `BLIP_SYSTEM_DOCUMENTATION.md` (2026-01-27) show
  stable read-only performance through ~800 concurrent users; errors begin ~1000+.

## Abuse Resistance
- Sockpuppet mitigation (invites/phone verification optional)
- Spam throttling
- Report-driven moderation

---

# Part 4 - Definitions / Glossary

- Entity: anything discoverable on map (Room, Business, Offer)
- Area: a privacy-preserving geographic grouping (neighborhood/cell)
- Room: geo-locked conversation space
- Business Room: room attached to a business profile
- Tier: access level affecting radius/limits
- Handle Rotation: periodic change of user display identity

---

# Part 5 - Gaps & Backlog (Proposed)

## Must-have gaps (block rollout / scale)
- Magic link / email OTP deep-link auth (explicitly deferred).
- Google OAuth (explicitly not implemented).
- Payments / billing (explicitly not implemented; subscriptions are placeholders).
- Web support parity (location disabled on web; mobile-first only).

## Social features missing (vs Reddit/IG/Snap/BeReal/Discord)
- Creator-style features: stories/ephemeral posts, highlights, pinned posts.

## Messaging & community missing (vs Discord/Snap/Bumble)
- Voice rooms / voice channels (Discord-style).

## Local + map experience missing (vs Google Maps/Snap Map)
- None currently tracked; map polish and business metadata are implemented.

## Safety & moderation missing (beyond current tools)
- None currently tracked beyond future enhancements.

## Product polish missing
- None currently tracked.

## Business growth & ops backlog
- Business analytics (views, chat volume, saves, order conversion) beyond demo estimates.
- Media uploads for business hero/logo (storage-backed, not URL-only).
- Order status notifications + receipts (email/SMS/push).
- Business hours exceptions (holiday hours, temporary closures).
- Customer loyalty / coupon codes for repeat users.
