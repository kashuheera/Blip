# Blip UI Smoke Checklist

Use this list to validate core screens after a build or data reset.

## Setup
- Launch app via `npm run start`.
- Ensure `.env` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Confirm device has location permissions enabled.

## Auth
- Open Profile -> Sign in.
- Create account or sign in with email/password.
- Expected: success toast and Profile shows handle/email.

## Map (Home)
- Verify map renders with business + user pins.
- Tap a cluster -> spiderfy pins + zoom in.
- Tap a business pin -> card appears with image, rating, featured item.
- Tap "Open page" -> Business screen opens.
- Tap "Open chat" -> Business chat tab opens.
- Tap recenter button -> map animates to current location.

## Feed
- Feed list loads posts from Supabase.
- Expected: newest posts at top.

## Create
- Submit a post.
- Expected: success notice and post appears in Feed.

## Messages
- Business chats list loads.
- Direct messages list loads (if threads exist).
- Open a thread -> DirectChat shows message history.
- Send a direct message -> message appears and syncs in list.

## Business
- Overview tab shows description, rating, featured.
- Chat tab shows messages and allows send (if signed in and not restricted).

## Orders
- Orders list loads for signed-in user.
- Create order: pick business, add notes, request.
- Expected: order appears with status.

## Business Admin
- Staff list loads (if owner).
- Menu items list loads.
- Offers list loads.
- Orders list loads.
- Audit log shows recent changes.

## Admin Portal (Blip Admin)
- Feature flags render and toggle.
- Verification queue shows pending requests.
- Bug reports list loads.
- Flagged users list loads.
- Recent orders list loads.
- Audit log shows recent admin events.

## Moderation
- Reports list loads.
- Appeals list loads.

## Bug Report
- Submit a report.
- Expected: success notice; report appears in Admin Portal.

## Edge Cases
- Signed out: messages/orders create disabled with notice.
- Shadowbanned or U2U locked: business chat input hidden.
