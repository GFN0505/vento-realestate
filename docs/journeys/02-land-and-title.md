# Land and title

Spec: [land-and-title](../specs/land-and-title.md). Slice 1 (parcels, title stages, document vault, Land & legal home) is built behind the `land` feature at early access; encumbrances are slice 2 and the boundary and map are slice 3.

## J-LND-01 · Register a parcel and start title perfection
**Who / how often:** Land & legal officer (Ngozi Adeyemi), a few times a year per acquisition.
**Starts from:** *Parcels list* → **Add parcel**, ⌘K **New parcel**, or the *Titles in progress* tile's "Add your first parcel" on Home before there are any parcels.

**Steps**
1. Land & title → **Add parcel** (1). *Add / edit parcel* opens as a side sheet (full screen on phones), held in the address (`?sheet=add`), so Back closes it.
2. Type the **Parcel name** ("Plot 22, Folu Ayo"). Pick **State** and **LGA** (the LGA list follows the state; changing the state clears an LGA that isn't in it), **Area or town**, and **Size** with its unit (hectares, m² or plots; plots can say their own size, "12 plots of 648 m²"). **Status** starts on *Under acquisition*. **Company** starts on the company in the switcher, else the only one, else the last one used on this device; the state is remembered the same way. *More options:* **Acquisition date**, **Acquisition cost** (₦), **Bought from**, notes.
3. Drop the papers into *Documents* (or **Choose files**, or **Take photo** on a phone). Each file starts uploading at once and gets a type guessed from its name ("survey", "gazette", "c of o", "consent", "deed", "receipt", "agreement"); a stage's document can take its number and issue date. *Title stages* shows the state's usual stages (Survey plan → Excision gazette → C of O; in the FCT Survey plan → R of O → C of O), each marked *Granted* once its document is among the files. **Edit stages** sets them to how the land was titled; a dropped document whose stage isn't in the list adds that stage, granted.
4. **Save parcel** (2). It waits for uploads still going ("Waiting for 1 upload…"). *Parcel detail* opens with the title stage tracker; uploaded documents sit in the vault under their names. Toast "Plot 22, Folu Ayo added".

(The boundary step, typing or pasting the beacons from the survey plan, is slice 3 with the map. It isn't built.)

**Behind the scenes:** the next reference (`P-0022`), never reused; size stored in m²; the state's default stages, or the ones picked; every stage whose document was uploaded is saved `granted` in the same transaction (dated with the document's issue date, otherwise "Granted · date not recorded"), and an *Acquired* parcel with every stage evidenced opens as `titled`. Family receipts, purchase agreements and *other* documents grant nothing. Audit: `land.parcel.created`, `land.document.uploaded` per file, `land.title_stage.updated` with `fromAdd`. The acquisition cost is stored in NGN, not posted to the ledger (Finance offers that later).
**Done when:** the parcel is in the list with its title stage and status, and its documents are in the vault.
**Watch for:**
- A name already used by an active parcel: "There's already a parcel called Plot 22, Folu Ayo." with **Open it**; saving is still allowed.
- An LGA outside the state: "Pick an LGA in Lagos."
- A member limited to some companies only sees and picks those companies; another company's parcel answers "not found".
- Sales, PM and Viewer see the parcel without acquisition date, cost or seller.
- A file over 25 MB or not a PDF, JPG, PNG or HEIC is refused with its reason; a dropped connection pauses the upload ("Upload paused. It will continue when you're back online.") and it resumes while the page is open; **Try again** on a failed file keeps the form.
- Offline: **Save parcel** is off with "You're offline. Your changes are kept; save when you're back online."
- A parcel of an archived company is read-only with "{Company} is archived. Restore the company to change this parcel."
- Fields are checked when you leave them only once something was typed, and all of them on Save; the cursor goes to the first problem.

**Target:** 2 clicks plus typing; under 2 minutes with two documents (the 3-minute target included the boundary, slice 3). **Test:** `apps/web/e2e/land/add-parcel.spec.ts` **Status:** built (boundary in slice 3)

## J-LND-02 · Move a title stage forward with evidence
**Who / how often:** Land & legal, whenever the registry moves (weekly), often on a phone at the Lands Bureau.
**Starts from:** *Parcel detail* → a stage on the tracker or the header's **Update {current stage}** (e.g. **Update C of O**; on phones a sticky button); a queue item's **Update stage** on the Land & legal home; or ⌘K the parcel's name.

**Steps**
1. Click the stage, or **Update C of O** (1). *Title stage update* opens as a side sheet (full screen on phones), held in the address (`?sheet=stage&stage=c_of_o`), so Back closes it. **Stage** at the top can switch to another stage until something is typed. The likely next status is selected (not started or in progress → *Submitted*; submitted or queried → *Granted*), **Date** is today, **Issued by** is the authority last used for that stage in the state.
2. Pick a status: *In progress*, *Submitted*, *Queried*, *Granted* or *Rejected*. Add the **Reference** (file number), **What happened** (needed for *Queried*, *Rejected*, and when a granted stage changes), and for *Submitted* or *Queried* an optional **Follow up by** date ("It shows in your Home queue on that day.").
3. *Documents:* for *Granted*, drop the stage's document, or use the one already in the vault ("Uses C of O v1 from the vault."). For other statuses a file starts as a named document: *Application acknowledgement*, *Query letter* or *Rejection letter*.
4. **Save update** (2) (**Resubmit** when a rejected stage goes back to *Submitted*). The tracker moves; toast "C of O granted · Undo". If every stage is now granted on an *Acquired* parcel, the badge reads *Titled*.

**Behind the scenes:** one transaction updates the stage, files attachments (a stage's document becomes its next version; the reference and date become the version's number and issue date), and sets the parcel `titled` or back to `acquired`. Audit `land.title_stage.updated` (and `land.document.uploaded`), shown in the parcel's *Activity*. A follow-up date puts a "Follow up C of O" item in the queue on that day; a stage in progress or submitted for 90 days with no follow-up date shows as stalled. Undo is open to the author for 2 minutes, until someone else changes the stage. (The MD's digest mention waits for the digest, R2.)
**Done when:** the tracker shows the new status and date, the evidence is in the vault, and any queue item for that stage has left Home.
**Watch for:**
- *Granted* with no document of the stage's type: "Attach the C of O to mark it granted."
- *Queried* or *Rejected* without *What happened*: "Say what the registry asked for." / "Say why it was rejected."; a date after today: "Enter a date on or before today."
- Someone else updated the stage first: "Ngozi Adeyemi updated this stage a moment ago. Check the latest, then save again." What was typed stays.
- Closing the sheet with changes asks first.
- Roles with view only (Sales, PM, Finance, Viewer) see the tracker; stages don't open.
- **Edit stages** (⋯ menu or the tracker): add any catalog stage; a stage that has started or holds a document stays; at least one stays.
- Documents: a type already in the vault becomes its next version ("Upload as v2", "v2 · 2 earlier"); **Remove** a version needs a reason, leaves with Undo and stays in the activity; the only file behind a granted stage can't be removed ("This is the evidence for the granted C of O. Upload the right file first."). Preview holds its place in the address (Back closes it); phones open the browser's viewer; HEIC photos download.
- From Home on a phone: sticky **Upload document** → parcel (last used) and type (picked, else guessed from the file name, else the current stage's document) → **Take photo** → **Upload**: 3 taps. Toast with **Open parcel**. An upload never grants a stage by itself.

**Target:** 2 clicks plus the upload. **Test:** `apps/web/e2e/land/title-stage.spec.ts`, `apps/web/e2e/land/documents.spec.ts`, `apps/web/e2e/home/land-home.spec.ts` **Status:** built

## J-LND-03 · Record and clear an encumbrance
**Who / how often:** Land & legal, rare but critical.
**Starts from:** *Parcel detail* → Encumbrances → "Add encumbrance".

**Steps**
1. *Add / clear encumbrance:* type (`mortgage`, `caveat`, `court_order`, `lien`, `family_dispute`), party, date, reference, evidence upload, notes.
2. Save. The parcel gets a rose badge in the list and a banner on its page, and **its units are blocked in Sales**: a court order has to stop a sale wherever one could start.
3. Later: "Clear encumbrance" with the clearance date and evidence (court letter, discharge). Clearing needs **two approvals**; units unblock after the second.

**Behind the scenes:** notifications to MD and sales manager; affected units can't be subscribed while the encumbrance is active; audit events.
**Watch for:** clearing without evidence (blocked); several active encumbrances on one parcel.
**Test:** `e2e/land/encumbrance.spec.ts` **Status:** draft
