# Blip Color System (Private Club) — Design Tokens + Usage Map
Version: 2026-02-08  
Goal: “Members‑only private club curated for the user” — calm, controlled, premium.  
Core rule: **Mint = rewards/primary CTA only.** Categories are **tinted**, never loud.

---

## 1) Global Brand Palette

### Dark (default)
- **BG (Obsidian):** `#0B0B10`
- **Surface/Card (Graphite):** `#15151D`
- **Surface 2 (Raised/Pressed):** `#1B1B24`
- **Border/Divider:** `#242430`

- **Text Primary:** `#EAEAF0`
- **Text Secondary:** `#A1A1B3`
- **Text Tertiary/Disabled:** `#6B6B7A`

- **Brand (Royal Indigo):** `#4C3EFF`  
  Use for: selected nav/tab, focus state, key brand moments, “you are here” marker on map (NOT mint).
- **Reward / Primary CTA (Electric Mint):** `#2DFFB3` ✅ **sacred**  
  Use for: Post, Claim, Earn XP, Level‑up, Success states.
- **Prestige / Rank (Soft Gold):** `#C9A24D`  
  Use for: VIP/Elite/Rare, Rank badges, “Top rated”.

- **Danger:** `#FF4D4D`
- **Warning:** `#FFB86B` (also used for Offers accent)
- **Info/Order (Cyan):** `#7AE2FF`

### Light (companion)
- **BG:** `#F7F7FB`
- **Surface/Card:** `#FFFFFF`
- **Surface 2:** `#F0F0F7`
- **Border/Divider:** `#E6E6EF`

- **Text Primary:** `#0E0E14`
- **Text Secondary:** `#4A4A5A`
- **Text Tertiary/Disabled:** `#7A7A8A`

- **Brand:** `#3F35E8`
- **Reward / Primary CTA:** `#12C98A` ✅ sacred
- **Prestige / Rank:** `#B88A2C`

- **Danger:** `#D92D20`
- **Warning/Offers:** `#B85A1A`
- **Info/Order:** `#136C86`

---

## 2) Semantic Tokens (Where Colors Belong)
These are “roles” Codex should implement in theme files. **No hardcoding hex in UI components.**

### Background + surfaces
- `--bg` → main app background
- `--surface` → cards, sheets, modals
- `--surface-2` → pressed/raised surfaces, input backgrounds
- `--border` → outlines, dividers, separators

### Text
- `--text` → titles, primary labels
- `--text-2` → supporting text, meta info
- `--text-3` → placeholders, disabled, tertiary

### Interaction + status
- `--brand` → selected states, focus ring, “active” nav indicator, “you are here” map marker
- `--reward` → **primary CTA** + XP + level‑up + success confirmations
- `--prestige` → rank/VIP/rare + rating star fill (when “top rated”)
- `--danger` → destructive actions, error badges, failed order states
- `--warning` → warnings + offers highlight
- `--info` → order tracking / neutral info states

---

## 3) Food & Services Categories (Tinted System)
Categories are for **chips/tags, tiny icons, map pins**, not large blocks.  
Each category has:
- `fg` = icon/stroke/text
- `bg` = chip/label background tint

### Dark category tokens
- **Coffee & Cafés:** `fg #BFA8FF` | `bg #221B33`
- **Restaurants (General):** `fg #FFB86B` | `bg #2B1F14`
- **Street Food:** `fg #FF7A90` | `bg #2B151A`
- **Desserts / Bakery:** `fg #FFB3E6` | `bg #2A1624`
- **Groceries / Convenience:** `fg #8FF5C7` | `bg #13271F`
- **Beauty / Salon / Spa:** `fg #7AE2FF` | `bg #10232B`
- **Health / Pharmacy:** `fg #8DA2FF` | `bg #151B2B`
- **Services (Repairs/Laundry/etc.):** `fg #FFD66B` | `bg #2A2414`

### Light category tokens
- **Coffee & Cafés:** `fg #5A47C8` | `bg #ECE9FF`
- **Restaurants (General):** `fg #B85A1A` | `bg #FFF0E3`
- **Street Food:** `fg #B83249` | `bg #FFE6EA`
- **Desserts / Bakery:** `fg #A8397A` | `bg #FFE8F5`
- **Groceries / Convenience:** `fg #0E8A60` | `bg #E6FFF5`
- **Beauty / Salon / Spa:** `fg #136C86` | `bg #E6F9FF`
- **Health / Pharmacy:** `fg #2B43B8` | `bg #E9EEFF`
- **Services:** `fg #8A6A0E` | `bg #FFF6D6`

### Category usage rules
- Chip background: use `cat-*-bg` at ~100% opacity (already dark-tinted / pastel)
- Chip text/icon: use `cat-*-fg`
- Map pins: use `cat-*-fg` for pin fill or stroke; keep pin body neutral if needed
- Never use category colors for primary CTA buttons
- Never use `--reward` as a category color

---

## 4) Commerce Layer (Offers, Menus, Orders, Reviews)
These are feature-level semantics Blip needs.

### Offers (anti-spam, time-limited)
- Badge/label: `--warning` (Dark `#FFB86B`, Light `#B85A1A`)
- Offer chip bg: reuse restaurant bg (`#2B1F14` dark / `#FFF0E3` light) OR a dedicated offers tint if desired
- CTA inside offer: still `--reward` if it’s the primary action

### Menus / Product lists
- Menu list background: `--surface`
- Price: `--text` (primary) + optional subtle highlight with `--prestige` only for “chef special”/rare
- “Add to cart / Order” button: `--reward`

### Orders (status tracking, notifications)
Use `--info` as the *brand language* for orders:
- Status pill base: `--info` (Dark `#7AE2FF`, Light `#136C86`)
- Pill bg should be a tint: `--surface-2` + `--info` border/label
- Success delivered: `--reward`
- Failed/cancelled: `--danger`

### Reviews / Ratings
- Regular star outline: `--text-3`
- Filled stars:
  - Default: `--prestige`
  - “Top rated” badge: `--prestige` + subtle background tint (`--surface-2`)

---

## 5) Component-by-Component Mapping

### App shell
- Screen background: `--bg`
- Bottom tab bar: `--surface`
- Active tab icon/label: `--brand`
- Inactive: `--text-3`
- Active indicator: `--brand` thin underline (no glow)

### Cards (Business / Post / Place)
- Card bg: `--surface`
- Card border: `--border` (optional; prefer shadow/elevation lightly)
- Title: `--text`
- Meta: `--text-2`
- Distance/time: `--text-3`
- Category chip: `cat.bg` + `cat.fg`

### Buttons
- Primary CTA: bg `--reward`, text `--bg`
- Secondary: bg transparent, border `--border`, text `--text`
- Tertiary (text button): text `--text-2`
- Destructive: bg `--danger`, text `--bg`

### Inputs
- Input bg: `--surface-2`
- Placeholder: `--text-3`
- Focus ring: `--brand`
- Error ring: `--danger`

### Toasts / Alerts
- Success: `--reward`
- Info: `--info`
- Warning: `--warning`
- Error: `--danger`

---

## 6) Map & Discovery (Blip’s core)
Map must stay calm; pins provide meaning without shouting.

- Map base: prefer dark map style that matches `--bg`
- Default pins: neutral (`--text-3` / `--border`)
- Category pins: `cat.fg`
- Selected pin: `--brand` ring + slight scale
- “You are here”: `--brand` (not mint)
- Radius/geo-fence overlays: `--brand` at low opacity (10–20%)

---

## 7) Gamification (XP / Levels / Loot)
This is where Blip becomes addictive **without** becoming loud.

- XP gain text/particles: `--reward`
- Progress bars:
  - Track: `--surface-2`
  - Fill: `--reward`
- Level-up modal:
  - Background: `--surface`
  - Big accent: `--reward`
  - Supporting accent: `--brand`
- Rare loot / VIP:
  - Badge: `--prestige`
  - Glow: subtle, use `--prestige` at low opacity (avoid neon)

---

## 8) Accessibility & Consistency Rules (must implement)
- Avoid pure white on dark backgrounds (use `--text`)
- Keep bright colors limited to:
  - `--reward` (primary action + success + XP)
  - `--brand` (selection/focus)
  - `--danger` (errors)
- Never put `--reward` text on `--surface` without checking contrast; prefer `--reward` as a background or accent line
- Category chips must remain readable: `cat.fg` on `cat.bg` only

---

## 9) Quick “Do / Don’t” Summary
### Do
- Dark-first, calm UI with controlled highlights
- Use mint only for reward/CTA moments
- Use categories as small tinted hints

### Don’t
- Rainbow buttons
- Full-screen category-colored sections
- Mint for anything that isn’t reward/CTA/success/XP

---

## 10) Implementation Notes for Codex
- Create a `theme` object with:
  - `dark` + `light` token sets
  - `categories` map `{ coffee, restaurant, streetFood, dessert, grocery, beauty, health, services }`
- Provide helpers:
  - `getCategoryColors(categoryKey, mode)`
  - `getStatusColors(statusKey, mode)` for order states
- Enforce usage by linting or review: **no raw hex codes in UI components**

