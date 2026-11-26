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
| 2026-11-25 | All screens (type) | Headings and wordmark use Geist instead of Poppins | Owner wanted a more premium, next-gen feel; Satoshi (marketing site) can't be in a public repo under its licence | Yes |
| 2026-11-25 | Auth forms | Form column 432px placed near optical centre; 32px titles; 48px inputs with a focus halo; "Forgot password?" beside the Password label; no sign-in subtitle; "Keep me signed in for 30 days"; one-line footnote; buttons with soft depth, hover and press | Owner approved a polish pass to match top-tier sign-in pages | Yes |
| 2026-11-26 | Shell top bar | No Approvals link and no notifications bell yet | Nothing feeds them until brick 4; an empty bell is clutter (open question 3) | Yes |
| 2026-11-26 | User menu | Theme is Light / Dark / System instead of a Dark mode switch; no "AI suggestions" switch; Settings arrives in 3b | Owner's decision on themes; the AI add-on comes later | Yes |
| 2026-11-26 | Sidebar | Built from the role's view permissions, one entry per module; "Board pack" becomes "Reports"; labels in sentence case | One rule that also works for custom roles; Reports holds dashboards, returns and board packs (open question 4) | Yes |
| 2026-11-26 | Sidebar header | Shows the organization name under the Vento lockup; it's the organization switcher for people in two or more | The boards have no organization switching | Yes |
| 2026-11-26 | Entity switcher | Notes say "Holding company" or "SPV", not project counts | There are no projects yet | Yes |
| 2026-11-26 | Mobile tabs | Home plus three modules instead of sub-area tabs (Diary, Receipts, Leads…) | Those screens don't exist yet; each tab moves when its screen ships | Yes |
| 2026-11-26 | 403 | Names owners and admins as the people who can change access; no **Request access** button | Only owners and admins change access; requests need Approvals (brick 4) | Yes |
| 2026-11-26 | 404 | "archived" instead of "deleted or merged" | Vento archives; nothing is deleted | Yes |
| 2026-11-26 | 500 | No "your work is saved up to 14:32" line; no status page link | We can't promise it on every page; there's no status page yet | Yes |
| 2026-11-26 | Offline page and banner | No list of pages available offline; the banner doesn't mention saved receipts | The offline cache and queue arrive with the site diary brick | Yes |
| 2026-11-26 | Preview as role | A banner stays visible while previewing; buyer portal isn't in the list | Nobody should forget they're previewing; the portal comes later | Yes |
| 2026-11-26 | Sidebar | 248→256px default, user-resizable 220–320px (remembered per device); account card bottom-left; organization card with initials; no group headings; unbuilt modules in a quieter style with 'Soon' only on hover; Settings and Help hidden until they lead somewhere | Owner asked for a world-class, wider, resizable side panel; quiet unbuilt modules avoid noise | Yes |
| 2026-11-26 | Home | Navy hero band echoing the sign-in panel; four role KPI tiles with icons and calm placeholders; one line on when numbers appear; premium 'Your workspace' cards (desktop and mobile); no setup checklist until 3b | Owner wanted Home classy and creative with a simple flow and no dead ends | Yes |
| 2026-11-26 | Coming soon page | Centred composition with module icon, purpose and three points on what it will do | Same standard as Home for every unbuilt module | Yes |
| 2026-11-26 | Mobile header | Organization and entity as one 44px button; Home shows only the date on phones | Touch targets and no repeated names | Yes |
| 2026-11-26 | Command palette | Opaque surface with a brand left bar on the selected row; no 'Soon' hints | Board's selected state was barely visible; quiet-unbuilt decision | Yes |
| 2026-11-26 | Search and entity triggers | Sit on the page background | The board's surface fails AA for muted text | Yes |
| 2026-11-26 | Preview as role | Intersects the previewed role with your own permissions | A preview can never show more than you can see (decision 12) | Yes |
| 2026-11-26 | Team list | Members first (owners, then A–Z), then open invitations newest first; new invitations reached from the toast's **View invited** or the Invited chip | Owner's decision: the list is mainly about the people; invitations are the smaller, temporary part | No |
| 2026-11-26 | Team list | Follows the top-bar entity switcher: one entity shows "People who can work in {Entity}" with **Show all entities**; only organization-wide pages (company profile, plan, roles) hide the switcher | Owner's decision: every page whose data belongs to a company follows the switcher (decision 0014) | No |
| 2026-11-26 | Team list | Last column "Activity" (last active for members, invitation state for invitations); chips without counts, the subtitle holds them; entity cell "2 entities" with the names on hover | One column fits both row kinds; no repeated numbers | Yes |
| 2026-11-26 | Team row menu | "Remove from team" (the organization is named in the confirm); only Remove is red; Reset two-step's confirm isn't destructive; cancel buttons say "Cancel" | Short menu labels; red only for what can't be quietly undone | Yes |
| 2026-11-26 | Team on phones | Cards instead of the table; actions in the member sheet; Settings reached from More; search says "Search people" | 375px width; no hidden swipe actions | Yes |
| 2026-11-26 | Removed people | No member sheet; the row offers **Invite again** only | Their access has ended; history stays in the audit trail | Yes |
| 2026-11-26 | Invite people sheet | Not designed in the boards: one box that takes pasted lists (Excel, Gmail, Outlook) and turns them into rows | No board covers batch invites | Yes |
| 2026-11-26 | Invite people sheet | One role for everyone, preselected (last used, else the team's most common; never Owner or Admin); **Give people different roles** reveals per-row roles | Simple first: most batches share one role | Yes |
| 2026-11-26 | Invite people sheet | Entity access is one line, "Access: All entities · Change", hidden with one entity; opens on the entity picked in the switcher | Fewer decisions on the common path | Yes |
| 2026-11-26 | Invite people sheet | Marked rows get a one-tap Remove; Send counts and sends only unmarked rows; marked rows stay after sending | A bad address never blocks the good ones | Yes |
| 2026-11-26 | Invite people sheet | At the plan limit: "You have N places left on your Starter plan. Talk to Vento for more." above a disabled Send, with **Send only N**; non-owners see whom to ask | Leads with the way forward instead of a refusal | Yes |
| 2026-11-26 | Invite people sheet | Esc closes the sheet but keeps the draft until you send or clear it | Nobody loses a pasted list to a stray key | Yes |
| 2026-11-26 | Withdraw invitation | Instant, with an Undo toast (re-invites with the same role and entities); resend is instant | Fewer confirms for reversible actions | Yes |
| 2026-11-26 | Setup checklist | Full width on Home; done steps fold into one line ("3 steps done"); loads after the page with a skeleton | Keeps attention on the open step; keeps Home's first load under budget | Yes |
