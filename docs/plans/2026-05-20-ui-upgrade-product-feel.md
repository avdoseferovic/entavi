# UI Upgrade — Product Feel Implementation Plan

Created: 2026-05-20
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

> **Status Lifecycle:** PENDING → COMPLETE → VERIFIED
> **Approval Gate:** Implementation CANNOT proceed until `Approved: Yes`

## Summary

**Goal:** Redesign all three Entavi surfaces — Tauri desktop app, browser webapp, and marketing website — so they stop reading as a generic AI-built layout and start feeling like a deliberate, polished product. Same indigo family the user already knows, but executed with the craft, restraint, and texture of a real product.

**Architecture:** Establish a single design system in `src/style.css` (tokens + base + components) that the Tauri app and the webapp consume directly (the webapp already pulls from `../src` via the `@shared` alias). The website, today a 1,435-line monolith in `website/index.html`, gets the same tokens via a sibling `website/styles.css` so both surfaces share visual DNA. Existing component APIs are preserved — only templates and styles change, so Rust/Tauri wiring and state composables are untouched.

**Tech Stack:**
- **Design tokens:** Custom CSS variables (existing pattern; no Tailwind introduction).
- **Typography:** `Instrument Serif` (display) + `Geist Sans` (UI) + `Geist Mono` (room codes). Self-hosted via @fontsource where available, with Google Fonts CDN fallback for the website.
- **Color:** `#0f0f17` background, `#ece8ff` foreground, `#7c6cff` accent, plus a small semantic ramp (success, warning, danger) and a 9-step neutral scale.
- **Motion:** CSS-only transitions; respect `prefers-reduced-motion`. No motion library.
- **No Tailwind / no Vue Router / no UI library** — keep the dependency footprint that already ships.

## Scope

### In Scope

- New design tokens (color, type scale, spacing, radii, shadows, motion) in `src/style.css`.
- Typography overhaul (load Instrument Serif + Geist; replace system stack).
- Redesign of every shared component:
  - `HomeView`, `CreateView`, `JoinView`, `RoomView`
  - `ParticipantItem`, `RoomControls`, `ChatPanel`, `PingIndicator`
  - `SettingsModal`, `MicSelector`, `SpeakerSelector`, `ShortcutSettings`, `HostControls`
- Redesign of webapp `window-shell` and `titlebar` in `web/src/window.css`.
- New `App.vue` header treatment (Tauri) — replaces the current `<h1>Entavi</h1>` + subtitle block.
- Marketing website (`website/index.html`):
  - Extract inline `<style>` block into `website/styles.css` consuming the new tokens.
  - Rebuild every section (nav, hero, features, how-it-works, security, self-host, FAQ, footer).
  - Replace the embedded "app preview" mockup with one that matches the new app UI.
- Empty states, loading/connecting states, and the reconnecting banner.
- Motion polish: page-load reveals, speaking-state pulse, copy-confirmation, focus rings.
- Accessibility pass: 4.5:1 contrast, focus-visible, keyboard reachability for all controls, semantic landmarks on the website.

### Out of Scope

- Any change to Rust/Tauri backend (`src-tauri/`), the signaling server (`signaling-server/`), or the engine (`web/src/engine/`). No backend behavior, IPC commands, or audio pipeline changes.
- No new features (no new screens, no new settings, no new chat features, no new host controls).
- No theme switcher / light mode — single dark theme this pass.
- No icon set change — continue using `lucide-vue-next`.
- No new framework, router, state library, or CSS framework introduced.
- App icon, favicon, OS-level branding — unchanged.
- Localization / i18n — copy stays English.
- The signaling-server WebSocket relay file `signaling-server/src/index.ts` (modified in git status) — unrelated to UI.

## Prerequisites

- Node 18+ and `npm install` already run for the root project and `web/`.
- Tauri dev environment functional (already confirmed: `npm run tauri dev`).
- A working `playwright-cli` for E2E verification of the webapp surface.
- Internet access for the first build (Google Fonts CDN for the website). Self-hosted fonts via `@fontsource` make the app and webapp work offline.

## Context for Implementer

- **Patterns to follow:**
  - Vue 3 `<script setup lang="ts">` SFCs — same pattern as every file in `src/components/`.
  - Global CSS in `src/style.css` (imported by `src/main.ts`). The codebase is **not** using CSS Modules, scoped styles, or Tailwind. Stick to global CSS with BEM-ish class names already established (`.btn-primary`, `.participant-item`, `.chat-bubble`).
  - Composables in `src/composables/` are the I/O boundary — never call `invoke()` directly from components.
  - Icons come from `lucide-vue-next` (already installed). Continue using it.
- **Conventions:**
  - File naming: PascalCase `.vue` files. Component names match filenames.
  - CSS variables are the existing tokens (see current `--bg-primary` etc. in `website/index.html` lines 15–27). Expand and standardize them across all three surfaces.
  - Color literals (`#4f46e5`, `#1a1a2e`, `#252538`, etc.) are scattered throughout `src/style.css` — replace **all** of them with token references in Task 1.
- **Key files to read first:**
  - `src/style.css` (871 lines) — the entire app design system today.
  - `src/App.vue` — outer shell, view switching.
  - `src/components/RoomView.vue` + `RoomControls.vue` + `ParticipantItem.vue` — the highest-traffic screen.
  - `website/index.html` (1,435 lines) — entire marketing site in one file.
  - `web/src/window.css` + `web/src/App.vue` — the webapp wraps the shared components in a fake desktop window.
- **Gotchas:**
  - **No CSS scoping.** A class collision between two components silently overrides. Verify after each redesign that other screens still look right.
  - **The webapp `redirectTauriImports` plugin** (in `web/vite.config.ts`) swaps `useTauri` → `useWeb` at build time. Do not touch composables.
  - **`user-select: none`** is set on body globally (`src/style.css:25`). Chat text must opt back in or copy will silently break.
  - **The `dist/` folder is committed** (per `git status`). After a website build, expect changes in `dist/` and `website/` — only `website/` is the source.
  - **Tauri capabilities** (`capabilities/default.json`) gate which Tauri APIs the frontend can call. Don't add new ones for UI work.
- **Domain context:** Entavi is real-time voice. The room screen is the product. Every interaction during a call (mute, leave, see who is speaking) has to be readable in <100ms of glance time. Visual flourishes on this screen must never delay or obscure speaking-state feedback.

## Runtime Environment

- **Start commands:**
  - Tauri app: `npm run tauri dev` (from project root).
  - Webapp: `cd web && npm run dev` → http://localhost:5173.
  - Website: open `website/index.html` directly, or `npx serve website` for a real server.
- **Restart procedure:** Vite HMR handles `.vue` and `.css` edits. Full restart only needed if `vite.config.ts` or `package.json` changes.
- **No long-running backend service** — the signaling worker is remote (Cloudflare); local development uses the deployed worker.

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: Design system foundation — tokens, fonts, base styles
- [x] Task 2: Entry flow — HomeView, CreateView, JoinView, App header
- [x] Task 3: Room screen core — RoomView, ParticipantItem, PingIndicator
- [x] Task 4: Room interactions — RoomControls, ChatPanel, banners
- [x] Task 5: Settings modal + form controls (toggles, sliders, selects, shortcuts)
- [x] Task 6: Webapp window shell + titlebar
- [x] Task 7: Website foundation — extract CSS, nav, hero, app preview
- [x] Task 8: Website body sections — features, how-it-works, security
- [x] Task 9: Website tail + responsive + motion polish — self-host, FAQ, footer

**Total Tasks:** 9 | **Completed:** 9 | **Remaining:** 0

## Implementation Tasks

### Task 1: Design system foundation

**Objective:** Replace the existing color/typography/spacing primitives with a coherent token system. Load Instrument Serif + Geist. Establish the base reset, scrollbar, focus styles, and shared utility classes that every later task consumes.

**Dependencies:** None

**Files:**
- Modify: `src/style.css` (top section: `:root`, base reset, scrollbar, body, plus the class-rename header comment block — see below)
- Modify: `package.json` (add `@fontsource/instrument-serif`, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`) — **before installing, verify each package exists** via `npm info @fontsource/instrument-serif` etc. If Instrument Serif is not published, fall back to `@fontsource-variable/instrument-serif` or self-host the WOFF2 in `src/assets/fonts/` and load it via `@font-face` in `src/style.css`. Geist + Geist Mono are confirmed to exist as `@fontsource-variable/*`.
- Modify: `src/main.ts` (import the font CSS)
- Create: `src/styles/tokens.css` (optional split if `style.css` would exceed ~300 lines; otherwise inline at top of `style.css`)

**Pre-task action — CSS class collision audit (DO THIS FIRST):**

Before adding the new tokens, audit `src/style.css` for class names that will be touched in Tasks 2–5. Decide upfront whether each is kept-and-updated-in-place or renamed. Add a comment block at the top of `src/style.css` listing the decisions:

```css
/*
 * Class names: keep-or-rename ledger (do not modify after Task 1).
 *   Updated in place:  .btn-primary, .btn-secondary, .participant-item, .chat-bubble,
 *                       .settings-modal, .room-header, .room-tabs, .notice-banner,
 *                       .toggle-track, .toggle-thumb, .mic-level-meter
 *   Renamed:           .btn-mute-circle  → .room-mute
 *                       .btn-leave-circle → .room-leave
 *                       .btn-settings-circle → .room-settings
 *                       .room-controls    → .room-dock
 *                       .reconnecting-banner → .room-status-pill
 */
```

This locks the naming so every subsequent task uses the same words.

**Key Decisions / Notes:**
- Tokens — finalize these values:
  - `--bg-0: #0a0a12`, `--bg-1: #0f0f17`, `--bg-2: #15151f`, `--bg-3: #1c1c2a`, `--bg-elev: #22223a`
  - `--fg-0: #ece8ff`, `--fg-1: #b8b5d4`, `--fg-2: #7c7a96`, `--fg-3: #4d4b66`
  - `--accent: #7c6cff`, `--accent-hi: #9a8dff`, `--accent-lo: #5b4dd6`, `--accent-glow: rgba(124, 108, 255, 0.18)`
  - `--success: #4ade80`, `--warning: #f59e0b`, `--danger: #f87171`
  - `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`, `--radius-pill: 999px`
  - Spacing scale on 4px grid: `--s-1: 4px` … `--s-8: 32px`, `--s-10: 40px`, `--s-12: 48px`, `--s-16: 64px`
  - Motion: `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`, `--dur-fast: 120ms`, `--dur: 200ms`, `--dur-slow: 360ms`
- Typography: `font-display: 'Instrument Serif', serif` (used sparingly for the wordmark + section eyebrows); `font-ui: 'Geist Variable', system-ui, sans-serif` (everything else); `font-mono: 'Geist Mono Variable', ui-monospace, monospace` (room code only).
- Add `:focus-visible` ring using `--accent` with 2px outset offset. Remove default `outline: none` from all controls in favor of `:focus-visible`.
- Body remains `overflow: hidden` for the Tauri/webapp (380×600 window). **The website is fully independent** — `website/index.html` does not import `src/style.css`; its body rules live entirely in `website/styles.css` (Task 7) and set `overflow: auto`. Do NOT add a `body.website` override class to `src/style.css` — it would be a dead rule because the website never loads that stylesheet.
- Replace every hardcoded hex in `src/style.css` with `var(--…)`. **No literal hex values may remain** in `src/style.css` after this task.
- Add a `prefers-reduced-motion` media query that zeros all transition durations.

**Definition of Done:**
- [ ] All tokens listed above are defined as CSS custom properties on `:root`.
- [ ] `Instrument Serif`, `Geist Variable`, and `Geist Mono Variable` load successfully on the Tauri app (verify via DevTools → Computed → `font-family`).
- [ ] `src/style.css` contains zero hex color literals — every color is `var(--…)`.
- [ ] `body { font-family: var(--font-ui) }` is applied; existing screens still render without obvious regression.
- [ ] `:focus-visible` outline is visible when tabbing through buttons on the Home screen.
- [ ] `prefers-reduced-motion: reduce` disables transitions when toggled in DevTools.
- [ ] `--fg-2` has measured contrast ≥ 4.5:1 against `--bg-0`, `--bg-1`, AND `--bg-2` (WebAIM contrast checker). `#7c7a96` on `#0f0f17` measures ≈4.64:1 — borderline and likely to fail Lighthouse on small (11–12px) text where `--fg-2` is heavily used. If borderline, shift `--fg-2` to `#8a88a8` (≈5.3:1) or `#9997b4`. **This gates Task 2.**
- [ ] `--fg-3` is documented in a comment as intentionally decorative-only (used for placeholder text and disabled states); never apply `--fg-3` to informational text. If informational text needs lower emphasis, use `--fg-2`.
- [ ] The class-rename ledger comment block (see Pre-task action above) is present at the top of `src/style.css`.
- [ ] No new TypeScript errors (`npm run build` succeeds).

**Verify:**
- `npm run build` — type-check and bundle succeed.
- `npm run tauri dev` — app launches and the Home screen renders with the new fonts.
- Manual DevTools check: inspect `<body>` → confirm `font-family` resolves to Geist.

---

### Task 2: Entry flow — HomeView, CreateView, JoinView, App header

**Objective:** Rebuild the three entry screens and the outer `App.vue` header into a single coherent "landing" inside the 380×600 window. Replace the current `<h1>Entavi</h1>` + subtitle block with an intentional, asymmetric composition using the display serif. Forms (Create / Join) get refined inputs, an explicit primary action, and a quiet "Back" affordance.

**Dependencies:** Task 1

**Files:**
- Modify: `src/App.vue` (template only — header markup; logic untouched)
- Modify: `src/components/HomeView.vue`
- Modify: `src/components/CreateView.vue`
- Modify: `src/components/JoinView.vue`
- Modify: `src/style.css` (sections: `header`, `.action-row`, `.btn-*`, `input[type="text"]`, `.back-btn`, `.form-label`)

**Ownership decision — wordmark stays in `App.vue`:**

The current `<h1>Entavi</h1>` + subtitle + version block in `src/App.vue` (lines 152–156) **stays in `App.vue`** — it is rendered inside the existing `<header v-if="state.currentView === 'home'">` element. Do not move it into `HomeView.vue`. After this task:

- `src/App.vue` `<header>` content: `<h1 class="wordmark">Entavi</h1>` (Instrument Serif) + `<p class="wordmark-eyebrow">peer-to-peer voice</p>` (Geist 11px uppercase, `--fg-2`) + the existing version pill (relocated per Key Decisions below).
- `src/components/HomeView.vue`: contains the CTAs, the "Calling as" display-name field, and the quiet Settings link. **No wordmark here.**

The existing `<header v-if>` already handles hide-on-non-home — preserve it untouched.

**Key Decisions / Notes:**
- Home composition (top-to-bottom):
  1. Wordmark "Entavi" in Instrument Serif at ~32px with a small `·` separator + status copy ("peer-to-peer voice") in Geist 12px, all-caps tracking +0.06em — sets the tone immediately. **Rendered by `App.vue` header (see Ownership decision above).**
  2. Generous breathing room (`padding-top: var(--s-12)`).
  3. Two primary CTAs stacked, not side-by-side: a filled "Start a room" and an outlined "Join with code". Side-by-side feels like a template; stacked-with-prominent-primary feels like a product decision. **Rendered by `HomeView.vue`.**
  4. Inline display-name field below, labelled "Calling as" not "Display name" — softer, more product-voice. **Rendered by `HomeView.vue`.**
  5. Quiet `Settings` link at the bottom (text + icon, no full-width button). **Rendered by `HomeView.vue`.**
- Create/Join forms:
  - Bigger input height (44px), label above input with the new label treatment (Geist 11px uppercase, `--fg-2`).
  - Primary button full-width at the bottom; "Back" is an unstyled link with a chevron.
  - The password field on Join uses an inline transition (height + opacity) when `joinPasswordNeeded` flips true.
- Button system: `.btn-primary` (filled, accent), `.btn-secondary` (outline, `--bg-3` border), `.btn-quiet` (text-only). Remove the global `button:hover { opacity: 0.85 }` — replace with deliberate per-variant hover states (slight brightness lift, no opacity).
- The version pill (`v0.1.5`) is preserved but moves to a single mono character row at the very bottom of the window, separated by a hairline.

**Definition of Done:**
- [ ] The wordmark element with class `.wordmark` (Instrument Serif) lives **inside `src/App.vue`** header element, NOT inside `HomeView.vue` (confirm via grep).
- [ ] The eyebrow `.wordmark-eyebrow` (Geist 11px uppercase) renders below the wordmark in the same `App.vue` header.
- [ ] `HomeView.vue` contains no `<h1>` tag (the wordmark is the only h1 and it's in App.vue).
- [ ] Home screen CTAs are stacked vertically (not side-by-side), primary above secondary.
- [ ] "Calling as" label appears above the display-name input in `HomeView.vue`.
- [ ] Create flow: entering a room name + pressing Enter still calls the existing `create` emit with the correct args.
- [ ] Join flow: invalid code still shows "Room not found"; password-required state still reveals the password field; password reveal uses a height/opacity transition (not a snap).
- [ ] Back button is a quiet text link with chevron (not a filled button) on both Create and Join.
- [ ] Tab order on each screen: name → password (if visible) → primary → back. Focus ring is visible on each.
- [ ] No regression: all four existing emits (`create`, `back`, `join`) fire with the same payloads.

**Verify:**
- `npm run tauri dev` and click through Home → Create → fill name → Create. Confirm a room starts.
- `npm run tauri dev` → Join → enter a non-existent code → confirm "Room not found".
- Keyboard-only: tab through Home, confirm focus rings; Enter on a focused button activates it.

---

### Task 3: Room screen core — RoomView, ParticipantItem, PingIndicator

**Objective:** Redesign the in-call screen — the product's most important surface. Establish a clear visual hierarchy: room identity at top, list of who's here in the middle (with live speaking feedback), controls anchored at the bottom (Task 4 covers controls). Replace generic circular avatars with a name + state row that includes an inline audio-level bar for the speaking peer — the kind of detail that signals "real product".

**Dependencies:** Task 1

**Files:**
- Modify: `src/components/RoomView.vue`
- Modify: `src/components/ParticipantItem.vue`
- Modify: `src/components/PingIndicator.vue`
- Modify: `src/style.css` (sections: `.room-header`, `.room-subtitle`, `.room-divider`, `.participant-list`, `.participant-item`, `.avatar`, `.you-tag`, `.host-crown`, `.muted-indicator`, `.participant-actions`, `.ping-*`)

**Key Decisions / Notes:**
- Room header: room name in Instrument Serif 20px (display moment); below it, the room code in Geist Mono 13px with a `Copy` button that swaps to a check icon on success (`copyFeedback` ref already exists).
- The current "room-subtitle" pattern (code + copy) is fine — restyle, don't restructure.
- Ping indicator: replace the colored dot+number with three vertical bars (signal-strength glyph) tinted to the existing thresholds (good/medium/bad/none). Same DOM, new SVG.
- Participant row layout: `[ avatar 32px ] [ name + (You) + crown ] [ level bar 48px wide × 4px tall, only when speaking ] [ muted-mic icon ] [ host actions ]`.
  - Avatar becomes a colored monogram on a tinted square (8px radius), not a circle. Color derives from a hash of the display name into a fixed 6-color palette — gives each peer a stable identity across calls.
  - The level bar uses a CSS-only animation when `is-speaking` is true; respects `prefers-reduced-motion`.
  - Speaking state: no green ring around the avatar. Instead, a 2px left-edge bar in `--accent` on the row, plus the animated level bar.
- Host action visibility — **conditional on hover capability:**
  - At `@media (hover: hover) and (pointer: fine)` (desktop, Tauri default): Mute and Kick buttons render with `opacity: 0`; the row's `:hover` lifts opacity to 1. No `…` overflow button rendered.
  - At `@media (hover: none)` (touch surfaces — relevant for the webapp on mobile): Mute and Kick are hidden; a single `…` overflow button is always visible at the right edge of the row. Tapping it opens a small popover with the same actions.
  - Implementation: render both the inline buttons (`.participant-actions`) and the overflow button (`.participant-overflow`); use the media queries above to show exactly one set. No JavaScript hover detection.
- Room divider: replace the 1px line with a soft `--fg-3` to `transparent` gradient that fades from full width to 60% — small detail, removes the "table row separator" feel.

**Definition of Done:**
- [ ] Room name renders in Instrument Serif, room code in Geist Mono.
- [ ] Ping indicator is a 3-bar SVG, not a dot+number; bars colored per existing threshold.
- [ ] Participant avatar is a square with 8px radius, not a circle.
- [ ] Each peer's avatar color is stable across renders (deterministic from name hash).
- [ ] When `isSpeaking` and not muted: row shows a 2px accent left-edge bar AND an animated level bar.
- [ ] When `isMutedPeer`: muted-mic icon visible, level bar hidden, row opacity reduced.
- [ ] At `@media (hover: hover)`: host action buttons (Mute/Kick) appear on row hover, and the `…` overflow button is hidden.
- [ ] At `@media (hover: none)`: host action buttons are hidden, and the `…` overflow button is always visible and opens a popover with the same actions.
- [ ] Self row still shows `(You)` tag and the host crown when applicable.
- [ ] No regressions: `peerCountLabel`, `state.peerList`, `state.speakingPeers`, `state.mutedPeers` all still drive the UI correctly.

**Verify:**
- `npm run tauri dev` → create a room → confirm header renders correctly.
- Open the webapp in a second browser tab, join the same room → confirm the second peer appears with a stable color.
- Speak into the mic → confirm the level bar animates on the speaking peer's row.
- Click `Copy` → confirm the icon swaps to a check for ~1.5s.

---

### Task 4: Room interactions — RoomControls, ChatPanel, banners

**Objective:** Replace the three identical-circle control bar with an intentional control surface where the mute button is dominant and contextual (the verb you press most), and "Settings" / "Leave" are secondary. Rebuild Chat as a real messaging surface — sender chips, time hints, distinct self vs. other bubbles, smooth empty state. Make the reconnecting / force-mute banners feel like product affordances rather than CSS toasts.

**Dependencies:** Task 1, Task 3 (shares room context)

**Commit:** `feat(ui): redesign Tauri app — entry flow, room screen, interactions`

**Files:**
- Modify: `src/components/RoomControls.vue`
- Modify: `src/components/ChatPanel.vue`
- Modify: `src/components/RoomView.vue` (banner regions only)
- Modify: `src/style.css` (sections: `.room-controls*`, `.btn-mute-circle`, `.btn-leave-circle`, `.btn-settings-circle`, `.notice-banner`, `.reconnecting-banner`, `.reconnecting-pulse`, `.room-tabs`, `.chat-*`)

**Key Decisions / Notes:**
- Control bar layout: a single rounded "dock" (`--radius-lg`, `--bg-2` with a soft top hairline) containing:
  - `[ Settings 36px ]` `[ ─── Mute 64px primary ─── ]` `[ Leave 36px ]`
  - Mute is a pill (not a circle): wider, with a small `Mic`/`MicOff` icon + a thin level bar underneath. The level bar is a **CSS-only presence indicator** — `state.selfSpeaking` is a boolean (existing VAD signal); when true and not muted, apply a looping width pulse keyframe (e.g., 40% → 80% → 40% over 600ms, eased). Do not wire a float audio level into the room dock — that data does not exist in shared state and is not worth adding. When muted, the pill turns `--danger`, the icon flips to MicOff, and the pulse stops.
- Leave button: icon only, on hover the icon AND the surrounding chip turn `--danger`. Keyboard activation works.
- Settings button: icon only, persistent active state when modal open (already wired via `state.showSettings`).
- Chat panel:
  - Empty state: a single line in `--fg-3` "No messages yet — say hi" with a 1-line eyebrow ("CHAT").
  - Message bubbles: self bubble uses `--accent` tinted background (rgba .12) and `--fg-0` text; other-bubble uses `--bg-2`. Sender label sits **outside and above** the bubble for non-self (small, `--fg-2`, mono).
  - Time hint: relative ("2m", "just now") shown next to sender label for non-self, top-right for self. Compute client-side from **`msg.timestamp`** — this is an existing numeric field on the `ChatMessage` interface (see `src/types.ts:44`). Use `Date.now() - msg.timestamp` to derive the relative string. Do NOT parse `msg.id` — it is an opaque string with no guaranteed timestamp prefix.
  - Send button: integrated into the input chip instead of floating outside — a single rounded chip with `[ input ……… ▶ ]`.
  - Apply `user-select: text` to chat bubbles (override the global `user-select: none`).
- Reconnecting banner: replace the orange filled bar with a softer pattern — pill at top of the room area, dot pulsing, copy in `--fg-1`.
- Force-mute banner: same pill treatment in `--warning` tint, auto-dismisses after 4s (current behavior already exists; preserve).

**Definition of Done:**
- [ ] Control bar is a single dock element, not three separate circles spaced by gap.
- [ ] Mute button is wider than Settings/Leave and shows a CSS-only width-pulse animation under the icon when `state.selfSpeaking === true && !state.isMuted` (no audio-level float wired).
- [ ] The pulse animation stops when muted; pill turns `--danger` and uses MicOff icon.
- [ ] Chat input + send button are a single rounded composite chip; the send icon is disabled visual state correct when input is empty.
- [ ] Chat self bubbles use the new accent tint; other bubbles use `--bg-2` with sender label above (not inside).
- [ ] Chat text is selectable (verify drag-select works in DevTools).
- [ ] Empty chat state renders the new "No messages yet — say hi" treatment.
- [ ] Reconnecting banner is a pill at the top, not a full-width filled bar.
- [ ] All existing emits/state hooks unchanged: `toggle-mute`, `leave`, `sendChatMessage`, `state.activeRoomTab`, `state.chatUnread`.

**Verify:**
- `npm run tauri dev` → join a room → toggle mute → confirm visual states.
- Send a chat message → confirm self bubble + selectable text.
- Trigger a reconnect (kill wifi briefly) → confirm banner shows then clears.
- Click Settings → confirm modal opens and the Settings chip shows active state.

---

### Task 5: Settings modal + form controls

**Objective:** Bring the SettingsModal and its sub-controls (MicSelector, SpeakerSelector, ShortcutSettings, HostControls) up to the design system level. The current modal works but feels like a stack of styled form inputs; the redesign gives it real section rhythm, a refined toggle/slider/select set, and clearer host-controls grouping.

**Dependencies:** Task 1, Task 4 (settings overlay is opened from the room controls)

**Files:**
- Modify: `src/components/SettingsModal.vue`
- Modify: `src/components/MicSelector.vue`
- Modify: `src/components/SpeakerSelector.vue`
- Modify: `src/components/ShortcutSettings.vue`
- Modify: `src/components/HostControls.vue`
- Modify: `src/style.css` (sections: `.settings-overlay`, `.settings-modal*`, `.section-divider`, `.mic-selector*`, `.noise-toggle`, `.toggle-*`, `.range-row`, `input[type="range"]`, `.mic-level-meter`, `.btn-mic-test`, `.btn-lock`, `.shortcut-*`)

**Architectural cleanup (do this first in Task 5):**

`SettingsModal.vue` today inlines the host-controls password block (lines 119–144) — it imports nothing from `HostControls.vue`. The standalone `HostControls.vue` file exists but is unused dead code. As part of this task:

1. Cut the inline host-controls block (the `v-if="state.isHost && state.currentView === 'room'"` section divider + setting-group) out of `SettingsModal.vue`.
2. Move the same logic + new styling into `HostControls.vue` (component owns its own `roomPassword` ref, `setRoomPassword()`, and the conditional rendering).
3. In `SettingsModal.vue`, import and render `<HostControls />` in place of the removed inline block.
4. The `roomPassword` ref in `SettingsModal.vue` becomes unused — delete it.

After this task, there must be **exactly one** place in the codebase that renders host-password UI: `HostControls.vue`.

**Key Decisions / Notes:**
- Modal:
  - Drop the centered-card-with-overlay pattern; the modal slides up from the bottom edge with `transform: translateY(100%)` → `0`, takes **100% of the `.container` height** (not 90% of viewport — the `.container` already accounts for the 380×600 window), and the title bar becomes a `cancel` (X) + section title. Feels native to a desktop voice-chat app.
  - **Z-order + pointer-events:** `.settings-overlay` sits at `z-index: 100` (existing) with `pointer-events: auto`; the underlying `RoomControls` and `ChatPanel` are below at the default stacking and become inert while the overlay covers them. Verify by attempting to click `Leave` while the modal is open — nothing should happen.
  - Section dividers: replace the current "label + horizontal line" with a quiet eyebrow (`SECTION` in Geist 11px uppercase + 0.08em letter-spacing, `--fg-2`) and 8px breathing room.
- Toggles (`.noise-toggle` + AGC): redesign the track to be slimmer (32×18 → 28×16), with a subtle border in `--bg-3`. When on, the track is `--accent`, thumb is `--fg-0` with a tiny inner shadow.
- Range slider (voice sensitivity): redesign the track + thumb. The thumb is a 14px circle with a 2-pixel halo of `--accent-glow` on hover; track shows a filled accent portion on the left of the thumb so the value is readable.
- Mic level meter: replace the green gradient with a segmented meter — 12 cells, each `2px × 4px` with `gap: 2px`. Cells light up sequentially from `--success` → `--warning` → `--danger` at the top, like a real VU meter. Decay is smooth.
- Selects (mic + speaker): replace the custom triangle SVG arrow with a proper `Chevron` icon (lucide), and increase padding to match the new input height.
- Shortcut button: keep its "Recording…" pulse, but make the resting state look like a key cap (subtle inset shadow, mono font).
- Host controls section visible only when `state.isHost && state.currentView === 'room'`. Group it visually with a distinct, slightly elevated card (`--bg-2` panel, 12px padding).
- **Escape key wiring (new affordance):** In `SettingsModal.vue`, add `onMounted(() => document.addEventListener('keydown', onKey))` and `onUnmounted(() => document.removeEventListener('keydown', onKey))`. `onKey` checks `e.key === 'Escape'` and emits `close`. Because the modal is `v-if`-rendered, the listener exists only while the modal is mounted — no leak. Do not attach to `window`; use `document` for consistency with how other Vue 3 modal patterns handle escape.

**Definition of Done:**
- [ ] Settings modal slides up from the bottom (transform translate), respects `prefers-reduced-motion`.
- [ ] Eyebrow section dividers replace the current line-divider pattern.
- [ ] Toggle switches use the new track/thumb sizing and accent-on color.
- [ ] Voice sensitivity slider thumb has a hover halo and a filled accent portion left of the thumb.
- [ ] Mic level meter is a segmented bar (12 cells), color-graded from success → warning → danger.
- [ ] Mic + Speaker selects use a `Chevron` icon from lucide (not the SVG data URL).
- [ ] Shortcut button has a key-cap resting style and preserves the "Recording…" pulse.
- [ ] Host controls section is grouped in a distinct elevated card.
- [ ] All existing settings still persist correctly via the existing `localStorage` keys (`entavi:noiseSuppression`, `entavi:voiceSensitivity`, etc.) and call the same Tauri functions.
- [ ] Closing via the X button, overlay click, or `Escape` all work. The Escape listener is registered in `onMounted` and removed in `onUnmounted` on the modal component (verified by checking the source).
- [ ] `SettingsModal.vue` no longer contains an inline `.password-row` / `.btn-lock` block — that UI lives exclusively in `HostControls.vue`, rendered as `<HostControls />` inside the modal.
- [ ] `grep -n 'roomPassword\|btn-lock\|password-row' src/components/SettingsModal.vue` returns no matches.
- [ ] While the modal is open, clicks on the underlying `Leave` / `Mute` / chat input do NOT activate them (the overlay blocks pointer events). Verified manually.

**Verify:**
- `npm run tauri dev` → open Settings → toggle each control → confirm `localStorage` updates (DevTools → Application → Local Storage).
- Adjust voice sensitivity → confirm Tauri receives the new threshold (existing `tauri.setVadThreshold` is called).
- Set a global shortcut, restart the app, confirm it persists.
- Press `Escape` while Settings is open → confirm the modal closes.

---

### Task 6: Webapp window shell + titlebar

**Objective:** The webapp wraps the shared components inside a fake 380×600 desktop window (`web/src/window.css`). Bring that shell up to the new aesthetic — softer shadow, accent-tinted border, refined titlebar — so the browser-hosted version feels like a deliberately framed product preview rather than a CSS chrome experiment.

**Dependencies:** Task 1 (tokens), Task 2–5 (the contents must already look right)

**Commit:** `feat(ui): redesign settings modal and webapp window shell`

**Files:**
- Modify: `web/src/window.css`
- Modify: `web/src/App.vue` (template only — titlebar markup AND the inline `<header v-if>` block that mirrors `src/App.vue`; drag logic untouched)
- Modify: `web/index.html` (favicon + title only)

**Key Decisions / Notes:**
- Body background: replace `#0f0f1a` with a soft accent-tinted radial wash — `radial-gradient(800px at 50% 30%, rgba(124, 108, 255, 0.05), transparent 60%) #0a0a12`. Makes the framed window feel "on a desk", not floating in a void.
- Window shell:
  - Width 380px, height 600px (same dimensions — anyone embedding the demo expects this size).
  - Shadow: layered — `0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)`.
  - Border-radius up to 14px to match the new app radius scale.
- Titlebar:
  - Stays 36px tall, draggable behavior unchanged.
  - Add the macOS-style traffic-light dots on the left (red/yellow/green), but **disabled-styled** by default; the green dot becomes a tiny "live" indicator (`--success`) only when `state.currentView === 'room' && !state.isReconnecting`. Subtle and only present when meaningful.
  - Center title: small wordmark "entavi" in Geist 12px `--fg-2` instead of the generic "Entavi" label.
- Page title (`<title>`) reads "Entavi · Web" in `web/index.html`.
- **Header parity with Tauri app:** `web/src/App.vue` has its own `<header v-if="state.currentView === 'home'">` block with the old `<h1>Entavi</h1>` + `<p class="subtitle">` markup. Replace this block with the exact same markup as Task 2 introduced in `src/App.vue` — `<h1 class="wordmark">` + `<p class="wordmark-eyebrow">` + version pill. The styles come from `src/style.css` (which both surfaces import); no webapp-specific CSS is needed for this. If the version pill in the webapp doesn't have a meaningful value (the webapp may not have access to `getVersion()` from `@tauri-apps/api`), omit it gracefully — show nothing rather than `v(undefined)`.
- **SettingsModal availability — explicit decision:** Today, `web/src/App.vue` does NOT mount `<SettingsModal />`, so clicking Settings in the webapp toggles `state.showSettings` but nothing renders. **Decision: webapp omits the SettingsModal by design** in this pass. The reasons: (a) most settings (`setVadThreshold`, `setNoiseSuppression`, `setAgc`, `setOutputDevice`, `setShortcut`) have no useful webapp equivalent because the webapp uses the browser's own audio pipeline; (b) `useWeb` does not implement these IPC commands. Update `HomeView.vue` from Task 2 so the `Settings` link is **conditionally hidden in the webapp** — detect via `typeof window.__TAURI_INTERNALS__ !== 'undefined'` (this global is set by the Tauri runtime; absent in the webapp). Add this as `state.isTauriHost` boolean on `useAppState` initialization, or check inline in the template. Document this as an Open Question (a future webapp could surface a slim subset of settings — display name, theme).

**Definition of Done:**
- [ ] Body shows the new soft radial wash background.
- [ ] Window shell has the layered shadow and 14px radius.
- [ ] Titlebar shows three traffic-light dots on the left; the green dot becomes "live" (success color) when in a room.
- [ ] Drag-to-move still works (existing `onTitleBarDown` logic untouched).
- [ ] The webapp visually consumes the same component styles as the Tauri app — confirm by side-by-side comparison of the Home screen.
- [ ] `web/src/App.vue` `<header>` renders the wordmark in Instrument Serif and the eyebrow, visually matching the Tauri Home screen (no remaining `<h1>Entavi</h1>` plain text in the webapp).
- [ ] In the webapp Home screen, the `Settings` link is hidden (because `__TAURI_INTERNALS__` is undefined); in the Tauri app it is visible. Verified by opening both surfaces.
- [ ] No new errors in browser console.

**Verify:**
- `cd web && npm run dev` → http://localhost:5173 → confirm window renders correctly.
- Drag the titlebar → window follows the cursor.
- Join a room (or simulate `state.currentView = 'room'`) → confirm the green "live" dot lights up.

---

### Task 7: Website foundation — extract CSS, nav, hero, app preview

**Objective:** Decompose the 1,435-line monolithic `website/index.html` so the website can share a design language with the app. Extract the inline `<style>` block into a real `website/styles.css`, import the new design tokens, and rebuild the nav + hero. The hero gets a true product-feel treatment — display serif headline, a single confident CTA, and an embedded mockup that **mirrors the new Room screen** (not the old one).

**Dependencies:** Task 1 (tokens), Task 3 (the mockup mirrors the new Room screen)

**Files:**
- Create: `website/styles.css`
- Modify: `website/index.html` (replace inline `<style>` with `<link>`; rewrite `<nav>` and `<section class="hero">`)
- Optionally: `website/favicon.svg` (reuse — colors auto-update via `currentColor` if present)

**Key Decisions / Notes:**
- `styles.css` opens with `@import` of Google Fonts (Instrument Serif + Geist + Geist Mono) — the website runs without npm deps, so self-hosted fonts aren't an option here. The Tauri/web app continues to use `@fontsource`.
- Tokens duplicated in the website CSS as `:root` variables (single source of truth lives in `src/style.css`; copy them here verbatim with a comment "Mirrors src/style.css — keep in sync"). This is a deliberate copy because the website doesn't share a build with the app.
- Nav:
  - Sticky, frosted-glass via `backdrop-filter: blur(20px) saturate(140%)`.
  - Left: wordmark in Instrument Serif (28px), no logo glyph — typographic identity.
  - Right: 3 quiet text links + a single primary "Download" CTA pill.
  - Mobile menu hamburger preserved; the menu drawer slides from the right (not top), uses the new tokens. **Preserve the existing `id="navLinks"` on the `<ul>` element** — the hamburger button uses `onclick="document.getElementById('navLinks').classList.toggle('open')"` inline. If renaming, update both call site and target in the same commit. Verify at 375px viewport.
- Hero:
  - Headline (Instrument Serif, fluid `clamp(2.4rem, 6vw, 4.4rem)`, line-height 1.05, slight negative letter-spacing): **"Voice calls that don't go through anyone."**
  - Sub (Geist, 17px, `--fg-1`, max-width 560px): "Entavi is peer-to-peer. Audio flows directly between you and your friends — no accounts, no servers in the middle, no AI listening."
  - Single primary CTA (Download for your OS — auto-detect via `navigator.platform`, with a small "All platforms" link beneath) — not the current four-equal-buttons row.
  - Background: a soft `--accent-glow` orb in the upper third (already exists in the current hero — refine the gradient stops).
  - **App preview block** — concrete implementation:
    - Use an **HTML div tree** (not inline SVG, not a screenshot). The website does not run Vue, so the preview is a static DOM replica.
    - Container `.preview-window`: 280px wide, scaled with `transform: scale(1.15)` on desktop viewports so it reads as a "device" sitting in the hero area. Border-radius, shadow, and the three traffic-light titlebar dots mirror Task 6's webapp window shell.
    - Contents: room name `Friday Calls` in Instrument Serif; room code `ax7-q9k` in Geist Mono; 3 participant rows — each `[ 24px colored avatar square ] [ name in Geist ] [ 32px×3px CSS level-bar div, animated on one row ]`; a dock at the bottom with three buttons matching the new RoomControls layout (Settings icon · wider Mute pill · Leave icon).
    - All colors via `var(--…)` tokens from `website/styles.css` so the preview cannot drift from the actual app palette.
    - The CSS for the preview lives under a `.preview-*` class namespace in `website/styles.css` — never reuse `.participant-item` or `.room-dock` class names (those names also live in `src/style.css`; reusing them here would couple the two stylesheets).
    - No JavaScript required.

**Definition of Done:**
- [ ] `website/index.html` no longer contains an inline `<style>` block longer than 20 lines (any remaining inline styles are critical above-the-fold only).
- [ ] `website/styles.css` exists, contains the token block, and is loaded via `<link rel="stylesheet">`.
- [ ] Nav uses Instrument Serif for the wordmark and renders sticky/frosted.
- [ ] Hero headline uses the new copy ("Voice calls that don't go through anyone.") in Instrument Serif.
- [ ] Download CTA is a single primary button (auto-detect OS) + an "All platforms" link, replacing the current 4-button row.
- [ ] App preview block exists as an HTML div tree (verify via View Source: no `<svg>` element for the preview, no `<img>` of a screenshot).
- [ ] Preview contains: a room name in Instrument Serif, a Geist Mono room code, 3 participant rows with colored square avatars, one animated CSS level-bar, and a 3-control dock (Settings · wider Mute · Leave) — visually matching Task 3 / Task 4 designs.
- [ ] Preview uses `.preview-*` namespaced classes (no reuse of `.participant-item`, `.room-dock`, `.btn-primary`, etc.).
- [ ] Above-the-fold renders correctly on a 1280×800 viewport; no horizontal scroll.

**Verify:**
- `npx serve website` (or open `website/index.html` directly) → confirm nav + hero render.
- View page source → `<style>` block is < 20 lines.
- `curl -I http://localhost:3000/styles.css` (or equivalent) returns 200.
- Open in 375px-wide viewport → no horizontal scroll, mobile menu button visible.

---

### Task 8: Website body sections — features, how-it-works, security

**Objective:** Rebuild the three middle sections to drop the "AI dashboard" feel: replace 3-column rounded-card grids with something more editorial. Use asymmetric layouts, real typography moments, and intentional density variation between sections.

**Dependencies:** Task 7

**Files:**
- Modify: `website/index.html` (sections `#features`, `#how-it-works`, `#security`)
- Modify: `website/styles.css` (the corresponding section styles)

**Key Decisions / Notes:**
- Section eyebrow pattern across the site: a tiny mono label in `--fg-2` (`01 / FEATURES`), display-serif heading, sub in body type. Eyebrows include a section number — small, but it's the kind of detail that says "we designed this".
- Features:
  - Replace the 3-column card grid with a mixed grid: 1 hero feature ("Direct peer-to-peer audio") taking a wider span with an inline diagram, then 4 secondary features in a 2-column grid below, with text-first cards (label + sentence, minimal chrome).
  - Each feature card: no border, just a hairline top-rule and 24px padding. Remove the colored icon backgrounds.
- How it works:
  - Replace the 3-equal-step blocks with a vertical timeline: a thin vertical accent line on the left, three numbered nodes, generous spacing. Reads like a recipe, not a feature grid.
- Security:
  - Two-column existing layout is fine — restyle. Left column gets the checklist (use a Lucide `Check` in a small accent-tinted square, not a green-bg circle). Right column gets the tech stack tags as inline mono chips, not pills.
  - Add a single pull-quote between the columns at desktop widths: a short, italic Instrument Serif callout (e.g., "There is no Entavi server holding your audio.").

**Definition of Done:**
- [ ] Each section has an eyebrow with a section number (e.g., `01 / FEATURES`).
- [ ] Features section uses a 1-large + 4-small asymmetric grid, not 3 equal columns.
- [ ] Features cards have hairline top-rules, not full borders or background fills.
- [ ] How-it-works renders as a vertical timeline with a thin accent line and numbered nodes.
- [ ] Security section keeps two columns at ≥960px, stacks at <960px.
- [ ] Pull-quote renders between the security columns at desktop widths.
- [ ] All sections respect the new spacing scale (no arbitrary px values).

**Verify:**
- Open the website → scroll through sections → confirm visual hierarchy.
- Resize browser to 800px width → confirm the security two-column collapses cleanly.
- DevTools → toggle `prefers-reduced-motion` → confirm no animations run.

---

### Task 9: Website tail + responsive + motion polish

**Objective:** Rebuild the remaining three sections (self-host, FAQ, footer), then do a comprehensive responsive + motion pass across the whole website. This is where the website becomes a coherent thing rather than a sequence of sections.

**Dependencies:** Task 7, Task 8

**Commit:** `feat(ui): redesign marketing website with shared design system`

**Files:**
- Modify: `website/index.html` (sections `#self-host`, `#faq`, `<footer>`)
- Modify: `website/styles.css` (corresponding sections + responsive blocks + motion)

**Key Decisions / Notes:**
- Self-host section:
  - Numbered steps remain, but the number bubbles become small mono chips (`01`, `02`) instead of solid accent circles. Code blocks get a real treatment — `--bg-2` background, mono font, copy-to-clipboard button that uses the same Copy/Check swap as the app's room-code copy (consistency between surfaces).
  - **Clipboard JS implementation:** Add a small `<script>` block near the end of `website/index.html` (≤ 25 lines) that runs `document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => { await navigator.clipboard.writeText(btn.dataset.copy); /* swap icon for 1.5s */ }))`. Each code block has a button with `data-copy="<the code>"`. **Caveat:** `navigator.clipboard` requires HTTPS or `localhost` — it throws on `file://`. The verify step uses `npx serve website` (a local HTTP server), not direct file open. Add a graceful failure: if the API throws, show "Copy failed" briefly instead of leaving the icon hung.
- FAQ:
  - Replace the current `max-height: 0 → 300px` accordion (which clips long answers) with a `details/summary` semantic accordion. Use a CSS-only chevron rotation. Removes a JS dependency and is keyboard-accessible by default.
- Footer:
  - Three columns at desktop: wordmark + tagline, links, build info (version, commit short hash if available, "made with care" line). Stack to single column below 720px.
  - Bottom hairline + a subtle row with the year and a single quiet "github" link.
- Responsive:
  - Single breakpoint at 720px (single source of truth). Below: nav collapses, sections stack, hero scales down via the existing `clamp()`, app preview scales to 90% width with max 380px.
  - All touch targets ≥ 44px (verify nav links, FAQ summaries, CTAs).
- Motion polish (page-load reveal):
  - Use **IntersectionObserver** (not `@starting-style` — browser support is incomplete as of May 2026: Firefox still lacks it). A tiny inline script (≤ 20 lines) in the `<head>` toggles a `.revealed` class on each `<section>` when it enters the viewport.
  - CSS: sections default to `opacity: 0; transform: translateY(12px)`; `.revealed` sets `opacity: 1; transform: none` with `var(--dur-slow)` transition.
  - Respect `prefers-reduced-motion: reduce` — when matched, the inline script adds `.revealed` to every section immediately at script start (no IntersectionObserver registered), so content is visible without animation.
- Accessibility pass:
  - Every `<section>` has a heading; landmark `<main>` wraps the body content.
  - All images / SVGs have explicit `alt` or `aria-hidden="true"`.
  - Color contrast verified: 4.5:1 for body text, 3:1 for large text.
- **Mockup re-sync with final Room screen (do this FIRST in Task 9):** The hero app-preview block from Task 7 mirrored Task 3's Room screen design. Between then and now, Task 4 (controls + chat) has been implemented and may have shifted layouts (control dock width, level-bar size, participant row density). Before finalizing the website, open the actual Tauri app at the Room screen and compare side-by-side with the website mockup. Update the mockup HTML/CSS in `website/index.html` + `website/styles.css` to match the as-shipped Room screen. The mockup is the visual proof to visitors — it must not lag the product.
- **Token sync between `src/style.css` and `website/styles.css`:** Both stylesheets carry their own `:root` token block (deliberate, because the website does not import `src/style.css`). After all earlier tasks, run a diff: `diff <(grep -E '^\s+--' src/style.css | sort) <(grep -E '^\s+--' website/styles.css | sort)`. Any divergence is an error — update `website/styles.css` to match `src/style.css` token values. Document this as a recurring chore in a comment block at the top of `website/styles.css`.
- **FAQPage JSON-LD update:** `website/index.html` contains a `FAQPage` schema in a `<script type="application/ld+json">` block (around lines 919–967) that hardcodes the current FAQ question/answer pairs. If any FAQ question text changes during this task, update the JSON-LD verbatim. Mismatch between schema and visible HTML causes Google to suppress the rich snippet — silent SEO loss.

**Definition of Done:**
- [ ] Self-host steps use mono chip numbers; each code block has a working copy button — clicking it writes the code to the clipboard (verified by paste-into-terminal) and the icon swaps to a check for ~1.5s.
- [ ] The clipboard script handles `navigator.clipboard` failure gracefully (no UI hang if API throws).
- [ ] FAQ uses semantic `<details>/<summary>` (verify with View Source).
- [ ] FAQ is keyboard-accessible by default (tab + Enter to expand).
- [ ] Footer is 3-column at ≥720px, single column below.
- [ ] At 375px width: no horizontal scroll on any section.
- [ ] At 1440px width: max content width is 1100px (matches existing nav width).
- [ ] All touch targets are ≥44px (verify in DevTools).
- [ ] Scroll-reveal animation runs once per section, staggered.
- [ ] `prefers-reduced-motion: reduce` disables all animations.
- [ ] Lighthouse Accessibility score on the website ≥ 95 (run from DevTools).
- [ ] Hero app-preview mockup matches the as-shipped Room screen — side-by-side comparison with Tauri app at Room view.
- [ ] `diff` of `:root` token blocks in `src/style.css` vs `website/styles.css` returns no token-name or value mismatches.
- [ ] If any FAQ question text was edited, the matching JSON-LD `FAQPage` schema in the `<head>` is updated verbatim — verified by grep matching each `<summary>` text against the JSON-LD `Question.name` values.

**Verify:**
- `npx serve website` → scroll the full page → confirm animations run.
- Open in 375×667 viewport → confirm no horizontal scroll, mobile nav works.
- Use keyboard only to tab through the page, expand each FAQ, click each link.
- DevTools → Lighthouse → run Accessibility audit → confirm ≥95.
- DevTools → enable `prefers-reduced-motion` → reload → confirm no animations play.

---

## Testing Strategy

- **Unit tests:** None. This is a presentation-layer change; there is no test infrastructure in the current repo (no test scripts in `package.json`), and adding one is out of scope. Visual + interaction verification covers the work.
- **Manual verification (Tauri app):** Per task, run `npm run tauri dev` and exercise the affected screens (Home → Create → Room flow, Settings, chat). Confirm all existing user flows still function — no Tauri/IPC behavior should change.
- **Manual verification (webapp):** `cd web && npm run dev`, open the URL with `playwright-cli -s="$(pocket session-id)"`, snapshot each screen, verify visual parity with the Tauri app for shared components.
- **Manual verification (website):** `npx serve website`, exercise each section, run a Lighthouse accessibility audit (target ≥95), test at 375px, 800px, 1280px, 1440px viewport widths.
- **Regression check after each task:** Click through Home → Create → Room → toggle mute → open Settings → close Settings → leave room. Any flow that breaks is a stop-and-fix.

## Risks and Mitigations

| Risk                                                                                  | Likelihood | Impact | Mitigation                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global CSS collisions between redesigned components (`src/style.css` is unscoped)     | Med        | Med    | After each task, click through every other unchanged screen. If a class name is reused, namespace it (e.g., `.btn-mute-circle` → `.room-mute`). Catch in Task 4 verification before commit.                |
| New fonts (Instrument Serif / Geist) fail to load in offline scenarios                | Med        | Low    | Self-host via `@fontsource` for the app; both fonts ship as variable WOFF2. Fall back to `system-ui` / `ui-serif` in the `font-family` stack. Website only — uses Google Fonts CDN with `font-display: swap`. |
| Speaking-state animation hurts perceived audio latency or distracts from speech       | Med        | High   | Animation runs strictly off `state.speakingPeers` (existing VAD signal). Keep level-bar update at ≤30fps; respect `prefers-reduced-motion`. Verify in Task 3 that the bar moves with VAD, not on a timer.   |
| Settings modal slide-up animation interferes with bottom RoomControls                 | Low        | Low    | When modal is open, RoomControls keep their position but are inert (already behind the overlay). Verify no layout shift on open/close.                                                                       |
| Selectable chat text breaks drag-to-move on the webapp titlebar                       | Low        | Med    | The titlebar `onTitleBarDown` already excludes `.titlebar-btn`. Confirm chat bubbles' `user-select: text` does not propagate to the titlebar (different DOM subtree). Verify in Task 4 + Task 6.            |
| Auto-detect OS download button picks wrong asset for Linux variants                   | Low        | Low    | Fall through to a generic "All platforms" pill below the primary CTA. If `navigator.platform` is unrecognized, hide the auto-detect button and show only "All platforms".                                  |
| Webapp + Tauri app drift visually because they share components but reload separately | Low        | Med    | Both consume the same `src/style.css`. The webapp imports it transitively via the shared component imports — verified in Task 6.                                                                            |
| FAQ semantic `<details>` animation behaves differently across browsers                | Low        | Low    | Use the standard `details[open]` selector + a CSS-only chevron rotation; no JS-driven height animation. If a browser lacks smooth animation, content still expands/collapses correctly.                     |
| Lighthouse a11y score < 95 due to color contrast on `--fg-2` text                     | Med        | Med    | Verify `--fg-2: #7c7a96` on `--bg-1: #0f0f17` is ≥4.5:1 in Task 1. If not, darken background or lighten `--fg-2` until threshold met. Re-verify in Task 9.                                                  |
| Inline 1,435-line `index.html` rewrite in Tasks 7–9 introduces broken `<a href>` links | Med        | Med    | Diff the final HTML against the original; every nav anchor (`#features`, `#how-it-works`, `#security`, `#self-host`, `#faq`) must still resolve to a section with the same id. Verify in Task 9.            |

## Goal Verification

### Truths (what must be TRUE for the goal to be achieved)

- The Tauri app, the webapp, and the website share a single visible design language — colors, type, spacing, motion all match.
- No screen on any surface contains the AI tells called out in the frontend standards (Inter on the website, evenly-distributed 3-column rounded-card grids, gradient text without purpose, etc.).
- A first-time visitor to the website sees a hero that uses display typography and a single confident CTA — not a four-button download bar.
- The in-room screen makes "who is speaking" instantly readable through the level-bar + edge-bar treatment, not just an avatar ring.
- Every existing user flow (create, join, mute, leave, chat, settings, host controls) continues to work without behavioral change.
- The website passes a Lighthouse accessibility audit at ≥95.

### Artifacts (what must EXIST to support those truths)

- `src/style.css` — contains the new token block at top, zero hex literals below.
- `src/main.ts` — imports the font CSS for Instrument Serif + Geist + Geist Mono.
- `src/components/HomeView.vue`, `CreateView.vue`, `JoinView.vue`, `RoomView.vue`, `RoomControls.vue`, `ParticipantItem.vue`, `ChatPanel.vue`, `SettingsModal.vue` — all updated templates with no `console.log`, no commented-out blocks.
- `web/src/window.css` — new shell + titlebar styles using the shared tokens.
- `website/styles.css` — new file, mirrors `src/style.css` tokens, contains all website styles.
- `website/index.html` — no inline `<style>` block longer than 20 lines; sections rewritten per Tasks 7–9.

### Key Links (critical connections that must be WIRED)

- `src/main.ts` → imports `src/style.css` AND the new font CSS (without this, fonts don't load).
- `web/src/main.ts` → already imports `src/style.css` + `web/src/window.css` → continues to render the shared components correctly.
- `RoomControls.vue` `@toggle-mute` emit → still wired to `App.vue`'s `toggleMute()` which calls `tauri.setMuted()`.
- `ParticipantItem.vue` props (`isSpeaking`, `isMutedPeer`) → still driven by `state.speakingPeers` and `state.mutedPeers` in `useAppState.ts`.
- `SettingsModal.vue` controls → still write to `localStorage` keys (`entavi:displayName`, `entavi:noiseSuppression`, `entavi:voiceSensitivity`, `entavi:agc`, `entavi:outputDevice`, `entavi:shortcutToggleMute`, `entavi:shortcutPushToTalk`, `entavi:signalingUrl`) and invoke the same `tauri.*` functions.
- Website `<nav>` anchor links (`#features`, `#how-it-works`, `#security`, `#self-host`, `#faq`) → resolve to sections with matching `id` attributes.

## Open Questions

- Should the wordmark stay as the text "Entavi" or get a custom monogram glyph? Plan assumes text-only (the existing `app-icon.png` is fine for the OS icon; the in-app wordmark stays typographic). Confirm during Task 2 verification — easy to add a glyph later.
- The website hero copy ("Voice calls that don't go through anyone.") is a recommendation — the user may want to adjust. Treat as a proposal during Task 7 review.

### Deferred Ideas

- **Webapp settings surface** — currently `web/src/App.vue` never mounted `SettingsModal`, and this plan formalizes that by hiding the Settings link in the webapp. A future pass could expose a slim subset (display name, dark/light theme, signaling URL) via a webapp-specific modal that doesn't depend on Tauri IPC.
- Light theme — not in scope. If pursued later, the token system in Task 1 is structured to support it (swap `--bg-*` and `--fg-*` under a `[data-theme="light"]` selector).
- Animated peer-joined / peer-left transitions in the participant list — would be a nice touch; deferred to a follow-up.
- A real "settings/preferences" route in the webapp (instead of a modal) — deferred.
- A dynamically rendered version of the app preview on the website (using the actual Vue components instead of a static mockup) — deferred; not worth the build complexity yet.
- Replacing the embedded SVG diagrams in the security/how-it-works sections with motion graphics — deferred.
