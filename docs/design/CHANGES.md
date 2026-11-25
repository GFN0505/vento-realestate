# Design changes log

When a built screen deliberately differs from its approved design, record it here so the design can be updated in the next Claude Design pass.

| Date | Screen | What changed | Why | Needs design update? |
|---|---|---|---|---|
| 2026-11-25 | Onboarding step 1 | No RC number or logo; base currency shown as NGN, not chosen | RC and TIN belong to each entity (step 2). Logo needs file storage (brick 3 branding). NGN is the base for every entity. | Yes |
| 2026-11-25 | Onboarding step 2 | No collections bank account | Bank accounts belong to Finance and need a bank-name check; moves to the setup checklist | Yes |
| 2026-11-25 | Onboarding | Two steps ("about two minutes"); no Back on step 2; native selects; mobile inputs 8px radius; desktop dark built from tokens | Step 1 is saved before step 2; step 3 comes with Projects; native selects keep the page light | Yes |
| 2026-11-25 | Sign in | No Google or Microsoft buttons | No outside sign-in providers before customers ask for them | No |
| 2026-11-25 | Sign in, two-step | Two-step is a second step inside /sign-in, with "Back to sign in"; no SMS codes; no "Trust this device" | SMS codes are weak (SIM swap) and there's no SMS provider; "Keep me signed in" already gives 30 days | Yes |
| 2026-11-25 | Sign in, two-step | Wrong codes clear the boxes; lockout shows a live countdown with "or reset your password" | Clear next step instead of a fixed unlock time | Yes |
| 2026-11-25 | Sign up | "30-day trial. No card needed." hidden; failing password rules turn rose instead of a separate error line | No billing yet; one place for password feedback | Yes |
| 2026-11-25 | Reset password | No "sign out other devices" tickbox: a reset always signs out everywhere | A reset usually means the password may be known to someone else | Yes |
| 2026-11-25 | Session expired | A dialog over the current page that also asks for the two-step code | No app shell yet; every new sign-in asks for two-step | Yes |
| 2026-11-25 | Accept invitation | Link carries a token, not the invitation id; no sent date; passive terms line | Tokens are unguessable and stored hashed | Yes |
| 2026-11-25 | Two-step setup | Starts with "Confirm your password"; built inside the auth layout from the SecuritySettings panel | Better Auth requires the password to turn two-step on | Yes |
| 2026-11-25 | Auth layout | "Data held in Nigeria" removed from the footer; Privacy and Terms point to pages not built yet | Hosting location isn't decided; legal pages come before launch | Yes |
| 2026-11-25 | Auth layout (dark) | Links use a lighter violet for contrast | WCAG AA in dark mode | Yes |
| 2026-11-25 | All screens | Open in light mode by default instead of following the computer's setting; dark mode becomes a choice (toggle in brick 3) | Owner's preference | No |
| 2026-11-25 | Auth brand panel | Panel takes half the page; headline "Command every development, from title to handover." and one line, "Everything your development business runs on, in one calm, secure place." (no feature list); soft violet/cyan glow, faint grid and V mark | Owner asked for a more high-class first impression with catchier, less granular copy | Yes |
| 2026-11-25 | Logo lockup | "REAL ESTATE" descriptor beside the Vento wordmark; page titles and footers say Vento Real Estate | The company has other Vento products | Yes |
| 2026-11-25 | Sign up, reset, invitation | Password rules show 12+ characters and a number only (no "not common or leaked") | Owner's decision 13 | No |
| 2026-11-25 | Auth brand panel (motion) | Drifting violet/cyan aurora, both V marks draw themselves on load, pointer spotlight lighting the grid, word-by-word headline entrance, slow light sweep every 12s; all still under reduced motion and paused in hidden tabs | Owner asked for a dynamic, next-gen first impression | Yes |
