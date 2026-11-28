# Land & title

- **Status:** approved (owner, 27 Nov 2026: all twelve open questions answered as recommended)
- **Module:** Land & title (`land`)
- **Journeys:** J-LND-01 (changed: boundary moves to slice 3, ledger posting deferred), J-LND-02 (changed: adds `queried` and a follow-up date; the digest mention is deferred), J-LND-03 (changed: approvals come from a rule, a mortgage need not block sales, the unit block is enforced when Sales ships). See [Journeys](#journeys).
- **Screens:** see [Screens this spec touches](#screens-this-spec-touches)
- **Decisions:** builds on 0003 (organizations and entities), 0006 and 0024 (maker-checker through one approvals engine), 0011 (append-only audit), 0012 (UUID v7, same-organization keys), 0014 (company is a view filter), 0016 (availability declared in the contract), 0018 ("company" on screen), 0022 (always "Vento Real Estate"). **New record needed (architect): "Private file storage for documents"**: where files live, encryption, signed short-lived links, resumable upload, and the NDPA basis for where the data sits (open question 9). Every later module (receipts, site photos, contracts, KYC) reuses it.
- **Release plan:** [§2](../release-plan.md#2-release-1-mvp-sell-collect-and-build) Release 1: parcels, title stage tracker, document vault with versions, encumbrance register. Surveys, valuations and the land bank are R3. [§8](../release-plan.md#8-build-order): the first module brick after approvals and audit (brick 4).
- **Feature flag:** `land` (module, already in the catalog, no prerequisites). Starts at `internal`; in every plan, Starter included.

## Problem
Ngozi keeps the title file for every parcel in a cabinet, a WhatsApp chat with the firm's lawyer and a spreadsheet only she understands. When a buyer's lawyer asks "has the C of O come out for Lekki Pearl?", or Olumide asks "where are we with the consent?", she has to dig. When a caveat or court order lands, nothing stops Grace's team selling plots on that land the same afternoon. Vento Real Estate needs one record per parcel that shows where the title stands, holds every title document with its versions, and records any claim on the land so that, the moment it's saved, sales on that land stop until two other people agree it's cleared.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **Land & legal officer** (Ngozi Adeyemi) | Register parcels, move title stages as the registry moves, keep every document in one place, record and clear encumbrances | Parcels a few times a year; stage updates and uploads weekly; encumbrances rarely but urgently; often on a phone at the Lands Bureau |
| **MD / owner** (Olumide Bankole) | Know which parcels are titled and which are blocked; approve clearing an encumbrance | Weekly glance; approvals a few times a year |
| **Finance manager** (Aisha Bello) | Second approver on clearing an encumbrance (open question 1); see what the land cost | Rarely |
| **Sales manager, project manager, viewer** | Check a parcel's title and whether it's blocked before promising a buyer anything | Weekly, read-only |

## Success looks like
- **Register a parcel with two documents in under 2 minutes** on desktop (slice 1; J-LND-01's 3-minute target includes the boundary, which is slice 3).
- **Move a title stage in 2 clicks plus the upload:** click the stage (1) → the likely next status is pre-selected → attach → **Save update** (2).
- **Answer "has the C of O come out?" in 2 clicks:** ⌘K the parcel name (1) → the tracker shows it, with the document one click away (2).
- **An encumbrance blocks sales the moment it's saved**, in the same transaction (slice 2), and nothing unblocks it except the last approval of a clearing request. Tested at the API, not only in the UI.
- **No lost uploads:** a file interrupted by a weak connection resumes when the signal returns, while the page is open; what was typed stays.
- **Nothing is deleted:** every document version and every stage change stays in the parcel's activity.
- **Isolation:** another organization's parcel, document or encumbrance answers "not found"; a member limited to some companies never sees parcels of others.
- Usable at **375 px** with no sideways scroll; **WCAG 2.2 AA** in light and dark; parcels list under 1 second on a repeat visit over slow 3G.

## Slices
The brick is too big for one PR. Each slice ships behind `land` (still `internal`) and is useful on its own.

| Slice | Contents | Why this order |
|---|---|---|
| **1 · Parcels and title** (smallest useful piece) | Private file storage; parcels list (list view); add, edit, archive and restore a parcel; parcel detail with the **title stage tracker**, **title stage update**, **document vault** with versions, preview and download; parcel activity timeline; ⌘K; Land & legal home: *Titles in progress* tile, *Title pipeline* panel, queue items for queries, follow-ups and stalled stages; seed data. J-LND-01 (without the boundary) and J-LND-02. | The daily job, and the foundation everything else attaches files to. |
| **2 · Encumbrances** | Add, edit and clear an encumbrance; clearing through the approvals engine (new catalog action and default rule); rose badge, banner and *Encumbered* filter; the **sales block** as a server rule other modules call; email to owners; Land & legal home: *Encumbrances blocking sales* tile, *Encumbrances* panel, court-date queue item; MD home queue item. J-LND-03. | Must be released **before or with Sales**, because the block only bites once units can be sold. Building it second keeps slice 1 small. |
| **3 · Boundary and map** | Beacons typed or pasted from Excel, coordinate system per parcel, area worked out and compared with the survey plan, map view on the list, parcel map on detail, overlap warning. | Needs a map provider and a confirmed list of Nigerian coordinate systems (open question 10). Title and encumbrances don't depend on it. |
| Later (not planned) | Drawing a boundary on the map, walking it by phone GPS, importing `.dxf` / `.kml` survey files | See open question 10. |

## How it works
**Parcel.** A piece of land the developer owns, is buying or is considering, always under one company. Reference `P-0001` upwards per organization (never reused). Status:
- `prospect`, `under_acquisition`, `acquired`: chosen by a person.
- `titled`: automatic, when the parcel is `acquired` and every stage on its tracker is `granted`. It returns to `acquired` if a stage stops being granted.
- `in_development` and `sold_out` arrive with Projects and Sales; this brick doesn't set them.

**Size** is entered in hectares, square metres or plots and stored in m². A plot is 600 m² unless the parcel says otherwise ("12 plots of 648 m²"). Lists show hectares to two decimals.

**Title stages.** Each parcel has its own list of stages, picked from a fixed catalog and shown in catalog order: Survey plan → Excision gazette → R of O → C of O → Deed of assignment → Governor's consent (open question 6). A new parcel starts with **Survey plan, Excision gazette, C of O**, or **Survey plan, R of O, C of O** in the FCT (open question 6: land bought from families is first titled in the developer's name; deed of assignment and governor's consent apply when land is bought from someone who already holds a C of O, so they're added then); **Edit stages** adds or removes stages. A stage can be removed only while `not_started` with no documents. Status: `not_started → in_progress → submitted → queried → submitted… → granted / rejected`. `queried` is new (open question 7): the registry has asked for something. *Current stage* = the first stage that isn't granted. Any stage can be updated at any time; registries don't move in order.
- Every update records the date (today by default, not in the future), and may record a reference (file number) and an issuing authority (remembered per stage type from the last one used).
- **Granted** needs a document of that stage's type, uploaded in the sheet or already in the vault. The reference and date become the document's number and issue date.
- **Queried** and **Rejected** need *What happened*. Rejected offers **Resubmit**, which moves it back to `submitted` with a new date.
- **Follow up by** (optional, offered for submitted and queried) puts the chase in the Land & legal queue on that date.
- Changing a granted stage to anything else needs *What happened*; it's in the activity like every update.

**Document vault.** Every file on a parcel, by type: `survey_plan`, `excision_gazette`, `r_of_o`, `c_of_o`, `deed_of_assignment`, `governors_consent`, `family_receipt`, `land_purchase_agreement`, `encumbrance_evidence` (slice 2), and `other` with a name ("Application acknowledgement", "Query letter"). Uploading a type that already exists adds a **version** of it, never a second file (for `other`, the same name); open question 8 covers types that can legitimately have several. Each version keeps who, when, number, issue date, issuing authority, a note, and the file. PDF, JPG, PNG or HEIC, up to 25 MB. PDF and images preview in the browser; HEIC downloads. **Remove** (wrong file or wrong parcel) needs a reason, hides the version from the vault with Undo, and keeps it and the reason in the activity. The file itself is kept.

**Encumbrance** (slice 2). Type `mortgage`, `caveat`, `court_order`, `lien` or `family_dispute`; claimant or holder, date served or lodged (not in the future), reference, evidence (required), lawyer, next date (e.g. a hearing), notes. Status `active → cleared`.
- **Blocks sales:** always for court order, caveat, lien and family dispute. For a mortgage it's a choice when recording, off by default, because a construction-finance mortgage normally allows sales with the lender's release (open question 2). The choice can't be edited later: to unblock, clear the encumbrance.
- **The sales block** is one server rule: a parcel is blocked while any active encumbrance on it blocks sales. Projects (which link projects to parcels) and Sales (which refuses new reservations and subscriptions on blocked units) call it; neither keeps its own copy. Which units count as "on the parcel" is open question 3.
- **Clearing** needs the clearance date, evidence (court letter, discharge, withdrawal) and an optional note, and goes through the approvals engine as **Clear an encumbrance**. While the request waits, the encumbrance stays active and keeps blocking. On the last approval it becomes `cleared` in the same transaction, and the block lifts if nothing else blocks. Recorded in error? Clear it with the note "Recorded in error"; there is no delete.

## Permissions
From the default table (accounts-and-access): Land & title is **Full** for Owner, Admin and Land & legal; **View** for Project manager, Sales, Finance and Viewer; none for HR and Facility. Custom roles follow their ticks.

| Action | Needs | Default roles |
|---|---|---|
| See parcels, tracker, documents (preview and download), encumbrances, activity | `land.view` | Owner, Admin, Land & legal, PM, Sales, Finance, Viewer |
| See the acquisition cost and who it was bought from | `land.edit` or `finance.view` (open question 5) | Owner, Admin, Land & legal, Finance, Viewer |
| Add a parcel, upload a document, record an encumbrance | `land.create` | Owner, Admin, Land & legal |
| Edit a parcel, update a stage, edit stages, edit an encumbrance's details, ask to clear one | `land.edit` | Owner, Admin, Land & legal |
| Archive or restore a parcel, remove a document version | `land.delete` | Owner, Admin, Land & legal |
| Approve clearing an encumbrance | `land.approve`, and named in the rule's step | Owner, Admin, Land & legal (+ Finance, open question 1) |

All checked on the server. Company access limits apply to everything: a parcel's company must be within the member's access to see it or pick it. Moving a parcel to another company needs access to both.

## Approvals
One new approvable action (slice 2), registered with the engine (decision 0024):

| Key | Label | Amount | When nobody else can approve | Excluded |
|---|---|---|---|---|
| `land.encumbrance.clear` | Clear an encumbrance | No | `refuse` (units must not unblock on one person's word) | The maker (as always) |

- `describe`: title "Clear caveat · Plot 22, Folu Ayo", the parcel's company, and the change *Status: Active → Cleared*, *Cleared on*, *Evidence*. Approve button: **Clear caveat and unblock sales** (or **Clear mortgage** when it didn't block).
- `execute` re-checks the encumbrance is still active and unchanged since the request; otherwise the request expires ("The caveat changed after this was asked").
- **Default rule**, written for every organization when slice 2 ships and at sign-up: *Any* · step 1 **Land & legal, Finance or Admin** → step 2 **Owner** · all companies (open question 1). In the golden thread, Ngozi asks, Aisha approves step 1, Olumide step 2. Owners can edit it in Approval rules.
- Nothing else in this module needs approval: recording an encumbrance must be instant, and stage updates, uploads and archiving are reversible and in the activity.

## User flows
**Add a parcel (J-LND-01, slice 1): 3 clicks plus typing**
1. Land & title → **Add parcel** (1), or ⌘K "New parcel". A side sheet opens (ParcelEditor, without the map until slice 3).
2. Name, state, LGA, area or town, size and unit, status (default *Under acquisition*), company (default: the company in the switcher, or the only one). *More options:* acquisition date, acquisition cost (₦), bought from, notes.
3. Drop files into *Documents* and pick each one's type (2). Under the stages, *Edit stages* sets them to match how the land was titled (e.g. C of O → Deed of assignment → Governor's consent for land bought with a title).
4. **Save parcel** (3). The parcel opens with the tracker; uploaded documents sit under their stage. **A stage whose document was uploaded here starts as granted** (owner, 28 Nov 2026), dated with the document's issue date if typed, otherwise left without a date and shown "Granted · date not recorded". Land that already has all its papers, saved as *Acquired*, opens as **Titled**. Toast "Plot 22, Folu Ayo added".

**Move a title stage (J-LND-02, slice 1): 2 clicks plus the upload**
1. Parcel detail → click the stage on the tracker, or the header button **Update C of O** (1). The *Update title stage* sheet opens with the likely next status selected (not started or in progress → *Submitted*; submitted or queried → *Granted*).
2. Attach the document, add the reference → **Save update** (2). The tracker moves; toast "C of O granted · Undo". If every stage is now granted on an acquired parcel, the badge reads *Titled*.

**Upload a document from a phone (slice 1): 3 taps**
Land & legal home on a phone → sticky **Upload document** (1) → parcel (last used pre-selected) and type → **Take photo** (2) → **Upload** (3).

**Record an encumbrance (J-LND-03, slice 2): 3 clicks plus typing**
1. Parcel detail → **Add encumbrance** (1) (also in the header's ⋯ and ⌘K).
2. Type, claimant, date, reference, evidence (2); for a mortgage, *Block sales on this parcel's units* (off).
3. **Record and block sales** (3) (**Record mortgage** when not blocking). The rose banner appears at once; owners are emailed.

**Clear an encumbrance (J-LND-03, slice 2): 3 clicks plus the evidence**
1. The banner's **Clear** (1) → *Clear encumbrance* sheet: date, evidence, note. The sheet says who approves: "Needs approval by Land & legal, Finance or Admin, then Owner. Sales unblock after the second approval."
2. **Send for approval** (2) → *Why?* → **Send for approval** (3). The banner adds "Clearing waiting for approval by Finance · nothing changes until it's approved" with **Cancel request**.
3. Approvers approve from Approvals (2 clicks each, brick 4). On the second, the encumbrance is cleared and the banner goes.

## Acceptance criteria
**Parcels (slice 1)**
- **Given** `land.create`, **when** I save a parcel with name, state, LGA, size and company, **then** it gets the next reference, status as chosen, the default stages for its state (or the stages I picked), `not_started` unless I uploaded their document, and `land.parcel.created` is audited.
- **Given** I upload a C of O (or any stage's document type) while adding a parcel, **then** that stage is saved as `granted` in the same transaction, with the document's issue date and number when typed, and `land.title_stage.updated` is audited with `metadata.fromAdd`. **Given** every stage has its document and status *Acquired*, **then** the parcel is `titled` on save. Family receipts, purchase agreements and *other* documents grant nothing. Later uploads (after the parcel exists) never grant a stage by themselves: the stage sheet does that.
- **Given** a parcel name already used by an active parcel, **when** I type it, **then** I see "There's already a parcel called Plot 22, Folu Ayo. Open it" and can still save.
- **Given** an LGA that isn't in the chosen state, **then** save is refused ("Pick an LGA in Lagos").
- **Given** size "12 plots" with no plot size, **then** it's stored as 7,200 m² and shown as "12 plots (0.72 ha)".
- **Given** an acquisition cost, **then** it's stored as `numeric(14,2)` with currency `NGN`; it's shown only to people allowed to see it (open question 5); others see the row without it.
- **Given** a member limited to Victoria Gardens Dev. Ltd, **then** the list, detail, ⌘K and home show only that company's parcels, the company field offers only that company, and another company's parcel id answers "not found".
- **Given** a parcel whose company is archived, **then** it's read-only with "Victoria Gardens Dev. Ltd is archived. Restore the company to change this parcel."
- **Given** `land.delete`, **when** I archive a parcel, **then** it leaves the list (toast with Undo), shows under the *Archived* filter, stays reachable by link read-only, and its documents stay. **Given** an active encumbrance on it (slice 2), **then** archiving is refused: "Clear the caveat before archiving this parcel."
- **Given** I'm offline, **then** Save, Update and Upload are disabled with "You're offline. Your changes are kept; save when you're back online."; nothing I typed is lost.

**Title stages (slice 1)**
- **Given** *Granted* without a document of the stage's type in the sheet or the vault, **then** save is refused: "Attach the C of O to mark it granted."
- **Given** *Queried* or *Rejected* without *What happened*, **then** "Say what the registry asked for." / "Say why it was rejected."
- **Given** a date in the future, **then** "Enter a date on or before today."
- **Given** every stage granted on an `acquired` parcel, **then** the status becomes `titled` in the same transaction; **given** one later changes, **then** it returns to `acquired`. A `prospect` or `under_acquisition` parcel never becomes titled on its own.
- **Given** someone else updated the stage since I opened the sheet, **then** save is refused, my input stays: "Ngozi Adeyemi updated this stage a moment ago. Check the latest, then save again."
- **Given** Edit stages, **then** I can add any catalog stage and remove a `not_started` stage with no documents; others show "This stage has started, so it stays."
- **Given** a stage update, **then** Undo in the toast restores the previous status within the toast's life; after that it's a new update.

**Documents (slice 1)**
- **Given** a type that already exists on the parcel, **then** the upload becomes the next version ("Upload as v2"); the vault shows the latest with "v2 · 2 earlier".
- **Given** a file over 25 MB or another format, **then** "This file is 31 MB. Upload files up to 25 MB." / "Upload a PDF or a photo (JPG, PNG or HEIC)." The type is checked from the file's content, not its name.
- **Given** the connection drops mid-upload, **then** the upload pauses ("Upload paused. It will continue when you're back online.") and resumes on reconnect while the page is open; a failed upload offers **Try again** and keeps the form.
- **Given** a download or preview, **then** the server checks `land.view` and company access, then returns a link valid for a few minutes; files are never public.
- **Given** Remove with a reason, **then** the version leaves the vault (Undo), and the activity shows "Removed survey plan v2 · wrong parcel"; if it was the only file behind a granted stage, the remove is refused: "This is the evidence for the granted C of O. Upload the right file first."

**Encumbrances (slice 2)**
- **Given** `land.create`, **when** I record a court order with evidence, **then** in one transaction it's saved `active`, the parcel is blocked, `land.encumbrance.recorded` is audited, and after commit every owner is emailed.
- **Given** no evidence, **then** "Attach the court order, caveat or other evidence."
- **Given** a mortgage recorded with *Block sales* off, **then** it shows amber "Mortgaged to Sterling Bank" wherever the parcel appears and doesn't block.
- **Given** several active encumbrances, **then** the banner names the most serious (court order, caveat, family dispute, lien, mortgage) and "and 2 more"; the parcel stays blocked until every blocking one is cleared.
- **Given** I edit an encumbrance's details, **then** type and the block choice can't change; the rest is audited.
- **Given** a clearing request, **then** only one can be pending per encumbrance; a second answers "There's already a request waiting for this. Open it".
- **Given** the last approval, **then** status `cleared`, the block lifts if nothing else blocks, and `land.encumbrance.cleared` is audited with the approvers. **Given** a rejection or expiry, **then** nothing changes and it still blocks.
- **Given** nobody but the maker can approve a step, **then** the request is refused before saving: "Nobody else can approve this in Lekki Pearl Estates Ltd. Ask an owner to add an approver to the rule."
- **Given** the sales-block rule, **then** an API test proves it returns blocked for every blocking type and not for a non-blocking mortgage, and that no procedure other than the approval's `execute` can set `cleared`.

**Everywhere**
- **Given** `land` isn't available to the organization, **then** Land & title is absent from the sidebar, ⌘K and Home, and every `land.*` procedure answers "not found".
- **Given** another organization's parcel, stage, document, version or encumbrance id, **then** "not found" (isolation test extended to every new table).
- **Given** a role without `land.view`, **then** the page is 403 and Home shows no land items.
- **Given** 375 px, **then** the list becomes cards with a chip row of filters and a sticky **Add parcel** above the tabs; sheets are full screen; targets are 44 px.

## Behind the scenes
- **Tables** (organization-scoped, composite keys, `createdAt` / `updatedAt`): `parcels` (entity, reference, status, size m², entered unit and plot size, location, acquisition cost and currency, seller text, `archivedAt`), `title_stages` (parcel, type, status, dates, reference, authority, follow-up date, note), `title_documents` (parcel, type, name for `other`, optional stage) and `title_document_versions` (file, number, issue date, authority, note, uploaded by, `removedAt` and reason), `encumbrances` (slice 2). A shared `files` table and storage service from the new decision record. Boundaries (slice 3) on `parcels`.
- **Reference data:** Nigeria's 36 states, the FCT and their LGAs as a fixed list in `packages/shared` (DOMAIN *Locale defaults* already requires it); the title stage and document type catalogs in code.
- **Audit actions:** `land.parcel.created`, `.updated`, `.archived`, `.restored`; `land.title_stage.updated`, `land.title_stages.changed`; `land.document.uploaded`, `land.document.removed`, `land.document.restored` (Undo of a remove, added in the plan), `land.document.link_issued` (each preview or download link issued, decision 0025; in the audit log, not the parcel's Activity); `land.encumbrance.recorded`, `.updated`, `.cleared` (with `approvedBy`). Each with a plain-words label and field labels (brick 4 test). The parcel's **Activity** is the first module record timeline (TimelineItem), read from the audit trail.
- **Email** (after commit, existing sender): *Encumbrance recorded* to every owner (open question 12). Clearing emails come from the approvals engine.
- **⌘K:** "New parcel", "Go to Land & title", and parcel search by name or reference.
- **Ledger:** none in this brick. The acquisition cost is stored, not posted; Finance offers posting it as a land asset (J-LND-01 "when finance confirms").
- **No AI.** Document reading is a separate AI add-on feature (`ai.document_extraction`); the manual form here is its manual path.

## Role homes (release plan §8)
Everything follows the company filter: *All companies* shows the group with a per-company bar in tiles; one company shows only its parcels. Queue items aren't ticked off; they leave when the record changes.

| Home | Adds | Slice |
|---|---|---|
| **Land & legal** tile 2 | **Titles in progress**: parcels not yet titled with a stage under way; line "1 stalled over 90 days". Before any parcel: "Add your first parcel". | 1 |
| **Land & legal** tile 1 | **Encumbrances blocking sales**: count of blocked parcels; line "Oldest since 4 Nov 2026". Sales later turns it into *Units blocked* with ₦ value. | 2 |
| **Land & legal** queue | "Answer the registry's query · Governor's consent, Plot 22" → **Update stage** (date of query) · "Follow up governor's consent · Plot 22" → **Update stage** (follow-up date) · "No movement on C of O for 94 days · Idu family land" → **Update stage** · *(slice 2)* "Hearing on 14 Jan · court order on Plot 22" (next date within 30 days; blocker) → **Open parcel** | 1, 2 |
| **Land & legal** panels | **Title pipeline**: parcels at each stage type and how long (HomeLand board). **Encumbrances**: type, parcel, what it blocks, next date. | 1, 2 |
| **Land & legal** phone | Sticky **Upload document** | 1 |
| **MD** queue | "Court order blocks sales on Plot 22, Folu Ayo" (blocker) → **Review** | 2 |

## UI copy
| Where | Copy |
|---|---|
| List | Title "Land & title" · subtitle "6 parcels · 45.00 ha · 2 blocked by encumbrances" · **Add parcel** · filters "All", "Titled", "In progress", "Encumbered", "Archived" · search "Search parcels" · columns Parcel · Location · Size · Title stage · Encumbrance |
| Empty | "No parcels yet. A parcel holds a piece of land's title stages, documents and any claims on it." → **Add parcel** |
| Filtered empty | "No parcels match these filters." → **Clear filters** |
| Add / edit | Title "Add parcel" / "Edit parcel" · labels "Parcel name", "State", "LGA", "Area or town", "Size", "Status", "Company", "More options", "Acquisition date", "Acquisition cost", "Bought from", "Documents" · "Drop PDFs or photos here, or choose files" · **Save parcel** |
| Status labels | "Prospect" (slate) · "Under acquisition" (amber) · "Acquired" (blue) · "Titled" (emerald) · "Archived" (slate) |
| Tracker | "Title stage · Stage 3 of 4" · stage states "Not started", "In progress", "Submitted 10 Oct 2026", "Queried 3 Nov 2026", "Granted 2 Sep 2025", "Rejected" · **Update governor's consent** · **Edit stages** |
| Stage sheet | Title "Update title stage" · "Plot 22 · each update is added to the parcel's history" · options "In progress", "Submitted", "Queried", "Granted", "Rejected" · "Date", "Reference", "Issued by", "What happened", "Follow up by", "Documents" · **Save update** · **Resubmit** |
| Documents | Columns Document · Stage · Version · Updated · "Up to 25 MB. A file of a type that's already here becomes a new version." · **Upload document** · **Upload as v2** · **Download** · **Remove** · remove dialog "Remove survey plan v2?" "It stays in the parcel's history with your reason." **Remove version** |
| Banner (slice 2) | "Court order FHC/L/CS/1182/2026 · New sales on this parcel's units are blocked until it's cleared. Hearing: 14 Jan 2027." → **Clear** · mortgage: "Mortgaged to Sterling Bank · sales aren't blocked" |
| Encumbrance sheets | "Add encumbrance" · "Type", "Claimant or holder", "Date served or lodged", "Reference", "Evidence", "Lawyer", "Next date" · "Block sales on this parcel's units" · locked note "A court order always blocks sales." · **Record and block sales** / **Record mortgage** · "Clear encumbrance" · "Cleared on", "Evidence of clearance", "Note" · "Needs approval by Land & legal, Finance or Admin, then Owner. Sales unblock after the second approval." · **Send for approval** |
| Waiting | "Clearing waiting for approval by Finance · Requested 2 h ago · sales stay blocked until it's approved" · **Cancel request** |
| Toasts | "Plot 22, Folu Ayo added" · "C of O granted · Undo" · "Governor's consent submitted · Undo" · "Survey plan v2 uploaded" · "Survey plan v2 removed · Undo" · "Parcel archived · Undo" · "Caveat recorded. Sales on this parcel are blocked." · "Sent to Aisha Bello for approval" |
| Errors | "Attach the C of O to mark it granted." · "Say what the registry asked for." · "Enter a date on or before today." · "Pick an LGA in Lagos." · "Attach the court order, caveat or other evidence." · "Clear the caveat before archiving this parcel." · "This is the evidence for the granted C of O. Upload the right file first." · "Upload paused. It will continue when you're back online." |
| Permission | "Only Land & legal can update title stages. Ask your organization owner." |
| Email (slice 2) | Subject "Caveat recorded on Plot 22, Folu Ayo" · "Ngozi Adeyemi recorded a caveat lodged by the Adeyemi family on 4 Nov 2026. New sales on this parcel's units are blocked until it's cleared and approved." → **Open parcel** · footer "Vento Real Estate" |

## Seed data (golden thread)
Organization Vento Homes Ltd; parcels match the LandTitle board where the golden thread allows:
- **P-0012 Plot 22, Folu Ayo** · Ibeju-Lekki, Ibeju-Lekki LGA, Lagos · 4.20 ha · Lekki Pearl Estates Ltd · acquired 2025 for ₦840,000,000 · family receipt, survey plan · excision gazette `granted`, C of O `in_progress` · a caveat by a neighbouring family recorded and later **cleared** with Aisha's and Olumide's approvals (in its activity).
- **P-0009 Victoria Gardens tract** · Ajah, Eti-Osa · 6.80 ha · Victoria Gardens Dev. Ltd · `titled`.
- **P-0015 Parkview Block B** · Gbagada, Kosofe · 1.10 ha · Parkview Residences SPV Ltd · C of O `submitted` · mortgage to Sterling Bank, **not blocking**.
- **P-0018 Idu family land** · Idu, AMAC, FCT · 12.00 ha · Vento Homes Ltd · R of O `queried` · active **caveat** (blocking), next date set.
- **P-0021 Epe farmland** · Epe · 20.00 ha · Vento Homes Ltd · `prospect`.
- **P-0007 Admiralty Way plot** · Lekki Phase 1, Eti-Osa · 0.90 ha · Vento Homes Ltd · `titled`.

## Departures from the approved designs
| Screen | Change | Why |
|---|---|---|
| LandTitle | No *Valuation* column, no *Map* toggle (slice 3), no *Project* column (Projects adds it), no bulk *Export title summary* or *Assign to project* | Valuations are R3; projects don't exist yet; exports aren't needed for the job yet |
| ParcelDetail | Tabs *Documents* and *Encumbrances* only; no *Surveys & valuations* (R3) or *Permits* (Compliance adds a link); no "Valued …" in the header | Release plan §2 |
| ParcelDetail | Header primary is **Update {current stage}** instead of "Record consent decision" | Works for every stage, not only consent |
| ParcelEditor | No *Title type* field (the stages say it); no map, beacons or *Area on survey plan* until slice 3; no `.dxf` / `.kml` import | Fewer fields; boundary is slice 3 |
| TitleStageUpdate | Statuses read Submitted, Queried, Granted, Rejected (board: Filed, Queried, Approved, Refused); no *Next action* text, only *Follow up by*; no "Tell Olumide Bankole (MD)" | DOMAIN words; "Approved" would be confused with approvals; no notifications panel yet (brick 4 decision 8), and the MD sees blockers on Home |
| EncumbranceAdd | *Block sales* is locked on except for a mortgage; no linked-unit count until Projects and Sales | Open question 2; units don't exist yet |
| EncumbranceClear | No *How it ended* picker (the note and evidence say it); approvers come from the rule, not fixed names | One source of approvers (decision 0024) |

## Screens this spec touches
Rows in `docs/design/SCREENS.md` (all `todo` today) to update when built:

| Screen | Board | Slice | What changes |
|---|---|---|---|
| Parcels list and map view | LandTitle, LandTitleMobile | 1 (list), 3 (map) | New |
| Parcel detail | ParcelDetail, ParcelDetailMobile | 1, 2 | New; row text drops surveys and valuations (R3) |
| Add / edit parcel | ParcelEditor, ParcelEditorMobile | 1, 3 | New; boundary in slice 3 |
| Title stage update (+ Edit stages sheet) | TitleStageUpdate, TitleStageMobile | 1 | New; Edit stages is `pattern` |
| Document vault | ParcelDetail (documents tab) | 1 | New; Remove dialog is `pattern` |
| Add / clear encumbrance | EncumbranceAdd, EncumbranceClear, EncumbranceMobile | 2 | New |
| Upload document (phone, from Home) | – | 1 | New row, `pattern` |
| Email: encumbrance recorded | – (EmailApproval layout) | 2 | New row, `pattern` |
| Role homes: Land & legal, MD | HomeLand, HomeLandMobile, ExecutiveHome | 1, 2 | Tiles, queue items, panels |
| ⌘K | – | 1 | New parcel, Land & title, parcel search |
| Assign survey, Record valuation | – | – | Unchanged; stay R3 |

## Journeys
- **J-LND-01** · Step 2 (boundary) moves to slice 3, with typed or pasted beacons only; drawing and GPS walking are later (open question 10). "Acquisition cost can post to the ledger" waits for Finance. Overlap warning is slice 3. Test `e2e/land/add-parcel.spec.ts`.
- **J-LND-02** · Adds `queried` and *Follow up by*; *Granted* needs a document; "the MD's digest mentions it" waits for the digest (R2). Test `e2e/land/title-stage.spec.ts`.
- **J-LND-03** · Approvers come from the default rule (step 1 Land & legal, Finance or Admin; step 2 Owner); notifications are an email to owners; a mortgage blocks only if chosen; "its units are blocked in Sales" is the server rule here, enforced on units when Projects and Sales ship. Test `e2e/land/encumbrance.spec.ts`.
- Golden thread step 3 holds as written if open question 1 is approved.

## Domain changes (`docs/DOMAIN.md`)
- **Land parcel:** add: reference `P-0001` per organization; always under one company; `prospect`, `under_acquisition`, `acquired` set by people, `titled` automatic when acquired and every stage is granted, `in_development` and `sold_out` set by Projects and Sales; size stored in m², a plot is 600 m² unless the parcel says otherwise; archived via `archivedAt`, refused while an encumbrance is active.
- **Title stage:** add status `queried` (`not_started → in_progress → submitted ⇄ queried → granted / rejected`); each parcel picks its stages from a catalog in fixed order; *current stage* = first not granted; granted needs a document of its type; optional follow-up date.
- **Title document:** add types `encumbrance_evidence` and `other` (named); a file of an existing type becomes a new version; versions are removed only with a reason and kept in history.
- **Encumbrance:** replace "its units are `blocked` for sale" with: "blocks sales while active, always for court order, caveat, lien and family dispute; for a mortgage only if chosen when recorded. Clearing is the approvable action *Clear an encumbrance* (default: Land & legal, Finance or Admin, then Owner)." Add *next date*.
- **Sales block:** new term: "A parcel with an active encumbrance that blocks sales. New reservations and subscriptions on its units are refused; existing subscriptions keep collecting." (Sales confirms the reservation rule.)
- **Approvable action:** add *Clear an encumbrance*.
- **Permission defaults** (if open question 1 is approved): Finance gets Approve in Land & title.

## Out of scope
- Surveys, surveyor assignments, valuations and the land bank tracker (R3); importing parcels (later, per release plan §2).
- Map drawing, GPS walking, survey-file import (open question 10).
- Posting the acquisition cost to the ledger, land costs per phase, stamp duty and consent fees (Finance).
- Linking parcels to projects and counting blocked units (Projects and Sales use this brick's rule).
- Permits on a parcel (Compliance, per project).
- Notifications panel and digest mentions; WhatsApp alerts.
- Registry integrations (PRODUCT: only where a reliable official API exists; none today).
- AI document reading (add-on; manual path is this spec).
- Exports (title summary, CSV) and a malware scan of uploads (raise in the security audit).

## Open questions (decided)
The owner approved every recommendation on 27 Nov 2026; each *Recommended* below is now the decision. Two still need an outside check before their slice is built: the title stage order (a property lawyer, before slice 1) and the coordinate systems by state (a licensed surveyor, before slice 3).

1. **Who approves clearing an encumbrance.** The sources disagree: the board says "Legal (Ngozi), then MD"; the golden thread says Olumide and Aisha approve; DOMAIN says "two approvals". The engine needs each approver to have Approve in Land & title, and the maker (usually Ngozi) can't approve. *Recommended:* default rule **step 1 Land & legal, Finance or Admin → step 2 Owner**, and give the built-in **Finance** role **Approve in Land & title** (its other Land rights stay View). That makes the golden thread work and gives small firms with one legal officer a second person. If nobody can approve, the request is refused and the owner edits the rule.
2. **Does a mortgage block sales?** DOMAIN says every active encumbrance blocks; the boards show Parkview's mortgage to Sterling Bank as security for a construction facility, which in practice allows sales with the lender's release. Blocking it would freeze sales on every bank-financed project. *Recommended:* court order, caveat, lien and family dispute **always** block; a mortgage blocks **only if ticked** when recorded (off by default). Fixed once saved.
3. **Which units an encumbrance blocks.** Units belong to projects, projects sit on one or more parcels. *Recommended:* for now, **every unit of every project on the parcel**; if a multi-parcel project needs finer control, the Sales or Projects spec adds a parcel to each unit. Existing subscriptions keep collecting; only new reservations and subscriptions are refused.
4. **Must every parcel have a company?** The role-homes research allows "Not assigned" parcels under *All companies*; J-LND-01 lists the company as a field. *Recommended:* **required**, pre-filled from the switcher (or the only company). Land is usually bought by the holding company and moved to an SPV later, which is an edit. It avoids a special visibility rule for limited members.
5. **Who sees the acquisition cost.** Land & title view goes to Sales, PM and Viewer too. *Recommended:* shown to people who can **edit Land & title or view Finance**; no new permission. **Decided by the owner, 28 Nov 2026:** "Bought from" (the seller) follows the same rule: others get the parcel without it (on the page, in Activity and in the audit log), and the audit trail records only that a seller was recorded or changed, never the name.
6. **Default title stages and their order.** *Recommended:* catalog order Survey plan → Excision gazette → R of O → C of O → Deed of assignment → Governor's consent; new parcels start with Survey plan, Excision gazette, C of O; each parcel edits its own list. The board puts governor's consent before the deed of assignment and has no excision gazette. **Decided by the owner, 28 Nov 2026:** use common Nigerian practice now and correct it later if a property lawyer disagrees. Catalog order as above (a deed of assignment comes before the governor's consent that perfects it). Defaults: **Survey plan → Excision gazette → C of O** in every state except the FCT, where it is **Survey plan → R of O → C of O** (AGIS). Governor's consent and deed of assignment are not defaults: they apply when a developer buys land that already has a C of O, and Ngozi adds them with Edit stages. Stamping and registration of the deed are part of perfecting title but aren't tracked as stages in v1.
7. **Add `queried` and keep the DOMAIN words.** *Recommended:* yes. The registry querying a file is the most common hold-up; the board has it. Show *Submitted, Granted, Rejected* (not the board's Filed, Approved, Refused), since "Approved" would read as an approval request.
8. **Several documents of one type.** A parcel can have several family receipts or purchase agreements (land bought from several families), and several deeds. *Recommended:* a same-type upload is always a new version (the board's rule) **except** family receipt, land purchase agreement, deed of assignment and other, where the sheet offers a quiet **Add as a separate document** link.
9. **Where documents are stored.** Title documents name sellers and families (personal data under the NDPA 2023). *Recommended:* a private, encrypted, S3-compatible bucket with short-lived signed links; the architect's decision record picks the provider and region and states the basis for any transfer outside Nigeria. This is the first file feature, so it sets the pattern for receipts, site photos and KYC.
10. **Slice 3: coordinates and maps.** The journey and board say "Minna datum, UTM 31N", but zone 31N stops at 6°E, so the board's own Idu (Abuja) parcel is in zone 32N, and many Lagos plans use the Nigeria West Belt grid. *Recommended:* a per-parcel coordinate system with a default by state, from a short list a **licensed surveyor confirms** before slice 3; slice 3 ships typed and pasted beacons with a map (OpenStreetMap-based tiles; provider chosen for cost and privacy); **drawing on the map and walking by GPS are later**, because the survey plan's beacons are the legal boundary.
11. **Slice order.** *Recommended:* as proposed (parcels and title, then encumbrances, then boundary), with slice 2 **released before or together with Sales**, never after.
12. **Who is emailed when an encumbrance is recorded.** J-LND-03 says MD and sales manager. *Recommended:* **every owner** now; Sales adds members who can create subscriptions in that company when it ships.
