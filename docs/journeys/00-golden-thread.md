# J-ALL-00 · The golden thread: land to estate

One fictional developer, followed through every module. Use it to:
- **demo** the product end to end (about 20 minutes),
- **seed** local development data (`pnpm db:seed` should produce exactly this world),
- **check connections** between modules: if a step here breaks, a module boundary is wrong.

The names, companies and figures match the approved designs (`docs/design/DESIGN-NOTES.md`, *Fictional world*), so screenshots of the app line up with the boards. All of it is fictional.

## The cast
| Who | Role in Vento |
|---|---|
| **Vento Homes Ltd** | Organization (the developer group) and holding entity, 12 Admiralty Way, Lekki Phase 1 |
| **Victoria Gardens Dev. Ltd** | Entity (SPV) that owns Victoria Gardens Phase 2, its bank accounts and its ledger |
| **Parkview Residences SPV Ltd**, **Lekki Pearl Estates Ltd** | Other SPVs, each with its own project and ledger |
| Olumide Bankole | MD (`owner`) |
| Ngozi Adeyemi | Land & legal (`land_legal`) |
| Kunle Ojo | Project manager (`project_manager`) |
| Halima Yusuf | Site engineer (`project_manager`, limited to Victoria Gardens) |
| Grace Umeh | Sales manager (`sales`) |
| Aisha Bello | Finance manager (`finance`, approver) |
| Tunde Ola | Accountant (`finance`) |
| Kemi Adebayo | HR (`hr`) |
| Ope Martins | Facility manager (`facility`) |
| Adaeze Okonkwo | Buyer in Lagos (segment `local`), Victoria Gardens A-14 |
| Chidi Eze | Buyer in the UK (segment `diaspora_uk`), Parkview Residences B-02 |
| Tunde Bakare | Buyer, Lekki Pearl C-09, falls behind on payments |
| Lekki Realty | External realtor |

## The story

### 1. Land (Ngozi)
1. Registers the Lekki Pearl parcel, 4.20 hectares in Ibeju-Lekki, Lagos, bought for ₦840,000,000 with a family receipt and survey plan. Types the beacons from the survey plan. → J-LND-01
2. Starts title perfection: excision gazette `granted`, C of O `in_progress`. Uploads each document as it arrives. → J-LND-02
3. A caveat is lodged by a neighbouring family. She records the **encumbrance**; the parcel shows a rose banner and its units are **blocked** in Sales. Two months later it is withdrawn; she clears it with the court letter, Olumide and Aisha approve, and the units unblock. → J-LND-03

### 2. Project (Kunle, Halima)
4. Kunle creates **Victoria Gardens Phase 2**, owned by Victoria Gardens Dev. Ltd, with eight phases from `site_prep` to `handover`, a ₦3.1bn budget and a BoQ imported from the QS's Excel file. → J-PRJ-01
5. Halima logs the daily site diary from her phone, offline at the site, with photos; it syncs when she's back on signal. A two-day delay is logged with reason `materials`. → J-PRJ-02
6. She requests 2,000 bags of cement (under Kunle's ₦5m limit, so it goes straight to purchasing). Kunle raises a PO and the goods are received in two deliveries. Actual cost on the substructure phase moves. → J-PRJ-03

### 3. Sales (Grace, Lekki Realty)
7. Grace bulk-creates 60 units (Blocks A–C, 3- and 4-bed terraces) and schedules the Phase 2 price list (3-bed ₦85,000,000); Aisha approves the prices. → J-SAL-01
8. Lekki Realty registers a lead from the partner portal. Adaeze Okonkwo arrives from an Instagram campaign; Chidi Eze from a UK webinar. → J-RLT-01, J-SAL-02
9. Grace subscribes Adaeze to **Victoria Gardens A-14** for ₦85,000,000 on a 24-month plan: 30% deposit, then 24 monthly instalments. Chidi subscribes to **Parkview B-02** on a plan fixed in GBP (£42,000), with the ₦ equivalent shown. Letters of offer go out on WhatsApp. → J-SAL-03
10. Chidi's KYC is verified with his passport; the large purchase asks for source of funds. → J-CMP-01
11. Adaeze's contract of sale is generated, approved by Ngozi and e-signed. → J-DOC-01

### 4. Money (Tunde Ola, Aisha)
12. Chidi sends his deposit in GBP. Tunde records it at the CBN rate of the day; the NGN equivalent posts to the Parkview SPV's ledger. → J-FIN-04
13. Adaeze's later instalments arrive through her Paystack virtual account and post themselves. → J-FIN-02
14. Adaeze's deposit is in the bank statement import and gets matched. A separate large cash deposit from another buyer is held for AML review; Ngozi clears it with notes. → J-FIN-03, J-CMP-02
15. Lekki Realty's commission on its sale is earned on cleared receipts and paid after approval, with WHT shown. → J-SAL-08
16. Aisha draws down ₦500,000,000 from the construction facility and pays the roofing contractor's bill net of WHT. → J-FIN-07, J-FIN-06
17. Month end: Aisha closes the period and prints the SPV's trial balance and P&L. → J-FIN-08

### 5. Trouble (Grace, Aisha)
18. Tunde Bakare, on Lekki Pearl C-09, misses three instalments. The delinquency queue ages him to 61–90 days; reminders go out on WhatsApp. → J-SAL-04
19. His plan is rescheduled once (approved by Aisha). He defaults again; the subscription is cancelled with a refund calculated from the contract clauses, approved and paid. C-09 returns to `available`. → J-SAL-05, J-SAL-06

### 6. People (Kemi)
20. Kemi runs November payroll for the SPV's staff; Aisha approves; payslips go out. Halima's site workers are paid weekly from attendance. → J-HR-01, J-HR-02

### 7. Handover and estate (Kunle, Ope)
21. Adaeze completes payment. Her allocation letter is issued, the handover checklist is walked with her on site, and A-14 moves to `handed_over`. → J-SAL-07
22. Victoria Gardens becomes an **estate**. Ope bills the first quarter's service charge and resolves a borehole pump request. → J-FAC-01, J-FAC-02

### 8. The view from the top (Olumide)
23. Every morning Olumide gets a WhatsApp digest, checks the executive home and approves what is waiting for him. At quarter end he builds the board pack. → J-EXE-01, J-EXE-02, J-EXE-03
24. In the UK, Chidi opens the buyer portal with a one-time code to see this week's construction photos and download his receipts. → J-BUY-01, J-BUY-02

## Connections this proves
| From | To | Check |
|---|---|---|
| Parcel encumbrance | Parcel list, parcel, units in Sales | Badge, banner, and units blocked until the clearance is approved twice |
| Milestone complete | Construction-linked instalments | Instalments become `due` and buyers are notified |
| Receipt | Instalment status, ledger, commission, AML, buyer portal | One receipt updates all five, in one transaction |
| Cancellation | Unit status, refund, ledger, commission clawback | Unit back to `available`, refund posted, commission reversed if unpaid |
| Handover | Estate, service charge, revenue recognition | Unit appears in the estate; revenue recognised per the project's policy |
| PO received | Phase actual cost, budget variance, vendor scorecard | All update from the goods-received note |
| Two SPVs | Ledgers, bank accounts, consolidation | Chidi's GBP receipt is only in Parkview's ledger; consolidated statements include both |
