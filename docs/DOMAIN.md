# Domain guide

Shared vocabulary for the Nigerian real estate developer ERP. Code, UI copy, table names and tests use these terms exactly. Scope is in `docs/PRODUCT.md`. Update this file as decisions are made, and keep unresolved items under *Open questions*.

## Tenancy, entities and people
| Term | Meaning | Notes |
|---|---|---|
| **Organization** | The customer: a developer group using the product. | The data boundary. Every domain row has `organizationId`. Never call it "tenant" in code. Has name, head office state, financial year start, base currency NGN. |
| **Entity** | A legal company inside the organization: holding company or project **SPV**. | Type `holding` / `spv`. Has RC number, TIN, VAT registered (yes/no), base currency NGN. Status `active → archived`. Ledgers, bank accounts, payroll and contracts belong to an entity. |
| **Member** | A user in the organization, with a role. | One role each. Status `active → removed`; a removed member's history stays under their name, with who removed them. Permissions are module × action, optionally limited to entities or projects. A person can be a member of several organizations. Last active is updated at most hourly and shown, by day, to people who can view Team. |
| **Role** | A named set of permissions given to a member. | Built-in: `owner`, `admin`, `land_legal`, `project_manager`, `sales`, `finance`, `hr`, `facility`, `viewer`. An organization always has at least one owner. |
| **System role** | One of the nine built-in roles, created for every organization from the default table. | Can't be edited; owners copy one to make their own role (brick 3). Only owners can give, change or remove the `owner` role. |
| **Permission** | What a role may do in a module. | Actions `view`, `create`, `edit`, `delete`, `export`, `approve`. `approve` means the member may act as a checker; approval rules decide what needs one. Enforced on the server. |
| **Access limit** | The entities (later, projects) a member is limited to. | Empty means all. Records outside the limit behave as not found. |
| **Invitation** | An emailed offer to join an organization with a role and access limits. | Status `pending → accepted / declined / expired / withdrawn`. Resending replaces the link. Delivery is tracked separately from status: `queued`, `sent`, `failed`, `bounced` or `complained` (a send still queued after 10 minutes reads as failed). A bounced or failed invitation stays `pending` until withdrawn or expired. |
| **Two-step sign-in** | A 6-digit authenticator-app code (TOTP) asked after the password, with 10 single-use backup codes. | Required for some roles. Repeated wrong codes lock sign-in for a period. |
| **Sign-in lock** | A pause on signing in to one email address after repeated failures. | `locked → none` after 15 minutes. Caused by 10 wrong passwords within 15 minutes or 5 wrong two-step or backup codes in a row. Applies to unknown emails too, so a lock reveals nothing. |
| **Session** | One signed-in device or browser. | Listed for its owner, who can end one or all others. Ends on removal from the organization or a password reset. |
| **Active organization** | The organization a session is working in. | Belongs to the session, never to request input. A person in several organizations switches it from the shell; the last one used is the default at next sign-in. Each browser tab names the organization it is showing; the server refuses a request from a tab that's out of date. |
| **Current entity** | The entity (or "All entities") chosen in the entity switcher. | A view filter for pages that use it, held in the page address; never grants access. Only entities within the member's access limits are offered. Every page whose data belongs to a location follows it (Team shows the people who can work in the entity); only organization-wide pages (company profile, plan, roles) hide it. |
| **Role preview** | An owner or admin viewing the navigation and home of another role. | Changes what is shown only; every request still runs with the previewer's own access. Ends when stopped or the tab is closed. |
| **Security alert** | An email about a person's account security (lockout, password changed, two-step reset, backup code used), or to every owner when someone is made an owner (by a role change or by accepting an owner invitation). | Always sent; can't be muted. |
| **Setup checklist** | Steps that help owners and admins set up an organization, on Home. | Each step is done when the data says so (never ticked by hand). Items appear only when their feature is available and the viewer can act. Hidden per person (on every device) and brought back from ⌘K; once hidden it stays hidden when new steps arrive. When all are done it stays for the rest of that day (Lagos), then goes. |
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
| **Audit event** | Immutable record of who did what, when, with before/after values. | Append-only, organization-scoped, shown on every record's timeline. Events about a person's account (sign-ins, lockouts, password and two-step changes, sessions ended) are recorded once for each organization they belong to. Never holds passwords, codes, secrets or full IP addresses. |
| **Import job** | An Excel/CSV import: file, column mapping, validation results, rows created. | Status `uploaded → mapped → validated → imported → undone`. Undo removes exactly the rows it created if nothing depends on them yet. |
| **Site plan / layout** | The uploaded estate layout image or PDF with unit shapes placed on it. | Each unit has an optional polygon on the layout. |
| **Realtor** | External agent or broker contact with portal access. | Leads they register are checked for duplicates; a duplicate can still be submitted and a person at the developer decides ownership. |
| **Digest** | A scheduled summary message to a member. | Channel (WhatsApp, email), time, content by role. |
| **Feature** | A module or notable part of one that is released, and sold, as a unit (e.g. `sales`, `sales.commissions`, `ai.drafting`). | Keys live in one catalog in code. Security and compliance (two-step, passkeys, approvals, audit, KYC/AML, permits, UBO and SCUML records, data protection) are in every plan. Accounts, the shell, team and roles settings, approvals, audit and notifications have no flag at all. |
| **Available** | A feature an organization can use: **released** to it **and** it's **entitled** to it, with its prerequisites available. | Checked on the server before permissions. An unavailable feature appears nowhere and its procedures answer "not found". See `docs/specs/feature-flags.md`. |
| **Feature flag** | The release switch for one feature. | Has a **release stage**. Says whether a feature is ready, not whether it's paid for. |
| **Release stage** | How far a flag has been released: `off → internal → pilot → on`. | `off` is a kill switch for everyone; `internal` = Vento's own organizations; `pilot` = also pilot organizations; `on` = everyone. |
| **Release group** | An organization's place in releases: `standard`, `pilot` or `internal`. | New organizations are `standard` (and get the default plan, if one is set: Starter today). `internal` organizations (Vento's demo and test ones) are also entitled to everything with no limits. |
| **Release** | A recommended group of features (Release 1 is the MVP: sell, collect and build). | See `docs/release-plan.md`. A living recommendation, not a gate: the owner releases feature by feature with flags, and build order is separate from release order. |
| **Releasable** | A feature that is built, tested, reviewed, has its help article, and has had the owner's hands-on review. | Only a releasable feature may move beyond `internal`. |
| **Early access** | The tag on a feature an organization has before its stage is `on`. | Shown in navigation; disappears when released to everyone. |
| **Plan** | A priced tier an organization is on (e.g. Starter, Growth, Enterprise). | Data, versioned: lists included features and **limits**. Changing a plan publishes a new version; organizations keep theirs until moved. One plan per organization. |
| **Plan version** | An immutable snapshot of a plan's features and limits. | Organizations stay on theirs until Vento moves them; a change to a plan publishes the next version. |
| **Core feature** | A feature in every plan and never priced separately (security and compliance). | May still have a release flag while it's being built. |
| **Entitlement** | An organization's right to a feature or a limit value, from its plan, add-ons or an override. | A released feature without an entitlement is unavailable. |
| **Limit** | A plan's cap: `projects`, `entities`, `members` (including pending invitations), `ai_budget`. | Counts active records only. Exceeding it refuses new creates; nothing existing is archived or deleted. |
| **Add-on** | Something bought on top of a plan that includes more features or raises limits. | AI is an add-on (its features also need the owner to switch each one on in Settings → AI, and a budget). |
| **Override** | A per-organization exception set by Vento, with a reason and optional expiry. | **Release override:** a feature on or off before or despite its stage. **Entitlement override:** grant or remove a feature, or set a limit, regardless of plan (trials, negotiated deals). Never beats the `off` kill switch. Expired overrides stop applying; data stays. |
| **Trial** | Entitlement overrides that give an organization a higher plan's features and limits until a date. | Owner is told 7 days and 1 day before it ends. |
| **Platform audit event** | Vento's own append-only record of flag, plan and super-admin changes. | Who, operator, before → after, reason. Separate from organizations' audit trails, which get a plain-words entry (actor "Vento", no internal reason) for changes that affect them. |
| **Vento super-admin** | A Vento staff member who manages flags, plans, add-ons and overrides. | A platform role on the person's account, never an organization role. Two-step required. Every change is in the platform audit trail, and changes affecting one organization also in that organization's audit trail. |

## AI (optional add-on)
| Term | Meaning | Notes |
|---|---|---|
| **AI feature** | One AI capability: `document_extraction`, `payment_matching`, `ask`, `drafting`, `site_diary_voice`, `predictions`, `anomaly_detection`. | On/off per organization. Each has a manual fallback. |
| **AI suggestion** | A proposed value, match, draft or flag produced by AI. | Status `proposed → accepted / edited / rejected`. Never changes data until a person accepts it. |
| **AI usage record** | One AI request: organization, feature, model, input/output tokens, cost, user, timestamp. | Feeds the usage meter and billing. |
| **AI budget** | Monthly spend limit per organization. | Alerts at 50/80/100%; at the limit, AI features pause and manual paths remain. |

## Access rules (approved 25 Nov 2026)
- **Invitations** expire 7 days after they're sent. Resending replaces the link and gives a fresh 7 days. Up to 20 people per batch.
- **Sessions** end after 30 minutes without activity or 12 hours after sign-in, whichever comes first. With "Keep me signed in", a session lasts 30 days from sign-in (not extended by use). Every new sign-in asks for two-step when it's on. A password reset or removal from the organization ends sessions at once.
- **Lockouts:** 10 wrong passwords within 15 minutes, or 5 wrong two-step or backup codes in a row, lock sign-in for that email for 15 minutes. A correct password and code are refused until the lock ends; a security alert is emailed. A successful sign-in resets the count.
- **Two-step is required** for owner, admin, finance and HR (a property of the role). Members with those roles can't turn it off. Owners (for anyone) and admins (for non-owners) can reset someone's two-step; nobody can reset their own. A reset by someone else ends all the person's sessions and requires a new password (from an emailed link) before their next sign-in.
- **Access can't be raised by the granter:** a member limited to some entities can only grant access to those entities, and can change, reset, remove, resend or withdraw only members and invitations whose access lies within their own. They see only the entity names within their own access. Archived entities can't be granted.
- **Resending an invitation** is allowed once a minute per invitation. Resending an owner invitation is for owners only. An expired invitation can be resent (it takes a place on the plan again) or withdrawn.
- **Removed people** are listed on Team until they rejoin; a removed person who rejoins leaves the *Removed* list.
- **Verification emails:** the link and code last 30 minutes; resending is allowed once a minute, 5 times an hour. Reset links last 30 minutes and work once; a new password can't be one of the last 5.
- **Passwords** need at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character (anything that isn't a letter, number or space).

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
