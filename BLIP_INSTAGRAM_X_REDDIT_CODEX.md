# Codex Task Spec — “Blip = Instagram × Reddit” (Private Club Theme)
Date: 2026-02-09  
Objective: Update Blip UI to feel like **Instagram’s polish** + **Reddit’s structure** while keeping the **Midnight Club** theme (dark-first, curated, premium).

This doc is **implementation-ready for VS Code**. No design tools required.

---

## 0) Non‑negotiables (guardrails)
1) **Dark-first**. Light theme exists, but dark is default.  
2) **Mint is sacred**: use `reward` only for **Primary CTA / XP / Success**.  
3) Categories are **tinted chips + pins only** (no full-color screens).  
4) Reduce “stacked card fatigue”: not everything should be a big card. Use rows + sections.  
5) Improve hierarchy: *not everything is equally loud*. Titles win, meta whispers.  
6) Avoid pure white on dark backgrounds (use off-white). (General best practice for dark mode.) citeturn0search7turn0search19

---

## 1) Theme Tokens (use these; no raw hex in components)
### Dark
- bg `#0B0B10`
- surface `#15151D`
- surface2 `#1B1B24`
- border `#242430`
- text `#EAEAF0`
- text2 `#A1A1B3`
- text3 `#6B6B7A`
- brand `#4C3EFF`
- reward `#2DFFB3`
- prestige `#C9A24D`
- danger `#FF4D4D`
- warning `#FFB86B`
- info `#7AE2FF`

### Light
- bg `#F7F7FB`
- surface `#FFFFFF`
- surface2 `#F0F0F7`
- border `#E6E6EF`
- text `#0E0E14`
- text2 `#4A4A5A`
- text3 `#7A7A8A`
- brand `#3F35E8`
- reward `#12C98A`
- prestige `#B88A2C`
- danger `#D92D20`
- warning `#B85A1A`
- info `#136C86`

### Categories (tinted)
Use the categories from `BLIP_COLORS_FOR_CODEX.md` (already provided). Chips/pins only.

---

## 2) UX Direction (Instagram × Reddit)
### What we’re building
- **Feed**: clean, visual-first *when there is media* (Instagram), but **thread-first** with titles + structure (Reddit).
- **Threads**: nested replies, collapse/expand, sort (Near, Trusted, New, Active).
- **Identity/Profile**: editorial dashboard (not stacked cards).

### What we’re NOT building
- A loud, gradient-heavy “neon” UI.
- A meme-style Reddit clone.
- A pure photo feed.

---

## 3) Screen-by-screen spec

## A) Feed Screen (Hybrid)
### Layout per post (card)
**Goal:** readable, structured, scannable.

**Anatomy**
1. Top row:
   - Left: category chip (tinted)
   - Right: distance • time (text3)
2. Title (text, semibold)
3. Optional media:
   - Only show if exists
   - Rounded corners, subtle border
4. Body preview:
   - 2–3 lines max, fade-out at end
5. Action row:
   - XP (small), Replies, Save, More
   - Icons monochrome by default; highlight on interaction
6. Separator: subtle hairline (border)

**Styling rules**
- Card bg = `surface`
- Border = `border` at low emphasis or drop border + use soft shadow
- Title: text (16–18), semibold
- Body: text2 (14–15)
- Meta: text3 (12–13)

**Interactions**
- Tap post → Thread view
- Long-press post → action sheet
- Double-tap (optional) → micro XP reward (reward color micro animation ONLY)

---

## B) Thread Screen (Reddit structure)
**Goal:** deep discussions without clutter.

**Header**
- Back, post title (single line), sort dropdown (Near/Trusted/New/Active)

**Post content**
- Same as feed card but expanded body

**Reply tree**
- Indent levels:
  - Level 1: 12px
  - Level 2: 24px (cap at 3 levels; after that, use “View more replies”)
- Left guide line:
  - Use `border` (not bright)
- Collapse control:
  - Small “–” / caret; collapsed shows “3 replies hidden”

**Reply composer**
- Fixed bottom sheet
- Primary send button uses `reward`

---

## C) Profile / Identity Screen (make it not ugly)
**What’s wrong today**
- Everything is a card, same weight, no rhythm
- Stats are dead numbers

**New structure**
1) **Header (Instagram vibe)**
- Avatar (or glyph)
- Handle (large)
- Active identity pill (brand)
- Edit icon (text2)

2) **Stats panel (RPG but classy)**
- Level badge (brand)
- XP progress bar (reward)
- Reputation meter (prestige)
- Trust status pill (prestige when verified, otherwise text2)

3) **Quick actions (rows, not cards)**
- Saved
- Safety & verification (status on right)
- Orders
- Settings

**Style**
- Use one primary “hero” surface at top; rest are clean list rows with separators.
- Reduce big rounded rectangles.

---

## D) Bottom Nav
- Background = surface
- Active icon/label = brand
- Create button:
  - Icon ring brand
  - If primary CTA: reward only when pressed or on “Create” screen

---

## 4) Visual polish checklist (do these first)
1) Increase spacing rhythm:
   - Vertical spacing: 12 / 16 / 24
   - Card padding: 16
2) Typography:
   - Titles: 16–18 semibold
   - Meta: 12–13
   - Body: 14–15
   - Slightly higher line height in dark mode improves readability. citeturn0search19
3) Reduce borders:
   - Use border only where needed; rely on spacing + surface contrast
4) “One glow maximum”:
   - Allow glow only for level-up / reward moments

---

## 5) Components to implement (VS Code)
Create or refactor these reusable components:

### `BlipCard`
Props: `children`, `variant = "default|flat"`, `pressable?`  
- Default: surface bg, 16 padding, 16–20 radius, subtle shadow or 1px border.

### `CategoryChip`
Props: `categoryKey`, `label`  
- Uses category `{fg,bg}` tokens per theme.

### `PostCard`
Props: `post`  
- Implements feed anatomy above.

### `ThreadReply`
Props: `reply`, `depth`  
- Handles indentation, guide line, collapse.

### `StatRow` / `StatMeter`
- Level badge
- XP progress bar
- Reputation meter
- Trust status pill

### `ListRow`
Props: `icon`, `title`, `subtitle?`, `rightMeta?`, `onPress`  
- For Saved / Safety / Orders rows.

---

## 6) Acceptance criteria (how we know it’s “better”)
- Feed: user can scan 5 posts in < 3 seconds and know what to open.
- Profile: top area feels premium; no “stacked card wall”.
- Colors: mint used only for reward/CTA/success (spot check).
- Contrast: text readable (no grey-on-grey mush).
- Visual noise: fewer borders, more spacing.

---

## 7) Optional “club” enhancements (if time)
- Add subtle background grain (5–7% opacity) to bg
- Add micro animation for reward events only
- Add “VIP” gold badge for verified/trusted identities

---

## 8) Hand-off instructions to Codex
Implement in this order:
1) Theme token wiring (ensure all components consume tokens)
2) `ListRow` + Profile restructure (quick win, fixes “ugly” screen)
3) `PostCard` for feed
4) Thread view + nested replies
5) Polish pass: spacing, typography, borders

No need to redesign everything at once—ship the profile improvement first.
