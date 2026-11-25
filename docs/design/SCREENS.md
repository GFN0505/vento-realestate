# Screen inventory

The single list of every screen, sheet, dialog, document and message the product needs, derived from `docs/PRODUCT.md` and `docs/DOMAIN.md`, not from the design. Keep it current: when a feature adds, changes or removes a screen, update this file in the same change.

**Design** — `✓` in a Claude Design prompt (`P` main prompt, `A` add-on) · `–` not designed yet
**Status** — `todo` · `pattern` (built from design-system patterns, no bespoke design) · `built` (matches an approved design) · `needs-design` (flagged for a design pass)

Every list screen implies its empty, filtered-empty, loading and error states; every form implies validation, saving and error states. Those aren't listed separately.

## 0. Foundation and account
| Screen | Design | Status |
|---|---|---|
| Sign in, two-factor challenge | – | todo |
| Sign up, verify email | – | todo |
| Forgot / reset password | – | todo |
| Accept invitation | – | todo |
| Onboarding: organization → first entity → first project and units | ✓ P | todo |
| Setup checklist on Home | ✓ P | todo |
| App shell: sidebar, top bar, entity/project switcher, mobile bottom nav | ✓ P | todo |
| ⌘K command palette | ✓ P | todo |
| Notifications panel and notification preferences | – | todo |
| Approvals inbox | ✓ A | todo |
| Global search results page | – | todo |
| Keyboard shortcuts help (`?`) | – | todo |
| My profile, password, two-factor, active sessions | ✓ A (security) | todo |
| 403 no access, 404 not found, 500 error, offline, maintenance | – | todo |
| Session expired / signed out elsewhere | – | todo |

## 1. Home and analytics
| Screen | Design | Status |
|---|---|---|
| Executive home | ✓ P | todo |
| Role homes: Sales, Site, Finance, Land & legal, HR, Facility | ✓ A (partial) | todo |
| Daily digest (WhatsApp and email) | ✓ A | todo |
| Dashboards: collections, delinquency, project progress, cash by entity, budget variance | ✓ P (home) | todo |
| Project IRR / ROI calculator | – | todo |
| Land bank valuation tracker | – | todo |
| Board pack builder (pick period, sections) and PDF output | ✓ P (output) | todo |
| Report library: list, filters, run, export (PDF/Excel/CSV) | ✓ P (reports) | todo |

## 2. Land & title
| Screen | Design | Status |
|---|---|---|
| Parcels list and map view | ✓ P | todo |
| Parcel detail (overview, title, documents, encumbrances, surveys, valuations, activity) | ✓ P | todo |
| Add / edit parcel (incl. drawing the boundary on a map) | – | todo |
| Title stage update (status, dates, documents) | – | todo |
| Document vault: upload, versions, preview, download | ✓ P | todo |
| Add / clear encumbrance | – | todo |
| Assign survey / record survey result | – | todo |
| Record valuation | – | todo |

## 3. Projects & construction
| Screen | Design | Status |
|---|---|---|
| Projects list | ✓ P | todo |
| Project detail (overview, phases timeline, budget, BoQ, contractors, POs, site diary, units, permits, documents) | ✓ P | todo |
| Create / edit project (parcels, entity, type, dates) | – | todo |
| Phase and milestone edit, mark milestone complete (with evidence) | – | todo |
| BoQ editor (items, quantities, rates, import from Excel) | ✓ P (table) | todo |
| Material rates library (dated prices) | – | todo |
| Budget vs actual by phase | ✓ P | todo |
| Contractors list, contractor profile (registration, scorecard, contracts, payments) | – | todo |
| Material request → purchase order flow, PO detail, goods received | – | todo |
| Vendors list and scorecard | – | todo |
| Site diary feed (project) and entry detail | ✓ P | todo |
| Site diary quick entry (mobile, offline queue) | ✓ P | todo |
| Construction progress photo gallery (shared with buyer portal) | – | todo |

## 4. Sales & CRM
| Screen | Design | Status |
|---|---|---|
| Unit availability grid | ✓ P | todo |
| Interactive estate layout and layout setup | ✓ A | todo |
| Units list, unit detail (history, buyer, payments, documents) | – | todo |
| Add / bulk-create units, edit unit | – | todo |
| Price lists (by phase, effective dates) | – | todo |
| Leads pipeline board and leads list | ✓ P | todo |
| Lead detail and add lead (with duplicate warning) | – | todo |
| Contacts directory and contact profile (all roles, timeline) | – | todo |
| New subscription flow | ✓ P | todo |
| Subscription detail | ✓ P | todo |
| Payment plan templates (create/edit reusable plans) | – | todo |
| Reschedule / restructure a payment plan (with approval) | – | todo |
| Cancel / default a subscription and refund calculation (with approval) | – | todo |
| Transfer a unit to another buyer | – | todo |
| Delinquency list with ageing and bulk reminders | ✓ P (home) | todo |
| Allocation: issue allocation letter | ✓ P (action) | todo |
| Handover checklist and handover certificate | – | todo |
| Commissions list, commission detail, approve and pay | – | todo |
| Realtors list and realtor detail | – | todo |
| WhatsApp conversation on contact | ✓ A | todo |
| Buyer KYC and e-KYC verification | ✓ A | todo |

## 5. Finance
| Screen | Design | Status |
|---|---|---|
| Finance overview (per entity) | ✓ P | todo |
| Record receipt dialog | ✓ P | todo |
| Receipts list and receipt detail; reverse receipt (with approval) | – | todo |
| Bank statement import and matching (manual and AI) | ✓ A (AI) | todo |
| Unmatched receipts queue | – | todo |
| Chart of accounts | – | todo |
| Journal entries list, entry detail, manual journal (with approval) | ✓ P (list) | todo |
| Intercompany entries | ✓ P | todo |
| Bank accounts and balances | ✓ P | todo |
| FX rates (daily rates, sources) | – | todo |
| Construction facilities and drawdowns | ✓ P | todo |
| Vendor bills and payments (with WHT deduction) | – | todo |
| Revenue recognition run per project | ✓ P | todo |
| Tax summary (VAT, WHT, CIT, PAYE) and WHT credit notes | ✓ P (summary) | todo |
| Period close and lock | – | todo |
| Financial statements: trial balance, P&L, balance sheet, cash flow | – | todo |
| Entities list and entity detail (RC, TIN, VAT, bank accounts, UBO) | – | todo |

## 6. Facility & estate
| Screen | Design | Status |
|---|---|---|
| Estates list and estate detail | ✓ P | todo |
| Residents directory | – | todo |
| Service charge setup, billing run, invoices and arrears | ✓ P | todo |
| Utilities and diesel/running-cost log | ✓ P | todo |
| Maintenance board and request detail | ✓ P | todo |
| Preventive schedules and work orders | ✓ P | todo |
| Common-area asset register | ✓ P | todo |

## 7. HR & payroll
| Screen | Design | Status |
|---|---|---|
| Employees list, employee profile, add/edit employee | ✓ P (list) | todo |
| Site workers and daily attendance | ✓ P | todo |
| Pay components and payroll settings (rules with effective dates) | – | todo |
| Payroll run: draft → review → approve → paid | ✓ P | todo |
| Payslip (web and PDF) | ✓ P | todo |
| Statutory remittance schedules (PAYE, pension, NHF, NSITF, ITF) | – | todo |
| Leave requests, approvals, calendar | ✓ P (leave) | todo |
| Appraisals | – | todo |
| Professional memberships and renewals | ✓ P | todo |

## 8. Compliance
| Screen | Design | Status |
|---|---|---|
| Permit tracker and permit detail | ✓ P | todo |
| KYC status list | ✓ P | todo |
| AML review queue and case detail | ✓ P | todo |
| SCUML / NFIU filing records | – | todo |
| UBO register | ✓ P | todo |
| Statutory rules admin (rates, thresholds, effective dates, sources) | – | todo |

## 9. Documents & contracts
| Screen | Design | Status |
|---|---|---|
| Template library and template editor (merge fields, preview) | ✓ P (library) | todo |
| Contracts list and contract detail (approvals, e-signature) | ✓ P | todo |
| Generate document from a record | – | todo |
| Approval workflow settings | – | todo |
| Expiring contracts | ✓ P | todo |

## 10. Buyer portal
| Screen | Design | Status |
|---|---|---|
| Portal sign in / invite / reset | – | todo |
| My units and payment progress | ✓ P | todo |
| Pay now (Paystack) and payment result | ✓ P | todo |
| Statement of account and receipts | ✓ P | todo |
| Construction progress photos | ✓ P | todo |
| Documents: download, request a document | ✓ P | todo |
| Refer a friend | ✓ P | todo |
| My profile and KYC | – | todo |

## 11. Realtor portal
| Screen | Design | Status |
|---|---|---|
| Realtor sign up / sign in | – | todo |
| Register a lead | ✓ A | todo |
| My deals and commissions | ✓ A | todo |

## 12. Settings and admin
| Screen | Design | Status |
|---|---|---|
| Organization profile and branding (logo, colours on documents) | ✓ P (org) | todo |
| Team members, invites, roles and permissions, role templates | ✓ P (partial) | todo |
| Approval rules | – | todo |
| Fee and sales defaults, grace periods | ✓ P (fees) | todo |
| Numbering (receipts, invoices, documents) | ✓ P | todo |
| Message templates (WhatsApp, SMS, email) and reminder schedules | ✓ P | todo |
| Integrations (Paystack, WhatsApp provider, e-signature, e-KYC) | – | todo |
| Excel import wizard and import history | ✓ A | todo |
| Data export and NDPA requests (export / delete contact data) | – | todo |
| Audit log (organization-wide search) | ✓ A (timeline) | todo |
| Billing and plan, AI add-on, AI budget and usage | ✓ A (AI) | todo |

## 13. AI add-on
| Screen | Design | Status |
|---|---|---|
| Settings → AI, usage meter, budget states | ✓ A | todo |
| Document reading review | ✓ A | todo |
| AI payment matching | ✓ A | todo |
| Ask Vento answers | ✓ A | todo |
| Draft with AI | ✓ A | todo |
| Voice site diary | ✓ A | todo |
| Risk badges, cash-flow forecast, overrun warnings | ✓ A | todo |
| Anomaly review queue | ✓ A | todo |

## 14. Documents, PDFs and messages (non-screen outputs)
| Output | Design | Status |
|---|---|---|
| Receipt (PDF + WhatsApp image) | ✓ P | todo |
| Statement of account | ✓ P | todo |
| Letter of offer, contract of sale, allocation letter, deed of assignment | – | todo |
| Payslip PDF | ✓ P | todo |
| Board pack PDF | ✓ P | todo |
| Service charge invoice | – | todo |
| Purchase order PDF | – | todo |
| WHT credit note | – | todo |
| Emails: invite, verify, reset, receipt, reminder, digest, approval request | – | todo |
| WhatsApp/SMS templates: reminders, receipts, construction updates | ✓ A (partial) | todo |

## 15. Super-admin (Vento staff only)
| Screen | Design | Status |
|---|---|---|
| Organizations list and detail, plan and AI budget | – | todo |
| AI usage and cost by organization and feature | – | todo |
| Feature flags | – | todo |
| System health and failed jobs | – | todo |
