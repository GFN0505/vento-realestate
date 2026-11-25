# J-ALL-00 · The golden thread: land to estate

One fictional developer, followed through every module. Use it to:
- **demo** the product end to end (about 20 minutes),
- **seed** local development data (`pnpm db:seed` should produce exactly this world),
- **check connections** between modules: if a step here breaks, a module boundary is wrong.

All names and figures are fictional.

## The cast
| Who | Role in Vento |
|---|---|
| **Oakridge Developments Ltd** | Organization (the developer group) and holding entity |
| **Oakridge Palm Grove SPV Ltd** | Entity (project SPV) that owns the project, its bank accounts and its ledger |
| Tunde Bakare | MD (`owner`) |
| Ngozi Eze | Land & legal officer (`land_legal`) |
| Emeka Okafor | Project manager (`project_manager`) |
| Halima Yusuf | Site engineer (`project_manager`, limited to the Palm Grove project) |
| Funmi Adeyemi | Sales manager (`sales`) |
| Kunle Ojo | Finance manager (`finance`, approver) |
| Blessing Udo | Finance officer (`finance`) |
| Aisha Bello | HR (`hr`) |
| Samuel Etim | Facility manager (`facility`) |
| Chiamaka Obi | Buyer, lives in Manchester (segment `diaspora_uk`) |
| Femi Lawal | Buyer, lives in Lagos (segment `local`) |
| Ade Realty (Dayo Ade) | External realtor |

## The story

### 1. Land (Ngozi)
1. Registers **Parcel OK-001**, 4.2 hectares in Ibeju-Lekki, Lagos, bought for ₦840,000,000 with a family receipt and survey plan. Draws the boundary on the map. → J-LND-01
2. Starts title perfection: excision gazette `granted`, C of O `in_progress`. Uploads each document as it arrives. → J-LND-02
3. A caveat is lodged by a neighbouring family. She records the **encumbrance**; every screen that shows OK-001 now carries a rose warning. Two months later it is withdrawn and she clears it with the court letter as evidence. → J-LND-03

### 2. Project (Emeka, Halima)
4. Emeka creates **Palm Grove Residences** on OK-001, owned by the SPV, with eight phases from `site_prep` to `handover`, a ₦3.1bn budget and a BoQ imported from the QS's Excel file. → J-PRJ-01
5. Halima logs the daily site diary from her phone, offline at the site, with photos; it syncs when she's back on signal. A two-day delay is logged with reason `materials`. → J-PRJ-02
6. She requests 2,000 bags of cement; Emeka raises a PO, Kunle approves it, and the goods are received in two deliveries. Actual cost on the substructure phase moves. → J-PRJ-03

### 3. Sales (Funmi, Ade Realty)
7. Funmi bulk-creates 60 units (Block A–C, 3- and 4-bed terraces) and sets the Phase 1 price list: 3-bed ₦85,000,000. → J-SAL-01
8. Dayo of Ade Realty registers Femi Lawal as a lead from the realtor portal; the lead is protected to Ade Realty for 90 days. Chiamaka Obi arrives from an Instagram campaign. → J-RLT-01, J-SAL-02
9. Chiamaka inspects by video call, and Funmi subscribes her to **Unit A-07** on a 24-month plan: 30% deposit, then 24 monthly instalments. Femi buys B-12 outright. The letter of offer goes out on WhatsApp. → J-SAL-03
10. Chiamaka's KYC is verified with her passport; the large purchase asks for source of funds. → J-CMP-01
11. The contract of sale is generated, approved by Ngozi and e-signed by Chiamaka. → J-DOC-01

### 4. Money (Blessing, Kunle)
12. Chiamaka sends her deposit in GBP. Blessing records it with the CBN rate of the day; the NGN equivalent posts to the SPV ledger. → J-FIN-04
13. Later instalments arrive through Chiamaka's Paystack virtual account and post themselves. → J-FIN-02
14. Femi's ₦85,000,000 transfer is in the bank statement import and gets matched. It trips the large-transaction AML rule and goes to review; Ngozi clears it with notes. → J-FIN-03, J-CMP-02
15. Ade Realty's 3% commission on Femi's sale is earned on the cleared receipt and paid after approval. → J-SAL-08
16. Kunle draws down ₦500,000,000 from the construction facility and pays the roofing contractor's bill net of WHT. → J-FIN-07, J-FIN-06
17. Month end: Kunle closes the period and prints the SPV's trial balance and P&L. → J-FIN-08

### 5. Trouble (Funmi, Kunle)
18. Another buyer, on unit C-03, misses three instalments. The delinquency list ages them to 61–90 days; bulk WhatsApp reminders go out. → J-SAL-04
19. Their plan is rescheduled once (approved by Kunle). They default again; the subscription is cancelled with a refund calculated from the contract terms, approved and paid. C-03 returns to `available`. → J-SAL-05, J-SAL-06

### 6. People (Aisha)
20. Aisha runs October payroll for the SPV's 14 staff; Kunle approves; payslips go out. Halima's site workers are paid weekly from attendance. → J-HR-01, J-HR-02

### 7. Handover and estate (Emeka, Samuel)
21. Chiamaka completes payment. Her allocation letter is issued, the handover checklist is walked with her cousin on site, and A-07 moves to `handed_over`. → J-SAL-07
22. Palm Grove becomes an **estate**. Samuel bills the first quarter's service charge and resolves a borehole pump request. → J-FAC-01, J-FAC-02

### 8. The view from the top (Tunde)
23. Every morning Tunde gets a WhatsApp digest, checks the executive home and approves what is waiting for him. At quarter end he builds the board pack. → J-EXE-01, J-EXE-02, J-EXE-03
24. In Manchester, Chiamaka opens the buyer portal to see this week's construction photos and download her receipts. → J-BUY-01, J-BUY-02

## Connections this proves
| From | To | Check |
|---|---|---|
| Parcel encumbrance | Project, units, new subscription | Warning shows everywhere the parcel is used |
| Milestone complete | Construction-linked instalments | Instalments become `due` and buyers are notified |
| Receipt | Instalment status, ledger, commission, AML, buyer portal | One receipt updates all five, in one transaction |
| Cancellation | Unit status, refund, ledger, commission clawback | Unit back to `available`, refund posted, commission reversed if unpaid |
| Handover | Estate, service charge, revenue recognition | Unit appears in the estate; revenue recognised per the project's policy |
| PO received | Phase actual cost, budget variance, vendor scorecard | All update from the goods-received note |
