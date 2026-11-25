---
name: nigeria-compliance
description: How Nigerian statutory and regulatory rules are modelled — tax (VAT, WHT, CIT, PAYE, stamp duty), payroll deductions (pension, NHF, NSITF, ITF), IFRS 15 for off-plan sales, AML/KYC for real estate (SCUML, NFIU, UBO), permits, and NDPA data protection. Use when building finance, payroll, compliance or buyer KYC features.
---

# Nigerian compliance

**Rule zero: never hard-code a rate, threshold or deadline.** Statutory values live in a `statutory_rules` configuration table with `code`, `value`, `effectiveFrom`, `effectiveTo`, `source` (act/circular and section) and `verifiedAt`. Calculations look up the rule effective on the transaction date. Seed values are starting points that a human must confirm against current law.

Nigeria's tax system was reformed by the 2025 tax acts (Nigeria Tax Act, Nigeria Tax Administration Act, Nigeria Revenue Service (Establishment) Act, Joint Revenue Board Act), effective from 2026: FIRS became the **Nigeria Revenue Service (NRS)**, and PAYE bands, company tax thresholds and levies changed. Always check the current official text (NRS, state IRS, PenCom, NHF/FMBN, NSITF, ITF, SCUML) before seeding or changing a rule, and record the source.

## Tax
| Tax | Model it as | Notes |
|---|---|---|
| **VAT** | Rate rule + per-entity VAT registration + per-item VAT treatment | Sale of land and some residential property may be exempt — treatment is per item, set by finance, not assumed. |
| **WHT** | Rate rules per payment category (contracts, professional fees, rent, etc.) and payee type (company/individual) | Deducted on payments to contractors and vendors; generate WHT credit notes; track remittance to the right authority (NRS or state). |
| **CIT and levies** | Computed in reporting from the ledger with rules by company size | Don't build a tax filing engine. Produce the schedules accountants need. |
| **PAYE** | Bands and reliefs as versioned rules, by state of residence | Remitted to the employee's state IRS (e.g. LIRS for Lagos). |
| **Stamp duty** | Rule per instrument (deed of assignment, contracts) | Track as a cost/document requirement. |

## Payroll deductions
Model each as a pay rule with base (basic, basic+housing+transport, gross), employee %, employer %, and caps:
- **Pension (PenCom, Contributory Pension Scheme):** employee and employer contributions on the pensionable base; remitted to each employee's PFA.
- **NHF:** employee contribution on basic salary.
- **NSITF:** employer contribution on payroll.
- **ITF:** employer contribution on payroll for qualifying employers.
Payroll runs are draft → reviewed → approved → paid, and approved runs are locked; corrections go to the next run.

## IFRS 15 — off-plan revenue
- Policy per project: **over time** (when the contract gives an enforceable right to payment for work done and the asset has no alternative use) or **at a point in time** (handover).
- Over time: measure progress (input method: cost incurred ÷ total budgeted cost, or output method: milestones certified). Recognise revenue = contract price × % complete − revenue already recognised.
- Cash received ahead of recognition is a **contract liability**; revenue recognised ahead of billing is a **contract asset**.
- Recognition runs monthly per project as journal entries, with the calculation stored for audit.

## AML / KYC for real estate
Real estate developers are designated non-financial businesses and professions (DNFBPs) under the Money Laundering (Prevention and Prohibition) Act 2022, supervised by **SCUML**, with suspicious transaction and currency transaction reporting to the **NFIU**.
- **KYC on every buyer** before a subscription becomes active: ID (NIN or passport, encrypted at rest, masked in UI), address, occupation; source of funds above a configurable threshold; PEP screening flag.
- **Flags** (thresholds are rules): cash above a limit, many smaller payments that add up (structuring), payment from a third party, payer in a high-risk country, sudden cancellation with refund to a different account.
- A flagged item goes to a review queue (reviewer, decision, notes). The app records what was reported and when; filing happens on the official portal.
- **UBO register** per entity with ownership %, kept current.
- Keep KYC and transaction records for the legally required period, even after a contact is archived.

## Permits and certificates
Per project: planning permit, building permit, EIA, DPC, CCCN, fire certificate and others, each with issuing authority (e.g. LASPPPA, LASBCA in Lagos), number, dates and documents. Alerts at configurable intervals before expiry. Names and requirements vary by state, so the permit type list is configurable per state.

## Data protection (NDPA 2023)
- Collect only what each feature needs. Never store BVN.
- Consent for marketing messages, separate from transactional reminders.
- Export a contact's data on request; delete or anonymise when there's no legal reason to keep it (AML and tax records have retention duties).
- Personal data never appears in logs, analytics or error reports.

## When unsure
Model the rule as configuration, leave the value for finance or legal to confirm, and list it in the feature's open questions. Never guess a statutory number.
