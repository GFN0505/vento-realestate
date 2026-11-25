# Domain guide

Shared vocabulary for the Nigerian real estate developer ERP. Code, UI copy, table names and tests use these terms exactly. Scope is in `docs/PRODUCT.md`. Update this file as decisions are made, and keep unresolved items under *Open questions*.

## Tenancy, entities and people
| Term | Meaning | Notes |
|---|---|---|
| **Organization** | The customer: a developer group using the product. | The data boundary. Every domain row has `organizationId`. Never call it "tenant" in code. Has name, head office state, financial year start, base currency NGN. |
| **Entity** | A legal company inside the organization: holding company or project **SPV**. | Type `holding` / `spv`. Has RC number, TIN, VAT registered (yes/no), base currency NGN. Status `active → archived`. Ledgers, bank accounts, payroll and contracts belong to an entity. |
| **Member** | A user in the organization, with a role. | One role each. Status `active → removed`; a removed member's history stays under their name. Permissions are module × action, optionally limited to entities or projects. A person can be a member of several organizations. |
| **Role** | A named set of permissions given to a member. | Built-in: `owner`, `admin`, `land_legal`, `project_manager`, `sales`, `finance`, `hr`, `facility`, `viewer`. An organization always has at least one owner. |
| **Permission** | What a role may do in a module. | Actions `view`, `create`, `edit`, `delete`, `export`, `approve`. `approve` means the member may act as a checker; approval rules decide what needs one. Enforced on the server. |
| **Access limit** | The entities (later, projects) a member is limited to. | Empty means all. Records outside the limit behave as not found. |
| **Invitation** | An emailed offer to join an organization with a role and access limits. | Status `pending → accepted / declined / expired / withdrawn`. Resending replaces the link. |
| **Two-step sign-in** | A 6-digit authenticator-app code (TOTP) asked after the password, with 10 single-use backup codes. | Required for some roles. Repeated wrong codes lock sign-in for a period. |
| **Session** | One signed-in device or browser. | Listed for its owner, who can end one or all others. Ends on removal from the organization or a password reset. |
| **Security alert** | An email about a person's account security (lockout, password changed, two-step reset, backup code used). | Always sent; can't be muted. |
| **Contact** | Any external person or company: buyer, lead, contractor, vendor, surveyor, valuer, JV partner, agent/broker, resident. | One `contacts` table with a roles array. Individuals and companies. |
| **Buyer (subscriber)** | Contact who has subscribed to one or more units. | Can sign in to the Buyer Portal. May be diaspora (country of residence recorded). |
| **Agent / broker** | Internal staff or external realtor who brings a sale. | Earns commission. |
| **Employee / site worker** | Staff on payroll, or casual worker on a daily rate. | Belong to an entity. |

## Land & title
| Term | Meaning | Notes |
|---|---|---|
| **Land parcel** | A piece of land owned, being acquired, or under JV. | Location (state, LGA, area), size (hectares/plots/m²), coordinates/polygon, acquisition cost, status `prospect → under_acquisition → acquired → titled → in_development → sold_out`. |
| **Title document** | Evidence of title: `c_of_o`, `r_of_o`, `governors_consent`, `deed_of_assignment`, `excision_gazette`, `survey_plan`, `family_receipt`, `land_purchase_agreement`. | Versioned files with number, issue date, issuing authority. |
| **Title stage** | Progress of title perfection for a parcel. | Each stage has status `not_started → in_progress → submitted → granted / rejected`, dates and documents. |
| **Encumbrance** | A claim on the land: `mortgage`, `caveat`, `court_order`, `lien`, `family_dispute`. | Active/cleared, with alerts. A parcel with an active encumbrance is flagged everywhere it's used and its units are `blocked` for sale. Clearing needs evidence and two approvals. |
| **Survey** | Survey job by a SURCON-registered surveyor. | Surveyor contact, plan number, date, documents. |
| **Valuation** | Value of a parcel at a date by a registered valuer (ESVARBON/NIESV). | History kept; feeds the land bank tracker. |

## Projects & construction
| Term | Meaning | Notes |
|---|---|---|
| **Project** | A development on one or more parcels, owned by an entity (usually an SPV). | Type (residential estate, apartments, mixed use, commercial), status `planning → approved → in_construction → completed → handed_over`. |
| **Phase** | Construction stage: `site_prep`, `substructure`, `superstructure`, `roofing`, `mep`, `finishing`, `external_works`, `handover`. | Has budget, planned/actual dates, % complete. |
| **Milestone** | A dated checkpoint within a phase. | Drives % complete and can trigger buyer instalments (construction-linked plans). |
| **BoQ (bill of quantities)** | Itemised quantities and rates per phase. | Items reference **material rates** (cement, iron rods, blocks, sand…) with dated prices. Total = budget. |
| **Contractor** | Company doing work under a contract. | Registration (COREN/CORBON number, expiry), scorecard. |
| **Material request / purchase order** | Request for materials, then an order to a vendor. | PO status `draft → approved → ordered → partially_received → received → closed`. Receipts update actual cost. |
| **Vendor scorecard** | Rating on price, quality, timeliness. | Computed from POs and receipts plus manual ratings. |
| **Site diary entry** | Daily log: work done, workers on site, issues, delays (with reason), photos. | Photos carry GPS and timestamp. |

## Sales & CRM
| Term | Meaning | Notes |
|---|---|---|
| **Unit** | A sellable item in a project: plot, house, flat, shop. | Type, size, bedrooms, price, status `available → reserved → subscribed → allocated → handed_over` (or `blocked`). |
| **Price list** | Unit prices per project, with effective dates. | Off-plan prices usually rise by phase. |
| **Lead** | Prospective buyer. | Source, segment (`local`, `diaspora_uk`, `diaspora_us`, `diaspora_ca`, `diaspora_uae`, `other`), pipeline `new → contacted → site_inspection → negotiation → won / lost`. |
| **Subscription (sale)** | A buyer's commitment to buy a unit. | Price, currency, payment plan, status `pending_kyc → active → completed → cancelled / defaulted`. |
| **Payment plan** | Schedule of instalments: outright, fixed instalments (e.g. 6/12/24 months), or construction-linked. | Generates **instalments** with due dates and amounts. Initial deposit is common. |
| **Instalment** | One scheduled amount due. | Status derived from receipts: `upcoming`, `due`, `partially_paid`, `paid`, `overdue`. |
| **Delinquency** | A subscription with overdue instalments past the grace period. | Ageing buckets 1–30, 31–60, 61–90, 90+ days. Can lead to default and cancellation per contract terms (refund less deductions). |
| **Sales documents** | `letter_of_offer` → `contract_of_sale` → `allocation_letter` → `deed_of_assignment`. | Generated from templates when their trigger is met (e.g. allocation after a % paid). |
| **Commission** | Fee to an agent/broker on a subscription. | % or fixed, earned on payment milestones, paid through finance. |

## Finance
| Term | Meaning | Notes |
|---|---|---|
| **Ledger / journal entry** | Double-entry record per entity. | Append-only. Corrections are reversing entries. Balanced debits = credits. |
| **Chart of accounts** | Accounts per entity (assets, liabilities, equity, income, expenses). | Starts from a Nigerian real estate developer template. |
| **Currency & FX rate** | Transaction currency and the rate used to convert to NGN. | Store amount, currency, rate, rate source (`cbn_official`, `bank`, `manual`) and date. Flag when the rate differs from the CBN official rate. |
| **Receipt** | Money received (instalment, service charge…). | Method `bank_transfer`, `card`, `cash`, `pos`, `cheque`, `foreign_transfer`. Allocated to instalments or invoices. |
| **Intercompany entry** | Transaction between two entities in the organization. | Creates mirrored entries in both ledgers. |
| **Facility / drawdown** | Construction finance from a bank and each disbursement against it. | Limit, rate, tenor, drawdowns, repayments, interest. |
| **Revenue recognition** | IFRS 15 treatment of off-plan sales. | Over time (input/output method tied to % completion) when criteria are met, else at handover. Policy per project. |
| **Tax** | VAT, WHT, CIT, PAYE, stamp duty. | Rates and rules are configuration with effective dates. |

## Facility & estate
| Term | Meaning | Notes |
|---|---|---|
| **Estate** | A handed-over project under management. | Residents are the buyers/occupants of its units. |
| **Service charge** | Recurring estate charge per unit. | Billed periodically, with arrears and reminders. |
| **Utility** | Borehole, generator, solar, water treatment, etc. | Running costs, fuel/diesel logs, recovery through service charge. |
| **Maintenance request** | Issue reported by a resident or staff. | Priority, status `open → assigned → in_progress → resolved → closed`, cost. |
| **Preventive schedule** | Recurring planned maintenance on an asset. | Generates work orders. |
| **Common-area asset** | Equipment or facility owned by the estate. | Asset register with condition and service history. |

## HR & payroll
| Term | Meaning | Notes |
|---|---|---|
| **Payroll run** | Monthly pay calculation for an entity. | Gross → statutory deductions (PAYE, pension 8% employee / 10% employer by default, NHF, NSITF, ITF) → net. All rates configurable with effective dates. |
| **Pay component** | Basic, housing, transport, allowances, deductions. | Taxable flag, pensionable flag. |
| **Site worker** | Casual or daily-rate worker. | Attendance from the site diary, paid weekly or per job. |
| **Professional membership** | Staff membership of a professional body. | Body, number, expiry, renewal alerts. |

## Regulatory & compliance
| Term | Meaning | Notes |
|---|---|---|
| **Permit** | `planning_permit`, `building_permit`, `eia`, `dpc`, `cccn`, `fire_certificate`, other. | Per project, issue/expiry dates, documents, alerts before expiry. |
| **KYC / CDD** | Customer due diligence on buyers. | ID type and number, address, source of funds for large purchases. Status `pending → verified → flagged`. |
| **AML flag** | A transaction needing review: large cash, structured payments, third-party payer, high-risk country. | Review queue with decision and notes. Thresholds are configuration. |
| **SCUML / NFIU records** | Registration and reports filed under Nigeria's AML regime for real estate (DNFBPs). | Record what was filed and when. Filing itself happens outside the app. |
| **UBO** | Ultimate beneficial owner of an entity. | Register per entity with ownership %. |

## Documents & contracts
| Term | Meaning | Notes |
|---|---|---|
| **Template** | Reusable contract or letter with merge fields. | Versioned. |
| **Contract** | A generated or uploaded agreement with a counterparty. | Type (`sales`, `contractor`, `vendor`, `jv`, `nda`, `employment`), status `draft → in_review → approved → sent → signed → active → expired / terminated`. |
| **Approval** | A required sign-off step. | Approver, decision, timestamp, comment. |
| **E-signature** | Signature captured through a provider. | Store provider envelope id and the signed PDF. |

## Platform
| Term | Meaning | Notes |
|---|---|---|
| **Approval rule** | Which actions need a second approver, by role and amount threshold. | Per organization. Default rules ship for receipts reversal, refunds, payroll, price lists, POs, manual journals. |
| **Approval request** | A pending sensitive action waiting for a checker. | Status `pending → approved / rejected / expired`. The maker can't approve their own request. The action runs only on approval. |
| **Audit event** | Immutable record of who did what, when, with before/after values. | Append-only, organization-scoped, shown on every record's timeline. |
| **Import job** | An Excel/CSV import: file, column mapping, validation results, rows created. | Status `uploaded → mapped → validated → imported → undone`. Undo removes exactly the rows it created if nothing depends on them yet. |
| **Site plan / layout** | The uploaded estate layout image or PDF with unit shapes placed on it. | Each unit has an optional polygon on the layout. |
| **Realtor** | External agent or broker contact with portal access. | Leads they register are checked for duplicates; a duplicate can still be submitted and a person at the developer decides ownership. |
| **Digest** | A scheduled summary message to a member. | Channel (WhatsApp, email), time, content by role. |
| **Feature flag / add-on** | Whether a capability is on for an organization. | AI features are add-ons, off by default. |

## AI (optional add-on)
| Term | Meaning | Notes |
|---|---|---|
| **AI feature** | One AI capability: `document_extraction`, `payment_matching`, `ask`, `drafting`, `site_diary_voice`, `predictions`, `anomaly_detection`. | On/off per organization. Each has a manual fallback. |
| **AI suggestion** | A proposed value, match, draft or flag produced by AI. | Status `proposed → accepted / edited / rejected`. Never changes data until a person accepts it. |
| **AI usage record** | One AI request: organization, feature, model, input/output tokens, cost, user, timestamp. | Feeds the usage meter and billing. |
| **AI budget** | Monthly spend limit per organization. | Alerts at 50/80/100%; at the limit, AI features pause and manual paths remain. |

## Locale defaults
- Base currency `NGN` (₦). Foreign currency stored with its FX rate and source.
- Addresses: line 1, area, LGA, state, country. Nigerian states and LGAs from a fixed list.
- Phone numbers in E.164 (`+234…`, and foreign numbers for diaspora).
- Dates shown as `25 Nov 2026`. Money as `₦1,250,000.00` and `$12,500.00`.
- Personal data under the **NDPA 2023**: collect only what's needed, never store BVN, consent for marketing, export and deletion on request. ID numbers (NIN, passport) are encrypted at rest and masked in the UI.

## Open questions
- Payments: Paystack for NGN cards and virtual accounts. Which provider for foreign-currency diaspora payments (bank domiciliary accounts, Paystack international, other)?
- Accounting depth: will developers run their statutory books here, or also export to an external accountant's system?
- E-signature provider (DocuSign, Dropbox Sign, local alternative)?
- WhatsApp Business API provider (e.g. Termii, Twilio) and template approval.
- Default grace period and default/cancellation terms for delinquent subscriptions.
