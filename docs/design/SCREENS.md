# Screen inventory

The single list of every screen, sheet, dialog, document and message the product needs, derived from `docs/PRODUCT.md`, `docs/DOMAIN.md` and `docs/journeys/`, not from the design. Keep it current: when a feature adds, changes or removes a screen, update this file in the same change.

**Design** — links to the approved board(s) in [`claude-design/`](claude-design/README.md) (desktop file shown; mobile and dark variants sit beside it, see the index). A note in brackets means the board covers only part of the row. `–` means no design: build it from the design-system archetypes.
**Status** — `todo` · `pattern` (built from design-system patterns, no bespoke design) · `built` (matches its board) · `needs-design` (flagged for the next design pass)

Every list screen implies its empty, filtered-empty, loading and error states (designed once on [States](claude-design/States.dc.html)); every form implies validation, saving and error states. Those aren't listed separately. Product rules the designs set are in [DESIGN-NOTES.md](DESIGN-NOTES.md).
**Coverage:** 185 rows · 138 designed (22 of them partly) · 47 without a design.



## 0. Foundation and account
| Screen | Design | Status |
|---|---|---|
| Sign in, two-factor challenge (brick 3d: **Sign in with a passkey**, passkeys offered in the email field's suggestions, passkey errors, new lost-phone line) | [SignIn](claude-design/SignIn.dc.html), [SignIn2FA](claude-design/SignIn2FA.dc.html) | built (passkey sign-in todo, brick 3d) |
| Sign up, verify email | [SignUp](claude-design/SignUp.dc.html), [VerifyEmail](claude-design/VerifyEmail.dc.html) | built |
| Forgot / reset password | [ForgotPassword](claude-design/ForgotPassword.dc.html), [ResetPassword](claude-design/ResetPassword.dc.html) | built |
| Accept invitation | [AcceptInvite](claude-design/AcceptInvite.dc.html) | built |
| Set up two-step (forced at sign-in, after accepting an invitation, or when the organization requires it for everyone; brick 3d: also opened as a sheet from My security) and backup codes | [SecuritySettings](claude-design/SecuritySettings.dc.html) (two-factor panel only) | pattern |
| Onboarding: organization → first entity → first project and units (steps 1–2 in brick 2a) | [Onboarding](claude-design/Onboarding.dc.html) | built (steps 1–2) |
| Setup checklist on Home (brick 3b: owners and admins; items derived from data and shown only for available features; hide per person, back from ⌘K; brick 3c: "Add your first company" and "Add your other companies (SPVs)" with "We only have one company") | [Onboarding](claude-design/Onboarding.dc.html) (checklist), [DSAdditions](claude-design/DSAdditions.dc.html) (ChecklistRow) | built |
| App shell: sidebar by role, top bar, entity switcher, organization switcher, user menu (theme, preview as role; brick 3d: **My security** for everyone, also in More and ⌘K), mobile bottom tabs and More sheet (brick 3a; project switcher with Projects; feature-flags spec: only available features, "Early access" tag, owner-only "Available on …" rows in ⌘K; brick 3c: switcher labelled "Company", "+ Add company" for owners and admins, "No company" state) | [ExecutiveHome](claude-design/ExecutiveHome.dc.html), [ExecutiveHomeMobile](claude-design/ExecutiveHomeMobile.dc.html), role homes (sidebars and tabs), [Main](claude-design/Main.dc.html) (bottom nav) | built |
| ⌘K command palette (brick 3a: pages and actions; record search added per module) | [ExecutiveHome](claude-design/ExecutiveHome.dc.html) (palette), [Main](claude-design/Main.dc.html) (component), [AskVento](claude-design/AskVento.dc.html) | built (pages and actions) |
| Module placeholder ("Coming soon", until each module ships; only in Vento's internal organizations once feature flags ship) | – | pattern |
| Plan limit message (inline where a create is refused; owner version with **Talk to Vento**, member version naming whom to ask) (feature flags) | – | pattern (component built; first used in 3b) |
| Trial ending: line on Home and email to owners (feature flags) | – | pattern |
| Notifications panel and notification preferences | [Notifications](claude-design/Notifications.dc.html), [NotificationPrefs](claude-design/NotificationPrefs.dc.html) | todo |
| Approvals inbox | [Approvals](claude-design/Approvals.dc.html) | todo |
| Global search results page | – | todo |
| Keyboard shortcuts help (`?`) (brick 3a) | – | pattern |
| My security, every member, `/settings/security` (brick 3d): name edited in place; *Sign-in* card (password, two-step on/off and what requires it, backup codes left); *Passkeys* card (add, rename, remove, last used); *Where you're signed in* (device and browser, approximate place, masked IP, last active, This device, sign out one or all others). Phone, photo and email change out of scope | [SecuritySettings](claude-design/SecuritySettings.dc.html), [SecurityMobile](claude-design/SecurityMobile.dc.html) (two-step and sessions only; one page instead of tabs; passkeys, name and password not designed) | built |
| My security dialogs (brick 3d): Confirm it's you (password), Change password, Turn off two-step (password and code), New backup codes, Remove passkey, Sign out other devices | – | pattern |
| Passkey offer after a password sign-in, once per device (brick 3d) | – | pattern |
| Two-step required banner: "{Organization} now requires two-step sign-in" with **Set up two-step** (brick 3d; members without two-step when the organization requires it for everyone) | – | pattern |
| 403 no access, 404 not found, 500 error, offline banner and page (brick 3a; Request access in brick 4) | [Error403](claude-design/Error403.dc.html), [Error404](claude-design/Error404.dc.html), [Error500](claude-design/Error500.dc.html), [OfflineBanner](claude-design/OfflineBanner.dc.html), [OfflinePage](claude-design/OfflinePage.dc.html) | built (Request access in brick 4) |
| Maintenance page | – | todo |
| Session expired / signed out elsewhere (brick 3d: **Sign in with a passkey**) | [SessionExpired](claude-design/SessionExpired.dc.html) | built (passkey built, brick 3d) |
| Design system, screen states, new components | [Main](claude-design/Main.dc.html), [States](claude-design/States.dc.html), [DSExtensions](claude-design/DSExtensions.dc.html), [DSAdditions](claude-design/DSAdditions.dc.html) | built (tokens, fonts, form components) |

## 1. Home and analytics
| Screen | Design | Status |
|---|---|---|
| Executive home | [ExecutiveHome](claude-design/ExecutiveHome.dc.html) | built (shell Home: hero, KPI placeholders, workspace; data arrives per module) |
| Role homes: Land & legal, Project manager, Sales, Finance, HR, Facility | [HomeLand](claude-design/HomeLand.dc.html), [HomePM](claude-design/HomePM.dc.html), [HomeSales](claude-design/HomeSales.dc.html), [HomeFinance](claude-design/HomeFinance.dc.html), [HomeHR](claude-design/HomeHR.dc.html), [HomeFM](claude-design/HomeFM.dc.html) | built (role KPI sets; queues arrive per module) |
| Daily digest (WhatsApp and email) | [MorningDigest](claude-design/MorningDigest.dc.html), [EmailDigest](claude-design/EmailDigest.dc.html) | todo |
| Dashboards: collections, delinquency, project progress, cash by entity, budget variance | [ExecutiveHome](claude-design/ExecutiveHome.dc.html) (as home cards) | todo |
| Project IRR / ROI calculator | – | todo |
| Land bank valuation tracker | – | todo |
| Board pack builder (pick period, sections) | – | todo |
| Board pack PDF output | [BoardPack](claude-design/BoardPack.dc.html), [BoardPack2](claude-design/BoardPack2.dc.html), [BoardPack3](claude-design/BoardPack3.dc.html), [BoardPack4](claude-design/BoardPack4.dc.html), [BoardPack5](claude-design/BoardPack5.dc.html), [BoardPack6](claude-design/BoardPack6.dc.html) | todo |
| Report library: list, filters, run, export (PDF/Excel/CSV) | – | todo |

## 2. Land & title
| Screen | Design | Status |
|---|---|---|
| Parcels list and map view | [LandTitle](claude-design/LandTitle.dc.html) | todo |
| Parcel detail (overview, title, documents, encumbrances, surveys, valuations, activity) | [ParcelDetail](claude-design/ParcelDetail.dc.html) | todo |
| Add / edit parcel (incl. drawing the boundary on a map) | [ParcelEditor](claude-design/ParcelEditor.dc.html) | todo |
| Title stage update (status, dates, documents) | [TitleStageUpdate](claude-design/TitleStageUpdate.dc.html) | todo |
| Document vault: upload, versions, preview, download | [ParcelDetail](claude-design/ParcelDetail.dc.html) (documents tab) | todo |
| Add / clear encumbrance | [EncumbranceAdd](claude-design/EncumbranceAdd.dc.html), [EncumbranceClear](claude-design/EncumbranceClear.dc.html) | todo |
| Assign survey / record survey result | – | todo |
| Record valuation | – | todo |

## 3. Projects & construction
| Screen | Design | Status |
|---|---|---|
| Projects list | [Projects](claude-design/Projects.dc.html) | todo |
| Project detail (overview, phases timeline, budget, BoQ, contractors, POs, site diary, units, permits, documents) | [ProjectDetail](claude-design/ProjectDetail.dc.html) | todo |
| Create / edit project (parcels, entity, type, dates) | – | todo |
| Phase and milestone edit, mark milestone complete (with evidence) | – | todo |
| BoQ editor (items, quantities, rates, import from Excel) | [ProjectDetail](claude-design/ProjectDetail.dc.html) (BoQ table only) | todo |
| Material rates library (dated prices) | [MaterialRates](claude-design/MaterialRates.dc.html) | todo |
| Budget vs actual by phase | [ProjectDetail](claude-design/ProjectDetail.dc.html) | todo |
| Contractors list, contractor profile (registration, scorecard, contracts, payments) | [Contractors](claude-design/Contractors.dc.html), [ContractorProfile](claude-design/ContractorProfile.dc.html) | todo |
| Material request → purchase order → goods received, PO detail | [MaterialRequest](claude-design/MaterialRequest.dc.html), [POCreate](claude-design/POCreate.dc.html), [GoodsReceived](claude-design/GoodsReceived.dc.html), [PODetail](claude-design/PODetail.dc.html) | todo |
| Vendors list and scorecard | – | todo |
| Site diary feed (project) and entry detail | [ProjectDetail](claude-design/ProjectDetail.dc.html) (feed only) | todo |
| Site diary quick entry (mobile, offline queue) | [SiteDiaryMobile](claude-design/SiteDiaryMobile.dc.html) | todo |
| Construction progress photo gallery (shared with buyer portal) | [BuyerPortalMobile](claude-design/BuyerPortalMobile.dc.html) (buyer side only) | todo |

## 4. Sales & CRM
| Screen | Design | Status |
|---|---|---|
| Unit availability grid | [Sales](claude-design/Sales.dc.html) | todo |
| Interactive estate layout and layout setup | [SitePlan](claude-design/SitePlan.dc.html), [SitePlanSetup](claude-design/SitePlanSetup.dc.html), [SitePlanTablet](claude-design/SitePlanTablet.dc.html) | todo |
| Units list, unit detail (history, buyer, payments, documents) | [Units](claude-design/Units.dc.html), [UnitDetail](claude-design/UnitDetail.dc.html) | todo |
| Add / bulk-create units, edit unit | [BulkCreateUnits](claude-design/BulkCreateUnits.dc.html), [Main](claude-design/Main.dc.html) (edit unit side sheet) | todo |
| Price lists (by phase, effective dates) | [PriceList](claude-design/PriceList.dc.html) | todo |
| Leads pipeline board and leads list | [Sales](claude-design/Sales.dc.html) | todo |
| Lead detail and add lead (with duplicate warning) | [LeadDetail](claude-design/LeadDetail.dc.html), [AddLead](claude-design/AddLead.dc.html) | todo |
| Contacts directory and contact profile (all roles, timeline) | [ContactProfile](claude-design/ContactProfile.dc.html) (profile only; directory not designed) | todo |
| New subscription flow | [NewSubscription](claude-design/NewSubscription.dc.html) | todo |
| Subscription detail | [SubscriptionDetail](claude-design/SubscriptionDetail.dc.html) | todo |
| Payment plan templates and builder | [PlanTemplates](claude-design/PlanTemplates.dc.html), [PlanBuilder](claude-design/PlanBuilder.dc.html) | todo |
| Reschedule / restructure a payment plan (with approval) | [ReschedulePlan](claude-design/ReschedulePlan.dc.html) | todo |
| Cancel / default a subscription and refund calculation (with approval) | [CancelSubscription](claude-design/CancelSubscription.dc.html) | todo |
| Transfer a unit to another buyer | [TransferUnit](claude-design/TransferUnit.dc.html) | todo |
| Delinquency list with ageing and bulk reminders | [HomeSales](claude-design/HomeSales.dc.html) (queue only) | todo |
| Allocation: issue allocation letter | [DocAllocation](claude-design/DocAllocation.dc.html) | todo |
| Handover checklist and handover certificate | [Handover](claude-design/Handover.dc.html), [HandoverCert](claude-design/HandoverCert.dc.html) | todo |
| Commissions list, commission detail, approve and pay | [Commissions](claude-design/Commissions.dc.html), [CommissionDetail](claude-design/CommissionDetail.dc.html) | todo |
| Realtors list and realtor detail | – | todo |
| WhatsApp conversation on contact | [BuyerProfile](claude-design/BuyerProfile.dc.html) | todo |
| Buyer KYC and e-KYC verification | [BuyerProfile](claude-design/BuyerProfile.dc.html) | todo |

## 5. Finance
| Screen | Design | Status |
|---|---|---|
| Finance overview (per entity) | [Finance](claude-design/Finance.dc.html) | todo |
| Record receipt dialog | [RecordReceipt](claude-design/RecordReceipt.dc.html) | todo |
| Receipts list and receipt detail; reverse receipt (with approval) | [Receipts](claude-design/Receipts.dc.html), [ReceiptDetail](claude-design/ReceiptDetail.dc.html), [ReceiptReverse](claude-design/ReceiptReverse.dc.html) | todo |
| Bank statement import and matching (manual and AI) | [PaymentMatching](claude-design/PaymentMatching.dc.html) | todo |
| Unmatched receipts queue | [UnmatchedReceipts](claude-design/UnmatchedReceipts.dc.html) | todo |
| Chart of accounts | – | todo |
| Journal entries list, entry detail, manual journal (with approval) | [Finance](claude-design/Finance.dc.html) (list only) | todo |
| Intercompany entries | [Finance](claude-design/Finance.dc.html) (summary only) | todo |
| Bank accounts and balances | [Finance](claude-design/Finance.dc.html), [FinanceMobile](claude-design/FinanceMobile.dc.html) | todo |
| FX rates (daily rates, sources) | [FXRates](claude-design/FXRates.dc.html) | todo |
| Construction facilities and drawdowns | [Finance](claude-design/Finance.dc.html) (summary only) | todo |
| Vendor bills and payments (with WHT deduction) | [VendorBill](claude-design/VendorBill.dc.html) | todo |
| Revenue recognition run per project | [Finance](claude-design/Finance.dc.html) (summary only) | todo |
| Tax summary (VAT, WHT, CIT, PAYE) and WHT credit notes | [Finance](claude-design/Finance.dc.html), [WHTCreditNote](claude-design/WHTCreditNote.dc.html) | todo |
| Period close and lock | [PeriodClose](claude-design/PeriodClose.dc.html) | todo |
| Financial statements: trial balance, P&L, balance sheet, cash flow | [Statements](claude-design/Statements.dc.html) | todo |
| Entities list and entity detail (RC, TIN, VAT, bank accounts, UBO) | [EntityDetail](claude-design/EntityDetail.dc.html) (detail only) | todo |

## 6. Facility & estate
| Screen | Design | Status |
|---|---|---|
| Estates list and estate detail | [Estate](claude-design/Estate.dc.html) | todo |
| Residents directory | – | todo |
| Service charge setup, billing run, invoices and arrears | [Estate](claude-design/Estate.dc.html) | todo |
| Utilities and diesel/running-cost log | [Estate](claude-design/Estate.dc.html) | todo |
| Maintenance board and request detail | [Estate](claude-design/Estate.dc.html), [HomeFM](claude-design/HomeFM.dc.html) | todo |
| Preventive schedules and work orders | [Estate](claude-design/Estate.dc.html) | todo |
| Common-area asset register | [Estate](claude-design/Estate.dc.html) | todo |

## 7. HR & payroll
| Screen | Design | Status |
|---|---|---|
| Employees list, employee profile, add/edit employee | [HRPayroll](claude-design/HRPayroll.dc.html) (list only) | todo |
| Site workers and daily attendance | [HRPayroll](claude-design/HRPayroll.dc.html) | todo |
| Pay components and payroll settings (rules with effective dates) | – | todo |
| Payroll run: draft → review → approve → paid | [HRPayroll](claude-design/HRPayroll.dc.html) | todo |
| Payslip (web and PDF) | [HRPayroll](claude-design/HRPayroll.dc.html) | todo |
| Statutory remittance schedules (PAYE, pension, NHF, NSITF, ITF) | [HRPayroll](claude-design/HRPayroll.dc.html) (summary only) | todo |
| Leave requests, approvals, calendar | [HRPayroll](claude-design/HRPayroll.dc.html) | todo |
| Appraisals | – | todo |
| Professional memberships and renewals | [HRPayroll](claude-design/HRPayroll.dc.html) | todo |

## 8. Compliance
| Screen | Design | Status |
|---|---|---|
| Permit tracker and permit detail | [Compliance](claude-design/Compliance.dc.html) | todo |
| KYC status list | [Compliance](claude-design/Compliance.dc.html) | todo |
| AML review queue and case detail | [Compliance](claude-design/Compliance.dc.html) | todo |
| SCUML / NFIU filing records | – | todo |
| UBO register | [Compliance](claude-design/Compliance.dc.html) | todo |
| Statutory rules admin (rates, thresholds, effective dates, sources) | [SetStatutory](claude-design/SetStatutory.dc.html) | todo |

## 9. Documents & contracts
| Screen | Design | Status |
|---|---|---|
| Template library and template editor (merge fields, preview) | [Documents](claude-design/Documents.dc.html) (library only) | todo |
| Contracts list and contract detail (approvals, e-signature) | [Documents](claude-design/Documents.dc.html) | todo |
| Generate document from a record | – | todo |
| Approval workflow settings | [SetApprovalRules](claude-design/SetApprovalRules.dc.html) | todo |
| Expiring contracts | [Documents](claude-design/Documents.dc.html) | todo |

## 10. Buyer portal
| Screen | Design | Status |
|---|---|---|
| Portal sign in (one-time code) / invite | [BuyerSignIn](claude-design/BuyerSignIn.dc.html), [BuyerSignInCodeMobile](claude-design/BuyerSignInCodeMobile.dc.html) | todo |
| My units and payment progress | [BuyerPortalMobile](claude-design/BuyerPortalMobile.dc.html) | todo |
| Pay now (Paystack) and payment result | [BuyerPortalMobile](claude-design/BuyerPortalMobile.dc.html) | todo |
| Statement of account and receipts | [BuyerPortalMobile](claude-design/BuyerPortalMobile.dc.html) | todo |
| Construction progress photos | [BuyerPortalMobile](claude-design/BuyerPortalMobile.dc.html) | todo |
| Documents: download, request a document | [BuyerPortalMobile](claude-design/BuyerPortalMobile.dc.html) | todo |
| Refer a friend | [BuyerPortalMobile](claude-design/BuyerPortalMobile.dc.html) | todo |
| My profile and KYC | – | todo |
| Buyer portal on desktop | – | todo |

## 11. Realtor portal
| Screen | Design | Status |
|---|---|---|
| Realtor sign up / sign in | [RealtorSignIn](claude-design/RealtorSignIn.dc.html) | todo |
| Register a lead | [RealtorPortal](claude-design/RealtorPortal.dc.html) | todo |
| My deals and commissions | [RealtorPortal](claude-design/RealtorPortal.dc.html) | todo |

## 12. Settings and admin
| Screen | Design | Status |
|---|---|---|
| Settings layout with left sub-navigation (brick 3b: only built sections the member can view; no sub-navigation while there's one section; Settings in the sidebar footer, user menu and More; brick 3d: **My security** last after a divider, and `/settings` opens it for people without settings access) | [SetOrg](claude-design/SetOrg.dc.html), [DSAdditions](claude-design/DSAdditions.dc.html) (settings nav), [SettingsMobile](claude-design/SettingsMobile.dc.html) | built (My security entry todo, brick 3d) |
| Organization profile: name, head office state, financial year; base currency shown (brick 3c; organization-wide, no company switcher). Brick 3d: *Security* card with **Require two-step sign-in for everyone** (owners only; read-only for others), people-with-two-step count, turn-on and turn-off confirms | [SetOrg](claude-design/SetOrg.dc.html) (Company and Defaults cards, partly) | built (Security card todo, brick 3d) |
| Companies (entities): Active and Archived chips, owner's plan usage line, edit, archive with Undo or a confirm naming people who'd lose access, restore (brick 3c; organization-wide) | [SetOrg](claude-design/SetOrg.dc.html) (entities table, partly) | built |
| Add company / Company sheet: name, type, RC number, TIN, VAT registered, "create a project instead" line; archived read-only with Restore; owner's plan message at the limit (brick 3c; opens from Settings, the company switcher, the Home checklist and ⌘K) | – | pattern |
| Branding: logo and colours on documents, emails and portals (proposed: with the first customer-facing document) | [SetBranding](claude-design/SetBranding.dc.html) | todo |
| Team: one list of members and open invitations (role in place, entity access, two-step, last active, invitation and delivery state), search, role filter, Invited and Removed chips, owner's plan usage line, confirms for remove, reset two-step and make owner (brick 3b) | [RolesSettings](claude-design/RolesSettings.dc.html) (users tab) | built |
| Invite people sheet: up to 20 emails, role for everyone or per row, entity access, row problems, plan places (brick 3b; also opens from the Home checklist and ⌘K; follows the entity switcher) | – | pattern |
| Member sheet: role, entity access with Save changes, two-step, reset two-step, make owner, remove; invitation sheet for open invitations (brick 3b; brick 3d: "2 passkeys" fact, Reset two-step also offered when someone has passkeys, confirm says their passkeys are removed) | [RolesSettings](claude-design/RolesSettings.dc.html) (users tab) | built (passkey changes todo, brick 3d) |
| Member and invitation sheets: facts, change role and entity access, reset two-step, remove; resend, withdraw (brick 3b) | – | todo |
| Roles & permissions list: built-in and custom roles, people and invited counts (link to Team), two-step, row menu (brick 3c) | [SetPermissions](claude-design/SetPermissions.dc.html) (partly) | built |
| Role page: module × action grid (read-only for built-in roles, editable for custom), two-step switch with lock, save bar, Duplicate role, Preview this role, Delete role (brick 3c; brick 3d: roles list reads "Required" and the switch is locked on with its reason while the organization requires two-step for everyone) | [SetPermissions](claude-design/SetPermissions.dc.html), [PermissionsMobile](claude-design/PermissionsMobile.dc.html) | built (organization lock todo, brick 3d) |
| New role dialog (name, start from) and delete role confirm (brick 3c) | – | pattern |
| Approval rules | [SetApprovalRules](claude-design/SetApprovalRules.dc.html) | todo |
| Fee and sales defaults, grace periods | – | todo |
| Numbering (receipts, invoices, documents) | – | todo |
| Message templates (WhatsApp, SMS, email) and reminder schedules | – | todo |
| Integrations (Paystack, WhatsApp provider, e-signature, e-KYC) | [SetIntegrations](claude-design/SetIntegrations.dc.html) | todo |
| Excel import wizard and import history | [ImportWizard](claude-design/ImportWizard.dc.html), [ImportMobile](claude-design/ImportMobile.dc.html) | todo |
| Data export and NDPA requests (export / delete contact data) | [SetDataProtection](claude-design/SetDataProtection.dc.html) | todo |
| Audit log (organization-wide search) | [AuditLog](claude-design/AuditLog.dc.html) | todo |
| Billing and plan (owner only: plan, limits with use, add-ons, trial end; uses the entitlement model in the feature-flags spec) | – | todo |

## 13. AI add-on
| Screen | Design | Status |
|---|---|---|
| Settings → AI, usage meter, budget states (lists only AI features available to the organization; hidden if none) | [AISettings](claude-design/AISettings.dc.html) | todo |
| Document reading review | [DocReader](claude-design/DocReader.dc.html) | todo |
| AI payment matching | [PaymentMatching](claude-design/PaymentMatching.dc.html) | todo |
| Ask Vento answers | [AskVento](claude-design/AskVento.dc.html) | todo |
| Draft with AI | [Drafting](claude-design/Drafting.dc.html) | todo |
| Voice site diary | [VoiceDiaryMobile](claude-design/VoiceDiaryMobile.dc.html) | todo |
| Risk badges, cash-flow forecast, overrun warnings | [ExecutiveHomeAI](claude-design/ExecutiveHomeAI.dc.html), [ProjectDetailAI](claude-design/ProjectDetailAI.dc.html), [SubscriptionDetailAI](claude-design/SubscriptionDetailAI.dc.html) | todo |
| Anomaly review queue | [AnomalyQueue](claude-design/AnomalyQueue.dc.html) | todo |

## 14. Documents, PDFs and messages (non-screen outputs)
| Screen | Design | Status |
|---|---|---|
| Receipt (PDF + WhatsApp image) | [Receipt](claude-design/Receipt.dc.html), [WAReceipt](claude-design/WAReceipt.dc.html) | todo |
| Statement of account | – | todo |
| Letter of offer, contract of sale, allocation letter, deed of assignment | [DocOffer](claude-design/DocOffer.dc.html), [DocContract](claude-design/DocContract.dc.html), [DocAllocation](claude-design/DocAllocation.dc.html), [DocDeed](claude-design/DocDeed.dc.html) | todo |
| Handover certificate | [HandoverCert](claude-design/HandoverCert.dc.html) | todo |
| Payslip PDF | – | todo |
| Board pack PDF | [BoardPack](claude-design/BoardPack.dc.html) | todo |
| Service charge invoice | [DocServiceInvoice](claude-design/DocServiceInvoice.dc.html) | todo |
| Purchase order PDF | [DocPO](claude-design/DocPO.dc.html) | todo |
| WHT credit note | [WHTCreditNote](claude-design/WHTCreditNote.dc.html) | todo |
| Emails: invite, verify, reset, receipt, reminder, approval request, digest | [EmailInvite](claude-design/EmailInvite.dc.html), [EmailVerify](claude-design/EmailVerify.dc.html), [EmailReset](claude-design/EmailReset.dc.html), [EmailReceipt](claude-design/EmailReceipt.dc.html), [EmailReminder](claude-design/EmailReminder.dc.html), [EmailApproval](claude-design/EmailApproval.dc.html), [EmailDigest](claude-design/EmailDigest.dc.html) | todo |
| Email: security alert (sign-in locked, password changed, two-step reset, backup code used; brick 3b adds "someone is now an owner"; brick 3d adds new sign-in from an unrecognised browser, passkey added, passkey removed, and "two-step no longer required for everyone" to owners) | – | pattern, needs-design (3d alerts todo) |
| WhatsApp templates: reminder, overdue, receipt, construction update | [WAReminder](claude-design/WAReminder.dc.html), [WAOverdue](claude-design/WAOverdue.dc.html), [WAReceipt](claude-design/WAReceipt.dc.html), [WAConstruction](claude-design/WAConstruction.dc.html) | todo |
| SMS templates | – | todo |

## 15. Super-admin (Vento staff only)
| Screen | Design | Status |
|---|---|---|
| Vento console shell (`/console`): navy sidebar with the amber "Vento staff · all customers" label, Organizations · Releases · Plans · Activity · Super-admins, top bar with the label below lg, bottom tabs (Organizations, Releases, Plans, More), user menu with **Back to {organization}**, theme and Sign out; 404 inside the console | [AdminOrgs](claude-design/AdminOrgs.dc.html) (sidebar) | built |
| *Confirm it's you* for the console (passkey, code, backup code): page card on arrival, dialog over the page mid-task; "Set up two-step to use the Vento console." | – | pattern |
| Organizations list (console home): four filtering stat cards, chips, search, table (cards on phones), no Projects column until the projects module | [AdminOrgs](claude-design/AdminOrgs.dc.html), [AdminOrgsMobile](claude-design/AdminOrgsMobile.dc.html) | built |
| Organization detail: Plan, Trial, Add-ons, Overrides (with ended), Features ("why"), Activity | [AdminOrgDetail](claude-design/AdminOrgDetail.dc.html) (header and card layout) | built |
| Organization change sheets: change plan, start and end trial, add AI, change AI budget, remove AI, release group, add and clear override (fields → preview → reason) | – | pattern |
| AI usage and cost by organization and feature | [AdminOrgDetail](claude-design/AdminOrgDetail.dc.html) (per organization only) | todo |
| Releases list and feature detail: stage control, **Turn off for everyone** always at the foot, holders by group, overrides, recent changes | – | pattern, needs-design |
| Plans list, plan detail (versions side by side), **Publish new version** stepped sheet (also a new plan) | – | pattern, needs-design |
| Super-admins: list, add (sheet), remove (confirm with reason), "fewer than 4" line | – | pattern |
| Activity (platform audit trail): person, feature, kind and date filters; **Command line** rose and **Console** tags | – (pattern from [AuditLog](claude-design/AuditLog.dc.html)) | pattern |
| User menu, More sheet and ⌘K: **Vento console** / "Open Vento console" (active super-admins only) | – | built |
| Flag and plan commands (`pnpm flags …`, `pnpm plans …`, `pnpm superadmin …`; text output, used until the console ships) | – | built |
| System health and failed jobs | [AdminJobs](claude-design/AdminJobs.dc.html) (failed jobs only) | todo |
