# Land and title

## J-LND-01 · Register a parcel and start title perfection
**Who / how often:** Land & legal officer, a few times a year per acquisition.
**Starts from:** *Parcels list* → "Add parcel", or ⌘K "New parcel".

**Steps**
1. *Add / edit parcel:* name/reference, state, LGA, area, size (hectares, plots or m²), acquisition cost and date, seller, entity.
2. Boundary: draw on the map, type the beacons from the survey plan (Minna datum, UTM 31N), or on a phone walk the boundary capturing each beacon by GPS.
3. Upload what exists now (family receipt, survey plan, purchase agreement). Each becomes a title document.
4. "Save parcel" → *Parcel detail* with the title stage tracker showing the stages for this parcel's path (e.g. survey plan → excision gazette → C of O → governor's consent).

**Behind the scenes:** parcel status `under_acquisition` or `acquired`; acquisition cost can post to the entity's ledger (land asset) when finance confirms; audit event.
**Done when:** the parcel shows on the map and in the list with its title progress.
**Watch for:** overlapping boundary with an existing parcel (warn); upload on a weak connection (resumable, progress shown); size units conversion.
**Target:** under 3 minutes. **Test:** `e2e/land/add-parcel.spec.ts` **Status:** draft

## J-LND-02 · Move a title stage forward with evidence
**Who / how often:** Land & legal, whenever the registry moves.
**Starts from:** *Parcel detail* → title tracker, or the "Title stages waiting" card on the Land & legal home.

**Steps**
1. Click the stage → *Title stage update:* new status (`submitted`, `granted`, `rejected`), date, reference number, issuing authority, document upload.
2. Save. The tracker moves; the next stage becomes current.

**Behind the scenes:** a granted C of O or governor's consent sets the parcel to `titled` once all required stages are granted; document versioned; audit event; the MD's digest mentions it.
**Watch for:** `rejected` requires a reason and offers "Resubmit"; uploading a document of a type that already exists adds a version instead of a new file.
**Target:** 2 clicks plus upload. **Test:** `e2e/land/title-stage.spec.ts` **Status:** draft

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
