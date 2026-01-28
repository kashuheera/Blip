# BLIP AI RULES (for VS Code assistant)

## Stack
- Expo / React Native, TypeScript
- Supabase (Postgres, RLS)
- Cloudflare Workers (TypeScript)

## Hard rules
- Never commit secrets. Use .env and placeholders.
- Prefer small, reviewable diffs.
- Don't rename files or move folders unless asked.
- If unsure about existing architecture, ask by inspecting current code first.

## Coding style
- TypeScript strict-friendly
- Clear function names, minimal magic
- Add comments only where logic is non-obvious

## When editing
- Tell me what files you changed
- Explain why each change is needed
- Provide the exact command to run to verify (expo start, tests, etc.)

## Product decisions (locked)
- Auth (testing): email + password (to unblock dev logins).
- Auth (must-have before rollout): email magic link + email OTP with proper domain redirects / deep links (no 127.0.0.1 links).
- Handle rotation: every 5 minutes; never reuse a handle within 3 months.
- Handle generation: use birth year only to pick the wordlist (Gen Z vs general); do not store full DOB or expose it publicly.
- Gen Z cohort definition: birth years 1997-2012 (adjustable).
- Message retention: user-to-user chats expire after 1 hour; room messages do not expire; business chats do not expire.
- Access: open signup; no invite-only or waitlist in MVP.
- Tiers: not included for now.
- Ordering: included; no payments in MVP (pickup only in BLIP; delivery handled by businesses outside the app).
