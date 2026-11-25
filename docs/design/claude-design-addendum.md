# Claude Design add-on prompt

Paste everything below the line into your ongoing Claude Design session, after the main prompt's screens.

---

Please extend the Vento design with these capabilities. Keep the same design system, and keep everything calm and uncluttered.

## Core capabilities (always available)
1. **Approvals (maker-checker):** an "Approvals" inbox (badge in the top bar) listing pending requests with what's being changed, amount, who asked and why; approve/reject with a comment. On the requesting side, the action shows "Waiting for approval by Finance" instead of completing. A user can't approve their own request.
2. **Activity timeline:** on every record's detail page, a right-side timeline of who did what and when, including approvals and before/after values for changes.
3. **Excel import wizard:** upload → map columns (auto-suggested, editable) → preview with row-level errors to fix → import → summary with "Undo import". Used for units, buyers, subscriptions, payments to date, parcels and staff. Make it feel safe and reversible.
4. **Interactive estate layout:** a project's site plan with each plot/unit coloured by status (available, reserved, sold, fully paid, overdue). Hover shows unit, buyer, price and balance; click opens the unit or starts a sale. Include the setup step: upload the plan and place/draw units on it. Works on tablet for sales teams in the field.
5. **Two-way WhatsApp:** buyer replies shown in the contact's timeline as a conversation, with quick replies and message templates.
6. **Role homes and daily digest:** show how Home differs for MD, Sales, Site and Finance, and design the WhatsApp/email morning digest for the MD.
7. **Realtor portal:** external agents register leads (with a duplicate warning), see their deals' status and commission earned/paid.
8. **Security settings:** two-factor setup, active sessions, role templates.
9. **e-KYC:** "Verify NIN" on a buyer, with verified/failed states and the ID number masked.

## AI add-on (optional, off by default)
AI must feel helpful and trustworthy, never pushy. Every AI element is clearly marked with a small, consistent AI indicator, and is always a **suggestion** the user accepts, edits or dismisses. Every screen also works fully without AI.

1. **Settings → AI:** each AI feature with an on/off switch, a one-line description and its estimated cost; a monthly budget field; a usage meter (this month's spend vs budget, by feature); alert settings.
2. **Budget states:** the 80% warning banner, and the "AI limit reached for this month — continue manually" state that shows the normal manual form.
3. **Document reading:** upload a title document, survey plan or bank teller; the document shows on the left and suggested fields on the right with confidence, each with accept/edit; mismatches with existing records highlighted.
4. **Payment matching:** an imported bank statement table with a suggested buyer and instalment per line, confidence and reason; confirm one, or bulk-confirm high-confidence lines; unmatched lines go to a review queue.
5. **Ask Vento in ⌘K:** type a question in plain English; the answer is a short sentence plus a real table of records with actions (e.g. "Send reminder to these 14 buyers"); show "Based on 14 subscriptions you have access to".
6. **Drafting:** "Draft with AI" in the document editor and reminder composer; the draft appears for editing, never sent automatically; board-pack commentary generated as an editable section.
7. **Voice site diary (mobile):** hold-to-record a voice note, add photos, review the structured entry (work done, workers, delays) before saving.
8. **Predictions:** a default-risk badge on buyers and subscriptions with "Why?" showing the reasons; a 13-week cash-flow forecast chart on the executive home; budget overrun early warnings on projects.
9. **Anomaly flags:** a review queue of flagged items (duplicate payment, unusual vendor price, AML-style pattern) with reason and actions.

## Deliverables
Add these screens and states (desktop and mobile, light and dark) to the existing set, and add to the design system: approval badge and inbox row, timeline item, import step indicator, layout map plot states, AI indicator, AI suggestion field (accept/edit/dismiss), confidence indicator, usage meter.
