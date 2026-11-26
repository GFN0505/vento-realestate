# My security and passkeys (brick 3d)

- **Status:** approved (owner, 26 Nov 2026)
- **Module:** Platform
- **Journeys:** J-ONB-04 (changed: passkey sign-in, recovery), J-ONB-09 (new: secure your own account), J-ONB-10 (new: require two-step for everyone), J-ONB-06 (changed: a two-step reset also removes passkeys)
- **Screens:** see [Screens this slice touches](#screens-this-slice-touches)
- **Decisions:** builds on 0009 (same origin: one passkey domain), 0010 (Better Auth owns identity; the passkey table is an identity table with no `organizationId`), 0011 (append-only audit), 0013 (tab guard), 0016 (availability in the contract); app-shell owner's decisions 1 (3d is its own slice, audited by the security agent) and 12 (never show what a role can't view); team decisions on reset two-step; roles-and-organization decision 4 (two-step lock on custom roles); feature-flags `platform.passkeys` (core, R1 at `pilot`). The architect writes a short record: "Passkeys count as two-step; the authenticator app stays the fallback".
- **Branch:** `brick/03d-security`, cut from `main` after 3b and 3c

## Problem
Aisha in finance types a password and a six-digit code every morning, sometimes twice a day, on a laptop and on her phone. She can't see where else she's signed in, so when her phone was stolen in traffic last month she had to call Olumide to reset everything. Grace in sales can't turn two-step on even though she wants to, and Olumide can't make the whole team use it without making everyone an admin-style role. Everyone needs one personal page that shows how they sign in and where they're signed in, lets them fix it themselves, and lets them sign in with Face ID or a fingerprint instead of typing codes.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **Every member** (Aisha Bello, finance; Grace Umeh, sales; Kunle Ojo on site) | Sign in fast and safely; see and end sessions on lost or shared devices; change their password; keep backup codes current | Sign-in daily; the page a few times a year, or the day a phone goes missing |
| **Member whose role requires two-step** (owner, admin, finance, HR, locked custom roles) | Swap the daily code for a passkey without losing the safety net | Once per device |
| **MD / owner** (Olumide Bankole) | Make the whole organization use two-step with one switch | Once |
| **Admin** | Reset someone who lost their phone, knowing that also cuts off the lost phone's passkey | A few times a year |

## Success looks like
- **Sign in with a passkey in 1 tap plus Face ID or a fingerprint, under 5 seconds** (from the sign-in page to Home on a repeat visit).
- **Turn on two-step in 4 clicks and under 90 seconds** (authenticator app already installed).
- **End a lost phone's session in 3 clicks from any page** (user menu → My security → **Sign out** on its row); its very next request is refused.
- **No way around a reset:** after an admin resets someone's two-step, no passkey, session or backup code of theirs still works (API test for each path).
- **Every passkey sign-in checks the person** (Face ID, fingerprint or device PIN): registrations and sign-ins without user verification are refused (test with a virtual authenticator set to skip it).
- **Every change is audited, and every alert in the list below is emailed**; nothing in the audit or the alerts holds a password, code, key or full IP address.
- **No personal security procedure takes a person's ID:** each acts only on the signed-in person; another person's session or passkey ID answers "not found" (isolation test extended).
- *My security* is usable **within 1 second** on a repeat visit over slow 3G, at **375 px** with no sideways scroll, with **no WCAG 2.2 AA failures** in light and dark.

## Where My security lives
**One page for everyone, at `/settings/security`, titled *My security*.** It's personal, so no permission is needed to open it, and it never depends on the role's Settings access.

- **User menu (everyone):** **My security** sits under the name and email, above Theme. On phones it's in **More**.
- **Settings sub-navigation (people who can view settings):** **My security** is the last entry, below a divider, so the organization's sections stay together.
- **People without settings access** (sales, finance, site engineers…): `/settings` now redirects to `/settings/security` (3b's rule: the first section they can view). With one section, no sub-navigation is drawn (3b). Settings stays out of their sidebar; every other settings page still gives *403*.
- **⌘K (everyone):** **Go to My security**, **Change password**, **Add a passkey** (when available), **Turn on two-step** (when off), **Sign out everywhere else** (3a, unchanged).
- **Organization-wide page:** the company switcher is hidden (route flag `orgWide`): your account is the same in every company.

## The My security page
Settings layout, single column (`max-w-3xl`), four cards in this order. The most important fact, whether you're protected, is the first thing seen.

**1. You** (header, no card). Initials avatar, your name, your email under it. The name is editable in place: click it, type, Enter saves (Esc cancels). Email is read-only. One muted line: "This is your Vento account in every organization you belong to."

**2. Sign-in** (card). Three rows, each a label, one line of status, and one action on the right.

| Row | Status line | Action |
|---|---|---|
| Password | "Last changed 12 Nov 2026" (or "Set when you joined") | **Change password** |
| Two-step sign-in | Badge **On** (emerald) "Authenticator app" · or **Off** (slate) "Add a code from an authenticator app when you sign in." · when required, under it: "Required for your role (Finance)" or "Required by Vento Homes Ltd" | Off: **Turn on** (primary). On and not required: **Turn off** (quiet text). On and required: no button |
| Backup codes (only when two-step is on) | "8 of 10 left" · amber at 3 or fewer: "3 left. Make new ones so you don't get locked out." | **Make new codes** |

**3. Passkeys** (card; shown when passkeys are [available](#availability-of-passkeys)).
- Intro line: "Sign in with Face ID, Touch ID, your fingerprint or Windows Hello. No password or code to type."
- **List:** one row per passkey: name ("iCloud Keychain · iPhone"), "Added 26 Nov 2026 · Last used today" (or "Never used"), and a ⋯ menu: **Rename** (in place) · **Remove**. Newest first.
- **Add a passkey** (primary when there are none; secondary otherwise).
- **Empty:** "No passkeys yet. Add one on the phone or laptop you use most, and sign in with your face or fingerprint next time." → **Add a passkey**.
- **Browser can't make passkeys:** the button is replaced by "This browser can't create passkeys. Try a recent version of Safari, Chrome or Edge." Passkeys made elsewhere still list and can be removed.
- When two-step is required: one muted line under the list: "A passkey counts as two-step when you sign in. Keep your authenticator app too, in case you lose this device."

**4. Where you're signed in** (card).
- Header line: "Signed in on 3 devices" · **Sign out other devices** (outline, rose text; only when there are others).
- **One row per active session**, this device first, then by last active: device and browser ("Chrome on Mac", "Safari on iPhone"), approximate place and masked IP ("Lekki, Lagos · IP 102.89.••.14"; place left out when unknown), last active ("Active now", "2 hours ago", "Yesterday", then "12 Nov 2026"). This device carries a **This device** tag and no sign-out button (use **Sign out** in the user menu). Every other row has **Sign out**.
- Sessions belong to you, not to an organization: the list includes sessions open in any of your organizations.

**Phones (375 px).** The same cards stacked; rows become two-line cards; actions sit on the right of each row or at the card foot; every target 44 px; dialogs open as full-height sheets with their main button above the keyboard.

## User flows
**Sign in with a passkey (J-ONB-04): 1 tap plus Face ID**
1. *Sign in:* tap the email field. The browser offers your passkey ("aisha@ventohomes.ng · iCloud Keychain") in its suggestions (1) → Face ID → Home.
2. Or **Sign in with a passkey** under the form (1) → pick the passkey → fingerprint → Home. No two-step code is asked.

**Add a passkey (J-ONB-09): 2 clicks plus Face ID**
1. User menu → **My security** (or ⌘K "Add a passkey").
2. **Add a passkey** (1) → *Confirm it's you* (password, skipped if you confirmed in the last 5 minutes) → **Continue** (2) → the device asks for Face ID or a fingerprint.
3. Toast "Passkey added · iCloud Keychain · iPhone" with **Rename**. Security alert emailed.

**Offer after a password sign-in: 1 click**
1. After a password-and-code sign-in on a device that can make passkeys, for someone with no passkey on this device, a small dialog once per device: "Sign in faster next time" → **Add a passkey** (1) or **Not now**. Never shown again on that device after either choice.

**Turn on two-step: 4 clicks**
1. *My security* → **Turn on** (1) → *Confirm it's you* if needed → *Set up two-step* sheet (2a's steps: scan the QR code or type the key, enter a code) → **Verify** (2).
2. *Backup codes:* 10 codes shown once, **Download** · **Copy**, tick "I've saved my backup codes" (3) → **Done** (4). Toast "Two-step is on".

**Turn two-step off: 2 clicks** (only when nothing requires it)
1. **Turn off** (1) → dialog: password and a current code (or a backup code) → **Turn off two-step** (2). Toast "Two-step is off". Security alert emailed.

**Make new backup codes: 3 clicks**
1. **Make new codes** (1) → *Confirm it's you* → **Continue** (2) → codes shown once, tick saved → **Done** (3). The old codes stop working.

**Change password: 2 clicks**
1. **Change password** (1) → dialog: current password, new password (rules tick as you type), confirm → **Change password** (2). Toast "Password changed. Signed out of 2 other devices." Security alert emailed.

**Sign out a device: 1 click; all others: 2 clicks**
1. **Sign out** on its row (1). Toast "Signed out of Safari on iPhone".
2. **Sign out other devices** (1) → confirm **Sign out 2 devices** (2).

**Rename or remove a passkey: 2–3 clicks**
1. ⋯ (1) → **Rename** (2) → type → Enter. Or ⋯ (1) → **Remove** (2) → confirm **Remove passkey** (3).

**Change your name: 1 click**
1. Click your name (1) → type → Enter. Toast "Name updated".

**Require two-step for everyone (J-ONB-10): 3 clicks, owners**
1. *Settings → Organization* (1) → *Security* card → switch **Require two-step sign-in for everyone** (2).
2. Confirm: "3 people haven't set it up: Grace Umeh, Kunle Ojo and 1 other. They'll set it up at their next sign-in." → **Require two-step** (3). Toast "Two-step is now required for everyone in Vento Homes Ltd".

## Rules

### Two-step, passkeys and what "required" means
- **Two-step is per person**, the same in every organization they belong to. **The requirement is per organization:** it comes from the person's role there (2a, 3c lock) or from the organization's **Require two-step for everyone** setting.
- **A passkey counts as two-step at sign-in.** A passkey is tied to a device and only works after Face ID, a fingerprint or the device PIN, so it is possession plus the person; it can't be phished onto another website. Signing in with one asks for no code.
- **A requirement means the authenticator app is set up.** A member who must use two-step keeps the app and backup codes as the fallback for a new or lost device; a passkey is the fast path on top. A member who isn't required may use passkeys with or without the app.
- **Turning two-step off** is allowed only when no organization the person belongs to requires it (by role or setting). The refusal names the first one: "Two-step is required for your role (Finance) in Vento Homes Ltd, so it can't be turned off."
- **Which organization's rule applies:** the organization a session opens or moves into. At sign-in that's the one last used (3a), or the invitation's organization when accepting. If it requires two-step and the app isn't set up, *Set up two-step* comes before anything else; switching into such an organization does the same (3a).

### Availability of passkeys
- Passkeys are the core feature `platform.passkeys`, released at `pilot` and switched on for everyone after the security audit (release plan).
- **Adding, renaming and the Passkeys card** need the feature available to the active organization.
- **Signing in with a passkey** works when the feature is available in **any** active organization of the person (sign-in happens before an organization is chosen). Otherwise it's refused with "Passkeys aren't available for your account yet. Sign in with your password." The **Sign in with a passkey** button shows on browsers that support passkeys unless the flag is `off`.
- **Kill switch:** at `off`, the button, card and ⌘K actions disappear everywhere and passkey sign-in is refused. Passkeys are kept and work again when it's turned back on.

### Confirm it's you
- **Adding a passkey, making new backup codes and turning two-step on** ask for your password first, unless you confirmed it in this session within the last 5 minutes (so doing several things in a row asks once). **Turning two-step off** always asks for the password and a current code (2a decision 11). **Changing your password** asks for the current one in its own form.
- Wrong passwords here count towards the 2a lock (10 in 15 minutes) and the 5 wrong codes rule applies to the turn-off code, with the same countdown and email.

### Sessions
- **Sign out** on another row ends that session at once; its next request gets *Session expired*. No confirm (signing in again undoes it).
- **Sign out other devices** confirms, then ends every other session of the person, in every organization.
- Unchanged from 2a: a password change or reset ends every other session; removal ends the person's sessions in that organization; a two-step reset ends all of them.
- **Approximate place** is worked out once, at sign-in, from the IP address with an offline lookup inside Vento (no outside service is called), and stored as text ("Lekki, Lagos" or "London, United Kingdom"). The full IP address is never stored (2a); the list shows the masked one.

## Acceptance criteria

### Access to the page
- **Given** any member of any role, including custom roles with no Settings access, **when** they open **My security** from the user menu, More or ⌘K, **then** the page opens with their own account. **Given** Grace (sales) types `/settings`, **then** she lands on *My security*; `/settings/team` still gives *403* (3b).
- **Given** an owner or admin, **then** the settings sub-navigation ends with a divider and **My security**.
- **Given** an admin previewing as Sales, **then** **My security** stays in the user menu and shows the admin's own account under the preview banner; nothing on it changes with the preview. No My security procedure accepts a person's ID, so no preview, link or request can show or change someone else's security.
- **Given** a member in the middle of a forced *Set up two-step* (2a), **then** My security isn't reachable until setup is done; the setup screen keeps **Sign out**.

### Two-step on and off
- **Given** two-step is off and nothing requires it, **when** the member turns it on (password confirmed, code verified, backup codes saved), **then** it's on, the session carries on, `two_step.enabled` is audited, and Team shows **On**.
- **Given** a wrong setup code, **then** "That code didn't match. Codes change every 30 seconds, so use the newest one." (2a) and the QR code stays.
- **Given** two-step is on and no organization of the person requires it, **when** they turn it off with the password and a current or backup code, **then** it's off, backup codes are deleted, `two_step.disabled` is audited (in every organization they belong to, 2a), and the security alert is emailed.
- **Given** the person's role, or the setting, in **any** of their organizations requires two-step, **then** **Turn off** isn't shown, the row explains why, and the server refuses with the message naming the organization.
- **Given** a wrong password or code in the turn-off dialog, **then** the field says so and the dialog stays; 5 wrong codes in a row lock sign-in for 15 minutes (2a) and sign the person out with the lockout message and email.
- **Given** two tabs, **when** two-step is turned off in one, **then** the other shows the new state when it's next focused or its next action runs; an action based on the old state (for example **Make new codes**) is refused with "Two-step is off now. The page is up to date."

### Backup codes
- **Given** two-step is on, **then** the row shows how many unused codes are left, counted on the server.
- **Given** **Make new codes**, **then** 10 new codes are shown once with **Download** and **Copy**, "I've saved my backup codes" must be ticked to close, the old codes stop working at once, and `two_step.backup_codes_regenerated` is audited.
- **Given** the dialog is closed or the connection drops before the tick, **then** the new codes are already in force; the row reads "10 of 10 left" and the member can make new ones again.
- **Given** 3 or fewer codes left, **then** the row turns amber with the "Make new ones" line. **Given** a backup code is used at sign-in, **then** 2a's email "a backup code was used (N left)" is sent, unchanged.

### Change password
- **Given** the current password, a new password meeting 2a's rules, not one of the last 5, and a matching confirm, **then** it's changed, every other session ends (2a, enforced on the server whatever the client sends), `account.password_changed` is audited, the alert is emailed, and the toast names how many devices were signed out.
- **Given** a wrong current password, **then** "That's not your current password." on the field; it counts towards the 10-in-15-minutes lock.
- **Given** a new password that breaks a rule, **then** the rule stays unticked and the error says what's missing (2a copy); what was typed stays.

### Passkeys
- **Given** passkeys are available and the browser supports them, **when** **Add a passkey** completes, **then** the passkey is stored for the person with a default name from the authenticator and device ("iCloud Keychain · iPhone", "Google Password Manager · Android", "Windows Hello · Windows"; else "Passkey · Chrome on Mac"), `passkey.added` is audited, and the alert is emailed.
- **Given** the device skips Face ID, fingerprint or PIN (no user verification), **then** registration and sign-in are refused. **Given** a passkey can't be found by the browser without an email (not discoverable), **then** registration is refused. (Passkeys must work from the email field's suggestions.)
- **Given** the person cancels the device prompt, **then** nothing is saved and nothing is shown beyond the browser's own dialog closing; the button is ready again.
- **Given** a passkey for this account already exists on the same authenticator, **then** the browser declines it and the page says "This device already has a passkey for your account."
- **Given** 10 passkeys, **then** **Add a passkey** is replaced by "You can have up to 10 passkeys. Remove one you no longer use."
- **Given** **Rename**, **then** 1–40 characters, trimmed, saved on Enter or blur, audited as `passkey.renamed`. Esc cancels.
- **Given** **Remove** confirmed, **then** the passkey stops working at once (a sign-in with it on another device is refused with "That passkey isn't recognised. Sign in with your password."), `passkey.removed` is audited, and the alert is emailed. Sessions already signed in with it carry on; the confirm says so.
- **Given** the last passkey is removed, **then** nothing else changes: password and two-step still work.

### Signing in with a passkey
- **Given** the sign-in page on a browser that supports passkeys, **then** the email field offers saved passkeys in its suggestions (`autocomplete="username webauthn"`) and **Sign in with a passkey** sits under the form. "Keep me signed in for 30 days" applies to passkey sign-ins too.
- **Given** a valid passkey with Face ID or fingerprint, **then** the person is signed in with no two-step code, `auth.signed_in` is audited with method `passkey`, the passkey's last used date updates, and sign-in lands where a password sign-in would (Home, or the page they were trying to reach; forced setup first where required).
- **Given** a person whose role or organization requires two-step but who has no authenticator app set up (possible only if the requirement arrived after they added a passkey), **then** passkey sign-in works and *Set up two-step* comes first.
- **Given** an admin reset the person's two-step (password reset required), **then** passkey sign-in is refused with the 2a message: "Your two-step sign-in was reset. Set a new password with the link we emailed you, then sign in." (There are no passkeys left anyway; this guards the race.)
- **Given** sign-in is locked for that email (10 wrong passwords or 5 wrong codes), **then** a passkey sign-in still works (question 8). A failed passkey check never counts towards a lock.
- **Given** an unknown or removed passkey, a passkey for a person removed from every organization, or a deleted account, **then** "That passkey isn't recognised. Sign in with your password." and nothing reveals whether the account exists.
- **Given** the *Session expired* dialog (2a), **then** it offers **Sign in with a passkey** beside the password, and work on the page stays.
- **Given** the passkey challenge is older than 5 minutes or was already used, **then** the attempt is refused and the person can try again; challenges are single-use.

### Sessions
- **Given** My security, **then** the list shows only the signed-in person's active sessions, this device first, each with device and browser, approximate place (or none), masked IP, and last active; ended and expired sessions don't appear.
- **Given** **Sign out** on another session, **then** it ends at once, `session.revoked` is audited, its next request (any device, any organization) gets *Session expired*, and the row leaves the list.
- **Given** **Sign out other devices** confirmed, **then** all other sessions end in one transaction, audited once with the count, and the toast reads "Signed out of 2 other devices" (or "No other devices were signed in").
- **Given** a session ID that isn't the caller's (another person's, or made up), **then** "not found", nothing changes.
- **Given** a session ended from another device while this list is open, **then** **Sign out** on it answers "That device is already signed out. The list is up to date." and the list refetches.
- **Given** this device's own session is ended from another device, **then** the next action here shows *Session expired* (2a).

### Name
- **Given** a name of 2–80 characters, trimmed, without hidden characters, **when** saved, **then** it shows at once in the shell, on Team and in new emails and audit events; past audit events keep the name used at the time; `account.name_changed` is audited with before → after in every organization the person belongs to.
- **Given** an empty or invalid name, **then** "Enter your name" and the old name is kept. **Given** an organization, **then** nobody else can change a member's name (it's personal; Team shows it read-only).

### Require two-step for everyone (organization setting)
- **Given** an owner on *Settings → Organization*, **then** the *Security* card shows the switch, off by default, with how many people have two-step on ("9 of 12 people have two-step on"). **Given** an admin or a read-only settings viewer, **then** it's read-only with "Only owners can change this." The server refuses others with the same message.
- **Given** an owner turns it on, **then** a confirm names up to three people without two-step ("Grace Umeh, Kunle Ojo and 1 other") or says "Everyone already has two-step on."; on **Require two-step** it's saved and audited as `organization.updated` (two-step required: off → on).
- **Given** it's on, **then** for every member of this organization without two-step: Team shows **Set up at next sign-in** (3b badge); every page shows a thin banner, "Vento Homes Ltd now requires two-step sign-in. Set it up now, or you'll be asked at your next sign-in." → **Set up two-step**; and they must set it up at their next sign-in to this organization, their next switch into it, or 7 days after the switch was turned on, whichever comes first (question 5). Nothing they were typing is lost: the setup opens over the page and returns them there.
- **Given** it's on, **then** new invitations say two-step is required (invite sheet and *Accept invitation*, 2a/3b copy), every role's two-step column reads "Required" with the tooltip "Required for everyone in Vento Homes Ltd", and the custom role switch shows on and locked with "Required for everyone in Vento Homes Ltd. Change this on Organization." Roles' own values are kept, so turning the setting off returns each role to its own value.
- **Given** an owner turns it off, **then** a confirm explains who'll no longer need it ("Owners, admins, finance and HR still need it."), it's audited, and every owner gets a security alert. Nobody's two-step is turned off; people who now aren't required may turn it off themselves.
- **Given** two owners change it at the same moment, **then** the later save wins, both are audited, and the other sees the latest state with "Olumide Bankole changed this a moment ago."
- **Given** a person in Vento Homes Ltd (setting on) and Lekki Partners Ltd (not required), **then** they can't turn two-step off; signing in to Lekki Partners Ltd without two-step asks nothing, and switching to Vento Homes Ltd sends them to *Set up two-step* first.
- **Given** a member is removed from the only organization that required their two-step, **then** they may turn it off.

### Admin reset (3b) and passkeys
- **Given** **Reset two-step** on Team, **then** in the same transaction as 2a's reset (two-step cleared, sessions ended, password reset required) **all the person's passkeys are deleted**, audited as part of `two_step.reset` with the count. The confirm says so (copy below).
- **Given** a member has passkeys but two-step off, **then** **Reset two-step** is offered on their row and sheet (3b offered it only when two-step was on). The member sheet's facts add "2 passkeys".
- **Given** nobody can reset their own two-step (2a), **then** that stays; on My security a person removes their own passkeys and makes new codes instead.

### Security alerts (email, can't be muted)
- **Given** a sign-in (password or passkey) from a browser that hasn't signed in to this account in the last 90 days, **then** "new sign-in" is emailed with device, browser, approximate place and time. The first sign-in after sign-up or accepting an invitation sends none. A browser is recognised by a random, long-lived device cookie set by Vento (no fingerprinting).
- **Given** a passkey is added or removed, two-step is turned off, or the password is changed or reset, **then** the matching alert is emailed (password and two-step-off alerts exist in 2a).
- **Given** **Require two-step for everyone** is turned off, **then** every owner of that organization is emailed.
- **Given** any alert fails to send, **then** the change still stands and the failure is logged by tag and error code only (3b).

### Organization isolation
- **Given** personal procedures (sessions, passkeys, two-step, backup codes, name, password), **then** they act only on the person in the session, take no organization from input, and write their audit events once per organization the person belongs to (2a).
- **Given** the organization setting, **then** it's read and changed only for the active organization from the session; the 2a isolation test is extended to it.
- **Given** two tabs and an organization switch in one, **then** the other tab's next request to the organization setting is refused by the tab guard (0013); personal procedures aren't organization-scoped and carry on.

### Empty, error, loading and offline
- **Given** loading, **then** a skeleton of the four cards in their final sizes. **Given** a card's data fails, **then** that card shows "Couldn't load your sessions. Check your connection and try again." (or passkeys) with **Try again**; the rest of the page works.
- **Given** offline, **then** the 3a banner shows; actions fail with the 3a offline message and nothing changes optimistically; typed passwords and names stay in their fields.
- **Given** the session expires with a dialog open, **then** 2a's dialog appears over it; after signing in again the dialog is still there with its input (never the passwords: those are cleared, and say so).

### Mobile, keyboard and access
- **Given** 375 px, **then** cards stack, every target is 44 px, dialogs are full-height sheets, and the passkey prompt is the phone's own.
- **Given** the keyboard, **then** every row action is reachable with Tab; Enter saves a rename or name; Esc cancels; dialogs trap focus and return it.
- **Given** a screen reader, **then** each row reads as label, status and action ("Two-step sign-in, on, required for your role"), and toasts are announced.

## Behind the scenes
- **Better Auth passkey plugin.** Add `@better-auth/passkey` at the version matching `better-auth` 1.7.28, configured with `rpID` = the web app's domain (same origin, decision 0009), `rpName: 'Vento'`, `origin` = `WEB_ORIGIN`, `authenticatorSelection: { residentKey: 'required', userVerification: 'required' }`, `registration.requireSession: true`. Its table is hand-written in Drizzle as `passkeys` (uuidv7 id, `userId`, `name`, `publicKey`, `credentialId` unique, `counter`, `deviceType`, `backedUp`, `transports`, `aaguid`, `createdAt`, plus Vento's `lastUsedAt`), no `organizationId` (identity table, decision 0010), and added to the schema diff test.
- **Hooks (security agent reviews):**
  - `/sign-in/passkey`: add to `SIGN_IN_PATHS` so "Keep me signed in" and the session rules apply; after a success, refuse and delete the session when `passwordResetRequired` (as for email sign-in), check `platform.passkeys` is available in one of the person's organizations, audit `auth.signed_in` (method `passkey`), update `lastUsedAt`, clear password-failure attempts, run the new-device check. The two-factor plugin doesn't intercept this path, which is the intended "passkey counts as two-step"; a test pins it.
  - `/passkey/add-passkey` (both steps): require the 5-minute confirmation and availability; cap at 10; set the default name; audit and alert. `/passkey/delete-passkey` and `/passkey/update-passkey`: audit (and alert on delete). `/passkey/list-user-passkeys`: fine as is, or wrapped in oRPC for the page.
  - `/two-factor/disable`: extend `roleRequiresTwoStep` to also check each active membership's organization setting; require a current TOTP or backup code in the before-hook (2a decision 11). `/two-factor/enable` and `/generate-backup-codes`: require the 5-minute confirmation (they also take the password).
  - **`/update-user` is open today** with only a terms guard: Better Auth lets a signed-in person change `name` and `image` through it without an audit event. 3d limits it to `name` (2–80 characters), refuses `image`, and audits `account.name_changed`. (Found while writing this spec; the security agent should confirm nothing else is writable.)
  - Rate limits: `/sign-in/passkey` and the passkey options endpoints 10 a minute per IP; confirmation 10 a minute per person.
- **API additions (oRPC, for the architect):** `account.security` (one call for the page: name, email, password last changed, two-step state and what requires it, backup codes left, passkeys, `canAddPasskey`), `account.confirmPassword` (sets `reauthenticatedAt` on the session), `account.updateName`, `organization.setTwoStepRequired` (owners), `me` gains `twoStepRequiredBy` and the banner's deadline. Existing `account.sessions.list / revoke / revokeOthers` gain `place`.
- **Data:** organization `twoStepRequiredForEveryone` (boolean, default false) with `…ChangedAt` / `…ChangedBy`; session `place` (text), `reauthenticatedAt`; a small `known_devices` identity table (person, hashed device id, first and last seen; pruned after 90 days unseen); `users.twoStepSetupRequired` reused for the forced setup.
- **Place lookup:** an offline IP-to-city database inside the API, refreshed monthly by devops (question 10). Looked up once at sign-in from the full IP, which is then masked as today. Never in logs, analytics or audit.
- **Audit:** new `passkey.added`, `passkey.renamed`, `passkey.removed`, `account.name_changed`; `auth.signed_in` gains method `passkey`; `two_step.reset` metadata gains `passkeysRemoved`; `organization.updated` covers the setting. Existing: `two_step.enabled`, `two_step.disabled`, `two_step.backup_codes_regenerated`, `account.password_changed`, `session.revoked`, `session.revoked_others`. Never a key, credential ID, challenge, password, code or full IP.
- **Maker-checker (non-negotiable 12):** none. Personal changes are the person's own and can't be approved by someone else. The organization setting is owners-only, audited, and turning it off emails every owner; turning it on only raises security. Brick 4 can add a rule if the owner wants one (question 4).
- **Plans:** My security and the organization setting are accounts (no flag, every plan). Passkeys are core, behind `platform.passkeys`.

## UI copy
| Where | Copy |
|---|---|
| Entry points | User menu and More: "My security" · Settings sub-navigation: "My security" · ⌘K: "Go to My security" · "Change password" · "Add a passkey" · "Turn on two-step" · "Sign out everywhere else" |
| Page | Title "My security" · "How you sign in to Vento and where you're signed in." · under the email: "This is your Vento account in every organization you belong to." |
| Name | Tooltip "Edit your name" · error "Enter your name" · toast "Name updated" |
| Sign-in card | Title "Sign-in" · "Password" "Last changed 12 Nov 2026" / "Set when you joined" **Change password** · "Two-step sign-in" badge "On" "Authenticator app" / badge "Off" "Add a code from an authenticator app when you sign in." · "Required for your role (Finance)" · "Required by Vento Homes Ltd" · **Turn on** · **Turn off** · "Backup codes" "8 of 10 left" · low: "3 left. Make new ones so you don't get locked out." **Make new codes** |
| Passkeys card | Title "Passkeys" · "Sign in with Face ID, Touch ID, your fingerprint or Windows Hello. No password or code to type." · row "Added 26 Nov 2026 · Last used today" / "Never used" · menu "Rename" "Remove" · **Add a passkey** · empty "No passkeys yet. Add one on the phone or laptop you use most, and sign in with your face or fingerprint next time." · required note "A passkey counts as two-step when you sign in. Keep your authenticator app too, in case you lose this device." · unsupported "This browser can't create passkeys. Try a recent version of Safari, Chrome or Edge." · limit "You can have up to 10 passkeys. Remove one you no longer use." · shared device hint (under **Add a passkey**) "Only add a passkey on a device that's yours." |
| Sessions card | Title "Where you're signed in" · "Signed in on 3 devices" · **Sign out other devices** · row "Chrome on Mac" · "Lekki, Lagos · IP 102.89.••.14" · "Active now" / "2 hours ago" / "Yesterday" / "12 Nov 2026" · tag "This device" · **Sign out** |
| Confirm it's you | Title "Confirm it's you" · "Enter your password to continue." · label "Password" · **Continue** · **Cancel** · "Forgot password?" · error "That's not your password." |
| Turn on two-step | 2a *Set up two-step* copy · toast "Two-step is on" |
| Turn off two-step | Title "Turn off two-step?" · "You'll sign in with just your password. We'll email you to confirm." · labels "Password" · "Code from your authenticator app" · "Use a backup code" · **Turn off two-step** · **Keep it on** · toast "Two-step is off" · refused "Two-step is required for your role (Finance) in Vento Homes Ltd, so it can't be turned off." / "Vento Homes Ltd requires two-step for everyone, so it can't be turned off." |
| New backup codes | Title "New backup codes" · "Your old codes stop working now. Save these 10 somewhere safe. Each works once." · **Download** · **Copy** · "I've saved my backup codes" · **Done** · toast "New backup codes saved" · stale "Two-step is off now. The page is up to date." |
| Change password | Title "Change password" · "Current password" · "New password" · "Confirm password" · 2a rules and errors · "You'll stay signed in here. Other devices will be signed out." · **Change password** · **Cancel** · error "That's not your current password." · toast "Password changed. Signed out of 2 other devices." / "Password changed" |
| Add a passkey | Device prompt is the browser's · toast "Passkey added · iCloud Keychain · iPhone" **Rename** · errors "This device already has a passkey for your account." · "Passkey not added. Try again, or use another device." (cancelled or failed: no toast when the person cancelled) |
| Rename passkey | Placeholder "Name this passkey" · error "Enter a name" · toast "Passkey renamed" |
| Remove passkey | Title "Remove iCloud Keychain · iPhone?" · "You won't be able to sign in with it. Devices already signed in stay signed in; sign them out below if you need to." · **Remove passkey** · **Cancel** · toast "Passkey removed" |
| Sign out | One: toast "Signed out of Safari on iPhone" · All: title "Sign out 2 other devices?" · "They'll need your password and two-step code, or a passkey, to sign in again. This includes devices signed in to your other organizations." · **Sign out 2 devices** · **Cancel** · toast "Signed out of 2 other devices" · stale "That device is already signed out. The list is up to date." |
| Passkey offer after sign-in | Title "Sign in faster next time" · "Use Face ID or your fingerprint instead of a password and code on this device." · **Add a passkey** · **Not now** |
| Sign-in page | **Sign in with a passkey** (secondary, under **Sign in**) · errors "That passkey isn't recognised. Sign in with your password." · "That passkey isn't recognised. Sign in with your password." · "Passkeys aren't available for your account yet. Sign in with your password." · "Passkey sign-in was cancelled." (inline, muted) · 2a lost-phone line becomes "Lost your phone? Use a passkey on another device or a backup code, or ask an owner or admin to reset two-step." |
| Session expired | Adds **Sign in with a passkey** |
| Organization page, Security card | Title "Security" · switch "Require two-step sign-in for everyone" · "Everyone in Vento Homes Ltd signs in with a code from an authenticator app or a passkey. Owners, admins, finance and HR already need it." · "9 of 12 people have two-step on" · read-only "Only owners can change this." |
| Turn on confirm | Title "Require two-step for everyone?" · "3 people haven't set it up: Grace Umeh, Kunle Ojo and 1 other. They'll set it up at their next sign-in, or within 7 days." / "Everyone already has two-step on." · **Require two-step** · **Cancel** · toast "Two-step is now required for everyone in Vento Homes Ltd" |
| Turn off confirm | Title "Stop requiring two-step for everyone?" · "Owners, admins, finance and HR still need it. Others can choose. Every owner gets an email about this change." · **Stop requiring** · **Cancel** · toast "Two-step is no longer required for everyone" · race "Olumide Bankole changed this a moment ago." |
| Banner (members without two-step, setting on) | "Vento Homes Ltd now requires two-step sign-in. Set it up now, or you'll be asked at your next sign-in." **Set up two-step** · last day: "Set up two-step today to keep using Vento Homes Ltd." |
| Roles (setting on) | Two-step column "Required" · tooltip "Required for everyone in Vento Homes Ltd" · custom role lock "Required for everyone in Vento Homes Ltd. Change this on Organization." |
| Team (3b changes) | Member sheet fact "2 passkeys" · Reset confirm body (adds the passkey line): "Use this when they've lost their phone and backup codes. They'll be signed out everywhere, their 2 passkeys will be removed, and they must set a new password from the link we email them, then set up two-step again. This applies in every organization they belong to." |
| Alert: new sign-in | Subject "Vento: new sign-in on Chrome on Mac" · "Your Vento account was signed in to at 08:12 on 26 Nov 2026 from Chrome on Mac, near Lekki, Lagos. If this was you, there's nothing to do. If it wasn't, reset your password and sign that device out: {link}" · button "Check My security" |
| Alert: passkey added | Subject "Vento: a passkey was added to your account" · "A passkey (iCloud Keychain · iPhone) was added at 10:30 on 26 Nov 2026. It can sign in to your account without a password. If this wasn't you, remove it and reset your password: {link}" |
| Alert: passkey removed | Subject "Vento: a passkey was removed from your account" · "The passkey iCloud Keychain · iPhone was removed at 10:30 on 26 Nov 2026. If this wasn't you, reset your password now: {link}" |
| Alert: setting turned off (to owners) | Subject "Vento: two-step is no longer required for everyone in Vento Homes Ltd" · "Aisha Bello turned off "Require two-step sign-in for everyone" at 10:30 on 26 Nov 2026. Owners, admins, finance and HR still need it. If this wasn't expected, check Organization: {link}" |

## Departures from the approved designs
To be logged in `docs/design/CHANGES.md` when built.

| Board | Change | Why |
|---|---|---|
| SecuritySettings | One page of four cards in the settings left navigation, not three tabs | Settings uses the left sub-navigation (designer's own note); the whole account fits on one screen, and a lost-phone visitor shouldn't hunt through tabs |
| SecuritySettings | "Who must use two-factor" panel with a switch per role → one line on My security saying what requires yours; per-role switches live on each custom role (3c); one organization switch on Organization | Personal page vs organization policy: a sales agent can't change roles; one place per decision |
| SecuritySettings | "Role templates" tab dropped | 3c's Duplicate role covers it |
| SecuritySettings | No "Choose a method", no SMS backup | 2a departure (SIM-swap risk, no SMS provider) |
| SecuritySettings | Sessions show "Chrome on Mac" from the browser, not "Vento web / Vento app" | There's no native app |
| SecuritySettings, SecurityMobile | No "unusual location" flag | IP places for Nigerian mobile networks are often wrong; false alarms train people to ignore real ones. The new-device email does the job |
| SecuritySettings | "Sign out all other devices" confirm drops the line about offline diary entries | The offline queue arrives with the site diary brick; that brick adds the line back |
| SecurityMobile | No sticky **Sign out other devices** button; the emerald "two-factor is on" banner becomes the two-step row's badge | A sticky primary should be the page's main job, not a destructive one; the status sits where it can be acted on |
| Both | Adds Passkeys card, name, Change password, backup codes row | Not designed; built from the settings-page pattern |
| Two-step wording | "Two-factor" → "Two-step sign-in" | DOMAIN term (2a) |

## Screens this slice touches
| Screen (row in SCREENS.md) | Boards | What 3d builds |
|---|---|---|
| My security (changed row) | SecuritySettings, SecurityMobile (partly) | The page, name edit, two-step, backup codes, passkeys, sessions |
| My security dialogs (new row) | – | Pattern: Confirm it's you, Change password, Turn off two-step, New backup codes, Remove passkey, Sign out other devices |
| Passkey offer after sign-in (new row) | – | Pattern: small dialog, once per device |
| Sign in, two-factor challenge | SignIn | **Sign in with a passkey**, passkey suggestions in the email field, new errors, lost-phone line |
| Session expired | SessionExpired | **Sign in with a passkey** |
| Set up two-step and backup codes | SecuritySettings (two-factor panel) | Opened from My security as a sheet; same steps |
| Organization profile | SetOrg (partly) | *Security* card with the switch and both confirms |
| Two-step required banner (new row) | – | Pattern: thin banner like the preview banner |
| Settings layout | SetOrg, DSAdditions, SettingsMobile | **My security** last, after a divider; `/settings` redirects to it for people without settings access |
| App shell | – | **My security** in the user menu and More; ⌘K actions |
| Team, member sheet, roles list and role page | RolesSettings, SetPermissions | "2 passkeys" fact; reset copy; Reset offered with passkeys; "Required" when the setting is on; lock reason |
| Email: security alert | – | New sign-in, passkey added, passkey removed, setting turned off (to owners) |

## Journeys
- **J-ONB-04** (changed): passkey sign-in from the email field or the button; recovery adds "a passkey on another device"; lockout doesn't block passkeys; the new-device email.
- **J-ONB-09** (new, draft) *Secure your own account*: `e2e/settings/my-security.spec.ts` and `e2e/auth/passkeys.spec.ts` (Chromium virtual authenticator through the DevTools protocol, with user verification on and off).
- **J-ONB-10** (new, draft) *Require two-step for everyone*: `e2e/settings/require-two-step.spec.ts`.
- **J-ONB-06** (changed): Reset two-step also removes passkeys and is offered when someone has passkeys.

## Domain changes
To add to `docs/DOMAIN.md` once approved:
- **Two-step sign-in** (notes): replace with "Required by the member's role, or for everyone when the organization turns on *Require two-step for everyone*. Per person: the same in every organization they belong to; it can be turned off only when none of their organizations requires it. A passkey sign-in counts as two-step. Where two-step is required, the authenticator app must be set up even if the member uses passkeys. Repeated wrong codes lock sign-in for a period."
- **Passkey** (new term, Tenancy and people): "A sign-in key kept on a person's device or password manager, unlocked with Face ID, a fingerprint, Windows Hello or the device PIN. | Belongs to a person, not an organization. Up to 10 each, named and removable on My security. Counts as two-step at sign-in. Removed when an owner or admin resets the person's two-step. Released with the `platform.passkeys` feature."
- **Session** (notes): add "Shows the device and browser, approximate place (worked out at sign-in, without the full IP address) and last active. Ends when its owner signs it out, on a password change or reset, a two-step reset, or removal from the organization."
- **Organization** (notes): add "Has a *Require two-step for everyone* setting (off by default; owners only)."
- **Security alert** (meaning): add "a new sign-in from an unrecognised browser, a passkey added or removed", and "to every owner when *Require two-step for everyone* is turned off".
- **My security** (new term, Platform): "The personal page every member has for their name, password, two-step, backup codes, passkeys and sessions. | Needs no permission; always about the signed-in person, also during a role preview."
- **Access rules:** replace "Two-step is required for owner, admin, finance and HR…" with "…for owner, admin, finance and HR (a property of the role), and for everyone in an organization that turns on *Require two-step for everyone*; people without it set it up at their next sign-in to that organization, or within 7 days. Anyone can turn it on for themselves." Add "**Sensitive personal changes** (adding a passkey, new backup codes, turning two-step on) ask for the password unless it was confirmed in the last 5 minutes; turning two-step off always asks for the password and a code." Add "A two-step reset also removes the person's passkeys." Add "Passkey sign-ins work during a sign-in lock, and never while a password reset is required."

## Out of scope
- **Phone number and photo.** Phone arrives with the WhatsApp digest, which is its first use; photos aren't used anywhere (the design shows initials everywhere) and need file storage.
- **Changing your email address** (needs confirming both addresses; `/change-email` stays switched off). An owner can remove and re-invite meanwhile.
- **Passkey-only accounts** (no password), signing up with a passkey, confirming "it's you" with a passkey instead of a password, security keys as a separate concept (a hardware key works as a passkey if the browser supports it).
- SMS codes, "Trust this device", sign-in with Google or Microsoft (2a departures stand).
- An organization-wide sessions view, forcing a member's sign-out from Team (removal and reset already end sessions), "unusual location" detection, login history beyond the audit trail.
- Requiring passkeys (not just two-step) for an organization or role; password expiry rules.
- Buyer and realtor portal sign-in (with the portals).
- The audit log page (brick 4); personal events are already recorded.

## Owner's decisions (26 Nov 2026)
All 16 recommendations below were approved as written. Already decided before the spec: every user can turn two-step on for themselves, and owners get an organization setting "Require two-step for everyone" (off by default).

## Open questions (answered above; recommendations in bold)
Each has a recommendation; the owner's decision of 26 Nov 2026 (anyone can turn two-step on; "Require two-step for everyone", owners only, off by default, at the next sign-in; roles that require it unchanged) is already built in above.

1. **Does a passkey sign-in count as two-step?** *Recommended:* **yes.** A passkey only works on the device that holds it, after Face ID, a fingerprint or the device PIN, and it can't be typed into a fake website, so it's stronger than a password plus a code. Vento refuses passkeys that skip that check.
2. **People who must use two-step: does a passkey replace the authenticator app?** *Recommended:* **no; it sits on top.** They keep the app and backup codes for a new or lost device and use the passkey day to day. Without this, losing the one phone with the passkey means an admin reset every time.
3. **Where My security lives.** *Recommended:* **`/settings/security` for everyone**, in the user menu, More and ⌘K; last in the settings sub-navigation for people who can view settings; `/settings` opens it for everyone else. One address, no new navigation area.
4. **"Require two-step for everyone": place, who, checker.** *Recommended:* a *Security* card on **Settings → Organization**; **owners only** (admins see it read-only); audited; turning it off emails every owner; **no maker-checker** (turning it on only raises security, and the off-email gives every owner sight of a weakening). Revisit in brick 4 if you want a second owner to approve turning it off.
5. **People already signed in when it's turned on.** Your decision says "at their next sign-in". Normal sessions last at most 12 hours, but "Keep me signed in" lasts 30 days. *Recommended:* a banner straight away with **Set up two-step**, required at their next sign-in or switch into the organization, **and at the latest 7 days after it was turned on** (then the setup opens over the page they're on, keeping their work).
6. **Confirm it's you.** *Recommended:* ask for the **password** before adding a passkey, making new backup codes or turning two-step on, **remembered for 5 minutes**; turning two-step off always needs the password and a code. Stops someone at an unlocked laptop from adding their own passkey.
7. **Admin reset and passkeys.** *Recommended:* **a two-step reset also removes all the person's passkeys**, and **Reset two-step** is offered whenever someone has two-step on or any passkey. Otherwise a thief with the lost phone could still sign in with its passkey after the reset.
8. **Passkeys during a sign-in lock.** *Recommended:* **allowed.** Locks stop password and code guessing, and a passkey can't be guessed, so someone locked out by another person's guessing can still get in. Passkeys are always refused while a password reset is required.
9. **"New sign-in" emails.** Every sign-in would mean an email a day for most people. *Recommended:* **only for a browser that hasn't signed in to the account in 90 days** (a random device cookie, no fingerprinting), password or passkey alike; none for the very first sign-in.
10. **Approximate place in the sessions list.** *Recommended:* **city and country from an offline IP database inside Vento** (for example DB-IP Lite: free, licence CC BY 4.0, which needs a credit line in the privacy notice or About page), looked up once at sign-in; no outside service called; full IP never stored; **no "unusual location" warnings** (mobile network locations in Nigeria are often wrong). Devops refreshes it monthly. If you'd rather not, the list shows the masked IP only.
11. **My profile.** *Recommended:* **name only**, edited in place at the top of My security. Phone comes with the WhatsApp digest (its first use); photos stay out because the product uses initials everywhere; changing email waits for a proper two-address check. Also closes a gap: today Better Auth would let someone change their name and photo through its own endpoint without an audit entry.
12. **Offer a passkey after sign-in.** *Recommended:* **yes, once per device**, after a password sign-in on a device that can make passkeys, with **Not now**. Passkeys only help if people add them, and the moment they've just typed a code is when the offer lands.
13. **Alerts for passkey removed and setting turned off.** Your list covers new sign-in, passkey added, two-step off and password changed. *Recommended:* **also passkey removed** (the 3a spec already promised it) and **"two-step no longer required" to every owner**.
14. **Passkey limits and names.** *Recommended:* **up to 10 per person**, named automatically from the password manager and device ("iCloud Keychain · iPhone"), renamable.
15. **Passkeys at `pilot`.** *Recommended:* keep the release plan: `platform.passkeys` at `pilot`, on for everyone after the security audit. Passkey sign-in works if passkeys are available in **any** of the person's organizations (sign-in happens before one is chosen); turning the flag `off` hides them everywhere and refuses passkey sign-in, without deleting anyone's passkeys.
16. **Signing out devices.** *Recommended:* one device signs out **at once with no confirm** (signing in again undoes it); **Sign out other devices** asks first, as on the board.
