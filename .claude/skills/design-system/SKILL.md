---
name: design-system
description: The app's visual language — tokens, colours, typography, spacing, layout shells, component usage, status colours, states, responsive and accessibility rules. Use when building or reviewing any UI in apps/web.
---

# Design system

The quality bar is Linear, Stripe Dashboard and Mercury: calm, fast, precise.

**The approved designs are in `docs/design/claude-design/`** (index in its README; every screen in `docs/design/SCREENS.md` names its board). Token values, the product rules the designer set, and the designer's notes are in `docs/design/DESIGN-NOTES.md`. Open the board before building a screen and match it. They override anything below.

## Screens without a design
`docs/design/SCREENS.md` lists every screen the product needs. Many have no bespoke design, and that's expected. Build them from the patterns below so they look like they were designed:
- **Pick the closest archetype** and copy its layout exactly: *list page* (PageHeader → toolbar → DataTable → pagination), *detail page* (header with key facts and status → tabs → activity timeline on the right), *side-sheet form* (edit), *stepped sheet* (multi-step flow), *settings page* (left sub-nav, sections of label + description + control), *queue* (list with approve/reject actions), *document/PDF* (letterhead, title, parties, table, totals, signature block), *message* (from, one purpose, amount and date first, one action).
- **Reuse existing components** only; if a genuinely new component is needed, flag it in your report instead of inventing a style.
- **Mark it** in `SCREENS.md` as `pattern`. If it's high-traffic, customer-facing (buyer/realtor portals, PDFs) or the pattern doesn't fit, also mark `needs-design` so it goes into the next Claude Design pass.
- When an approved design arrives later, the screen is updated to match and marked `built`.

## When a design needs to change
Designs are a starting point, not a contract. If real data, a domain rule, accessibility or performance shows a designed screen won't work (e.g. a table that can't fit real column widths, a flow missing an approval step), adjust it using the same patterns, note the change and the reason in `docs/design/CHANGES.md`, and mark the screen `needs-design` if the change is significant.

## UX principles (apply to every screen)
1. **One job per screen, one primary action.** The most important number or status is the first thing seen.
2. **≤ 3 clicks** for common tasks (record receipt, new subscription, add unit, log site diary entry). Every action is also in the ⌘K command palette.
3. **Defaults over settings.** Pre-fill from organization defaults and the last-used values (e.g. the project's price list and default payment plan on a new subscription, receipt date = today).
4. **Progressive disclosure.** Show the essentials, and put advanced fields behind "More options".
5. **Undo over confirm.** Reversible actions run immediately with an undo toast. Confirm only for money movements and permanent deletes, and the confirm button says exactly what happens ("Record ₦2,500,000 receipt").
6. **Inline over modal.** Edit simple fields in place. Use a side sheet for multi-field edits, and a stepped sheet for flows (new subscription, onboarding).
7. **Speak the user's language.** Domain terms from `docs/DOMAIN.md`, plain English, no jargon or codes. Errors say what to do next.
8. **Keyboard and touch.** Shortcuts for power users (`?` shows them). On mobile: bottom navigation, sticky primary action, 44px touch targets.
9. **Feels instant.** Route preloading on hover, skeletons that match the final layout, optimistic UI for safe toggles, no layout shift.
10. **Nothing extra.** Remove any element that doesn't help a user decide or act.

## Excellence checklist (every screen, every form)
The owner's standard is **the best experience imaginable**, everywhere in the app, not just sign-in. Before a screen is done, check each line; if Stripe, Linear, Mercury or Apple would do it better, do it their way.

**Simple first (the owner calls this critical).** World-class here means effortless, never elaborate:
- A new user finishes the screen's main task on the first try, without training or help text.
- One obvious next step; everything else is quieter or behind "More options".
- Plain words from the user's world; no system concepts on screen (flags, plans, entitlements, roles mechanics stay invisible unless the user must act on them).
- When in doubt, remove. A feature that makes a screen harder to understand doesn't ship as is.
- Sophistication lives under the hood (speed, memory of choices, smart defaults), not in extra controls.
- **Simple flow, rich craft.** Simplicity is about the experience (no dead ends, no clutter, obvious next step), never about looking plain. Screens stay classy and creative: considered typography, depth, brand-colour detail, beautiful empty states.

**Forms**
- The right `type`, `inputMode`, `autoComplete` and `name` on every field, so phones show the right keyboard and browsers and password managers fill correctly. Email fields: no spell-check or autocorrect, no auto-capitals; typo help on common domains.
- Cursor in the first field on desktop (pointer: fine) only; never pop the keyboard on phones.
- Enter submits. Paste is always allowed. Leading and trailing spaces are trimmed.
- Validate on blur and on submit, not on every keystroke; focus the first error; each error says what to do.
- Helper content appears when it becomes relevant (e.g. password rules on first keystroke), and nothing above the field moves when it does (reserve space or grow downward).
- Password fields: show/hide, Caps Lock hint, rule checklist, and one toggle for password and confirm.
- Never lose what someone typed: on errors, network failure or session expiry the input stays.
- Defaults and memory: pre-fill from organization defaults and the last-used values (date = today, last project, last bank account); remember per-device preferences such as filters.

**Feedback and states**
- Every action responds visually within 100 ms; buttons show a pending state and can't double-submit.
- Success says what happened and offers the next step; reversible actions get Undo.
- Every data view has designed loading (skeleton in the final layout), empty (one clear action), filtered-empty, error (with retry) and offline states.
- No layout shift, ever.

**Navigation**
- Back and forward work; URLs hold the state (filters, tabs, page) so links can be shared.
- Every action is reachable from ⌘K; power users have shortcuts (`?` lists them).

**Motion and feel**
- Motion explains or delights, never delays: ≤ 250 ms for UI, longer only for ambient brand moments. Everything respects reduced motion.
- Buttons and inputs have hover, focus and pressed states.

**Access and speed**
- WCAG 2.2 AA in light and dark; full keyboard use; 44 px targets on touch.
- Within the performance budgets (first-load JS < 200 KB gzip), fast on a mid-range Android phone on a weak connection.

**Words**
- Short, specific, in the domain's language, and in the owner's voice (`ux-writing` skill). One idea per line; no jargon.

## Tokens (defined in `apps/web/src/styles.css`, consumed via Tailwind)
| Purpose | Token / class |
|---|---|
| Primary action (buttons, links) | `bg-primary text-primary-foreground` (action fill `#5B5CE0`; white on the lighter brand violet fails contrast) |
| Brand (focus, selection, charts, available units) | `ring-ring`, `text-brand`, `border-brand` (`#7677FB`, dark `#8A8BFC`) |
| Page background | `bg-background` (light: slate-50 tone, dark: near-black) |
| Card / surface | `bg-card text-card-foreground border` |
| Secondary text | `text-muted-foreground` |
| Destructive | `bg-destructive`, `text-destructive` |
| Sidebar | `bg-sidebar text-sidebar-foreground` (dark navy in both themes) |
| Status colours | `status-{emerald,amber,blue,rose,slate}` with `-fg` (dark text shade) and `-bg` / `-border` tints, values in DESIGN-NOTES |
| Radius | `--radius: 0.625rem` (10px) for cards, inputs and buttons; `rounded-full` for badges and avatars. Subtle borders over shadows |

**Never** write hex, rgb or arbitrary colour values in components. If a colour is missing, add a token in `styles.css`.

## Typography
**Geist** for headings and the wordmark (`font-heading`, one token in styles.css); **Inter** for body, labels, tables and all numbers (`font-sans`). Both self-hosted via `@fontsource` (never load fonts from third-party servers; check a font's licence allows a public repo before adding it). Scale:
- Display `font-heading text-[40px] font-semibold tracking-[-0.03em]` (hero and executive numbers only), page title `font-heading text-2xl font-semibold tracking-[-0.02em]`, section title `font-heading text-lg font-semibold`
- Body `text-sm`, secondary `text-sm text-muted-foreground`, label `text-xs font-semibold uppercase tracking-wide`, caption `text-xs text-muted-foreground`
- Money and numbers: `tabular-nums font-medium`

## Spacing and layout
- 4px grid. Page padding `p-4 sm:p-6`, gaps between sections `gap-6`, inside cards `p-4 sm:p-6`, form fields `gap-4`.
- App shell: fixed navy sidebar (`w-64`, collapsible to icons) on `lg+` showing only the role's modules, Sheet drawer below `lg`, top bar with search, notifications, theme toggle and user menu (admins can "Preview as role"). On phones, four bottom tabs per role.
- Customer-facing surfaces (buyer and realtor portals, PDFs, emails, receipts, board pack) use the developer's brand via DocumentLetterhead and stay light in dark mode.
- Max content width `max-w-7xl` for forms and detail pages. Lists use the full width.
- Forms: one column on mobile, two columns from `md`, using container queries inside dialogs.

## Components (shadcn only, from `@/components/ui`)
Button (`default`, `secondary`, `outline`, `ghost`, `destructive`; sizes `sm`, `default`, `icon`), Input, Select, Combobox (Command + Popover), DatePicker (Calendar + Popover), Dialog, Sheet, DropdownMenu, Tabs, Table, Badge, Card, Skeleton, Tooltip, Sonner.
App-level: PageHeader, DataTable, DataTableToolbar, StatusBadge, EmptyState, ConfirmDialog, MoneyInput, EntityCombobox, StatCard.
From the designs: CodeInput (one box per digit, paste, error state), PasswordRules, SettingsNav (left sub-navigation for all settings), ChecklistRow (tick-off with owner and detail), PermissionCell (allowed / up to a limit / not allowed), DocumentLetterhead (developer's brand on PDFs and emails), ApprovalRow, TimelineItem (event / before → after / with approver; initials, not photos), ImportSteps, PlotShape (site plan), AiMarker (star + "AI", only on AI-produced content), ConfidenceMeter (bars and a word), AiSuggestionField (accept / edit / reject on a faint violet surface), UsageMeter, MaskedId (with e-KYC states).
Don't create a second version of any of these. Extend with `variant`s via `cva`.

## Status colours (StatusBadge)
| Meaning | Colour | Examples |
|---|---|---|
| Success / done | emerald | active subscription, paid, fully paid unit, completed, granted, verified |
| Waiting / attention | amber | pending KYC, due soon, partially paid, reserved, submitted, permit expiring |
| In progress / info | blue | in construction, in progress, subscribed and paying, allocated, scheduled |
| Problem / ended | rose | overdue, defaulted, cancelled, rejected, flagged, encumbered, expired |
| Neutral | slate | draft, inactive, not started, blocked, handed over, closed, archived |

**Available** units and plots are not a status colour: they carry the brand violet outline, because selecting one is an action.
A badge is a dot plus a label on a tinted background. Never rely on colour alone.

## Developer ERP patterns
- **Unit grid / availability map:** one tile per unit, grouped by block or phase, coloured by unit status (violet outline for `available`; status colours for `reserved`, `subscribed`, `allocated`, `handed_over`, `blocked`, plus rose when a unit's buyer is overdue) with a legend and counts. Filters dim non-matching tiles instead of hiding them, so blocks keep their shape. Tile shows unit number, type and price; click opens the unit side sheet. Never colour alone: status label in the tile tooltip and in list view.
- **Project progress:** phases in order (`site_prep` → … → `handover`) as a segmented bar with % complete, planned vs actual dates, and budget vs actual beside it. Delays show their reason.
- **Payment plan timeline:** instalments in due-date order with amount, due date and derived status badge; received amount and balance at the top. Today's position marked. Overdue shows relative time ("12 days overdue").
- **Title stage tracker:** stepper per parcel (e.g. survey plan → excision gazette → C of O → governor's consent) with stage status, dates and linked documents. An active encumbrance shows a rose warning banner wherever the parcel appears.
- **Money with currency:** `₦1,250,000.00`, `$12,500.00`. Foreign amounts show the NGN equivalent and FX rate in muted text (`≈ ₦19,375,000 at ₦1,550/$, CBN`). Compact form in stat cards (`₦12.5M`). Right-aligned, `tabular-nums`.
- **Dates:** `25 Nov 2026`. Relative time for due dates, delinquency age and permit expiry ("expires in 21 days").
- **Site photos:** lazy-loaded, `srcset`, with date, location and a meaningful `alt`.

## States
Every data view needs loading (skeleton), empty (illustration + action), filtered-empty (clear filters), error (message + retry), and long content (truncate with a tooltip, or wrap).

## Accessibility (WCAG 2.2 AA)
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI parts), checked in both themes.
- Visible focus on everything interactive. Full keyboard use, and focus is trapped in dialogs.
- Labels on every input. `aria-label` on icon-only buttons. Errors linked with `aria-describedby`.
- Touch targets ≥ 44px on mobile. Respect `prefers-reduced-motion`.

## Responsive
Design mobile-first. Test at 375px, 768px and 1280px. No horizontal page scroll. Tables hide secondary columns or switch to cards below `md`.
