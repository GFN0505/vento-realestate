# Screen inventory

The single list of every screen, sheet, dialog, document and message the product needs, derived from `docs/PRODUCT.md`, `docs/DOMAIN.md` and `docs/journeys/`, not from the design. Keep it current: when a feature adds, changes or removes a screen, update this file in the same change.

**Design** — links to the approved board(s) in [`claude-design/`](claude-design/README.md) (desktop file shown; mobile and dark variants sit beside it, see the index). A note in brackets means the board covers only part of the row. `–` means no design: build it from the design-system archetypes.
**Status** — `todo` · `pattern` (built from design-system patterns, no bespoke design) · `built` (matches its board) · `needs-design` (flagged for the next design pass)

Every list screen implies its empty, filtered-empty, loading and error states (designed once on [States](claude-design/States.dc.html)); every form implies validation, saving and error states. Those aren't listed separately. Product rules the designs set are in [DESIGN-NOTES.md](DESIGN-NOTES.md).
**Coverage:** 169 rows · 135 designed (18 of them partly) · 34 without a design.



## 0. Foundation and account
| Screen | Design | Status |
|---|---|---|
| Sign in, two-factor challenge | [SignIn](claude-design/SignIn.dc.html), [SignIn2FA](claude-design/SignIn2FA.dc.html) | built |
| Sign up, verify email | [SignUp](claude-design/SignUp.dc.html), [VerifyEmail](claude-design/VerifyEmail.dc.html) | built |
| Forgot / reset password | [ForgotPassword](claude-design/ForgotPassword.dc.html), [ResetPassword](claude-design/ResetPassword.dc.html) | built |
| Accept invitation | [AcceptInvite](claude-design/AcceptInvite.dc.html) | built |
| Set up two-step (forced at sign-in or after accepting an invitation) and backup codes | [SecuritySettings](claude-design/SecuritySettings.dc.html) (two-factor panel only) | pattern |
| Onboarding: organization → first entity → first project and units (steps 1–2 in brick 2a) | [Onboarding](claude-design/Onboarding.dc.html) | built (steps 1–2) |
| Setup checklist on Home (brick 3b) | [Onboarding](claude-design/Onboarding.dc.html) | todo |
| App shell: sidebar by role, top bar, entity switcher, organization switcher, user menu (theme, preview as role), mobile bottom tabs and More sheet (brick 3a; project switcher with Projects; feature-flags spec: only available features, "Early access" tag, owner-only "Available on …" rows in ⌘K) | [ExecutiveHome](claude-design/ExecutiveHome.dc.html), [ExecutiveHomeMobile](claude-design/ExecutiveHomeMobile.dc.html), role homes (sidebars and tabs), [Main](claude-design/Main.dc.html) (bottom nav) | built |
| ⌘K command palette (brick 3a: pages and actions; record search added per module) | [ExecutiveHome](claude-design/ExecutiveHome.dc.html) (palette), [Main](claude-design/Main.dc.html) (component), [AskVento](claude-design/AskVento.dc.html) | built (pages and actions) |
| Module placeholder ("Coming soon", until each module ships; only in Vento's internal organizations once feature flags ship) | – | pattern |
| Plan limit message (inline where a create is refused; owner version with **Talk to Vento**, member version naming whom to ask) (feature flags) | – | todo |
| Trial ending: line on Home and email to owners (feature flags) | – | todo |
| Notifications panel and notification preferences | [Notifications](claude-design/Notifications.dc.html), [NotificationPrefs](claude-design/NotificationPrefs.dc.html) | todo |
| Approvals inbox | [Approvals](claude-design/Approvals.dc.html) | todo |
| Global search results page | – | todo |
| Keyboard shortcuts help (`?`) (brick 3a) | – | pattern |
| My security: two-step on/off, backup codes, active sessions, passkeys (brick 3d); my profile | [SecuritySettings](claude-design/SecuritySettings.dc.html), [SecurityMobile](claude-design/SecurityMobile.dc.html) (security only; passkeys and profile not designed) | todo |
| 403 no access, 404 not found, 500 error, offline banner and page (brick 3a; Request access in brick 4) | [Error403](claude-design/Error403.dc.html), [Error404](claude-design/Error404.dc.html), [Error500](claude-design/Error500.dc.html), [OfflineBanner](claude-design/OfflineBanner.dc.html), [OfflinePage](claude-design/OfflinePage.dc.html) | built (Request access in brick 4) |
| Maintenance page | – | todo |
| Session expired / signed out elsewhere | [SessionExpired](claude-design/SessionExpired.dc.html) | built |
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
| Settings layout with left sub-navigation (brick 3b) | [SetOrg](claude-design/SetOrg.dc.html), [DSAdditions](claude-design/DSAdditions.dc.html) (settings nav), [SettingsMobile](claude-design/SettingsMobile.dc.html) | todo |
| Organization profile and entities: add, edit, archive (brick 3c) | [SetOrg](claude-design/SetOrg.dc.html) | todo |
| Branding: logo and colours on documents, emails and portals (proposed: with the first customer-facing document) | [SetBranding](claude-design/SetBranding.dc.html) | todo |
| Team members and invitations: invite, change role and limits, resend, withdraw, remove, reset two-step (brick 3b) | [RolesSettings](claude-design/RolesSettings.dc.html) | todo |
| Permissions: role × module matrix, copy and edit custom roles (brick 3c) | [SetPermissions](claude-design/SetPermissions.dc.html), [PermissionsMobile](claude-design/PermissionsMobile.dc.html) | todo |
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
| Email: security alert (sign-in locked, password changed, two-step reset, backup code used) | – | pattern, needs-design |
| WhatsApp templates: reminder, overdue, receipt, construction update | [WAReminder](claude-design/WAReminder.dc.html), [WAOverdue](claude-design/WAOverdue.dc.html), [WAReceipt](claude-design/WAReceipt.dc.html), [WAConstruction](claude-design/WAConstruction.dc.html) | todo |
| SMS templates | – | todo |

## 15. Super-admin (Vento staff only)
| Screen | Design | Status |
|---|---|---|
| Organizations list and detail: release group, plan, add-ons, overrides and trials, AI budget (console in R2) | [AdminOrgs](claude-design/AdminOrgs.dc.html), [AdminOrgDetail](claude-design/AdminOrgDetail.dc.html) | todo |
| AI usage and cost by organization and feature | [AdminOrgDetail](claude-design/AdminOrgDetail.dc.html) (per organization only) | todo |
| Feature flags: stage per flag, who has it, plans that include it (console in R2) | [AdminOrgDetail](claude-design/AdminOrgDetail.dc.html) (per organization only) | todo |
| Plans: contents, limits, versions (console in R2) | – | todo |
| Flag and plan commands (`pnpm flags …`, `pnpm plans …`; text output, used until the console ships) | – | todo |
| System health and failed jobs | [AdminJobs](claude-design/AdminJobs.dc.html) (failed jobs only) | todo |
