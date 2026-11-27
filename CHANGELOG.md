# Changelog

User-visible changes, newest first, written for customers. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/) once the first release ships.

## [Unreleased]
### Added
- Approvals: changes that need a second person now wait for one. A new **Approvals** page (with a count at the top) shows what waits for you, what you asked for and what you decided. Approve in two clicks, or reject with a comment; nobody can approve their own request or two steps of the same one. Requests expire after 7 days. You get an email when something needs you and when your request is decided. Approving happens only in Vento Real Estate, never from the email. Changing the permissions of a role people already have, and making someone an owner (or inviting one), now go through approval by default.
- Approval rules: owners choose which actions need approval, above what amount, in which companies and by which roles (up to 3 steps, in order). Other owners are emailed when a rule changes. A role used in a rule can't be deleted.
- Audit log: owners and admins can search every change in the organization in plain words (who, what, before and after, when, from where, who approved), filter by module, person, company and dates, and export up to 50,000 entries as CSV. **View history** opens it for one role or person.
- My security, for everyone: turn on two-step sign-in, see and renew backup codes, change your password, see where you're signed in and sign out a lost phone, and add a passkey to sign in with your face or fingerprint (early access). Emails tell you about a new sign-in, a passkey added or removed, and two-step turned off.
- Require two-step for everyone: owners can make two-step sign-in required for the whole organization, with 7 days for people to set it up.
- Companies: add, edit, archive and restore your companies (SPVs) with their RC number, TIN and VAT status, from Settings, the Company menu at the top or the setup checklist. A duplicate RC number is refused; archived companies can be restored within your plan.
- Roles & permissions: see exactly what each role can do, and make your own role (for example Site engineer) by duplicating one and ticking what it needs. Nobody can give more access than they have themselves; changes reach people on their next click, with Undo.
- Organization details: name, head office state and financial year.
- Team: one list of everyone in your organization and everyone you've invited, with roles you can change in place (and undo), access limited to some companies, two-step status and last activity. Invite up to 20 people at once by pasting a list; mistakes, duplicates and people already on the team are marked, and the rest still go. Reset a colleague's two-step when they lose their phone, make someone an owner, remove a leaver (history kept) and invite them again later. The list follows the company you pick at the top. Owners see how many places their plan has left.
- Setup checklist on Home for owners and admins: each step ticks itself from what you've done; hide it any time and bring it back from ⌘K.
- Settings, starting with Team, for owners and admins.
- Plans and early access behind the scenes: each organization sees only what its plan includes and what has been released to it. Owners get a quiet "Available on Growth" note when they search for something outside their plan, a reminder in the last week of a trial, and a clear message if they reach a plan limit.
- Your workspace: a navy side panel showing only the modules your role can open (resizable, remembered), a Home with your key numbers as they arrive, switching between organizations and entities, light, dark or system theme, a command palette (⌘K) and keyboard shortcuts (?), preview as role for owners and admins, and clear pages for no access, not found, errors and being offline.
- Accounts and access: create a company account, verify your email, set up your organization and first company, sign in with two-step (authenticator app and backup codes), reset a forgotten password, and accept an invitation to join your team. Owners, admins, finance and HR must use two-step. Repeated wrong tries pause sign-in for 15 minutes and email you. Every change to who can access what is recorded in an audit trail that can't be edited.
- Foundation: monorepo with web app, API and shared types; local database; automatic checks on every change. The home page shows whether the API and database are connected.
- Product, domain and design documentation, user journeys, decision records and the Claude Code agent team. No product features yet.
- Approved Claude Design export (419 boards) with design notes, tokens and a screen inventory linked to each board.

### Changed
- Roles that can approve now require two-step sign-in: Land & legal, Project manager, Facility and any custom role with Approve. People in those roles see the usual banner and have 7 days to set it up.
- "Entity" is now "Company" everywhere you read it.
- The product is called Vento Real Estate everywhere: on every page, in emails (sender, subject and footer), in your audit trail ("Vento Real Estate moved your organization to Growth"), on **Talk to Vento Real Estate**, and in your authenticator app for new two-step set-ups (existing entries keep their old name until you set two-step up again). The web address is realestate.ventoerp.com.
- Inviting people: an email that belongs to a Vento Real Estate staff account can't be invited to your organization. That row says so ("… is a Vento Real Estate staff account and can't join an organization. Use a different email."), and the rest of the invitations still go.

### Security
- Changes Vento Real Estate makes to your plan or features now require a staff member's two-step sign-in and are recorded with who made them. Your audit trail still shows them as "Vento Real Estate", in plain words. Staff who can make these changes can't turn off their own two-step sign-in.
- Vento Real Estate staff now use separate staff accounts, never your organization's member list: a staff account can't join or create an organization.
- Unused sign-in endpoints are switched off, and wrong two-step codes are counted everywhere.
- Keyboard focus is visible on every button again.
