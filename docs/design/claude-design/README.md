# Claude Design export

The approved designs from Claude Design, exported on 25 Nov 2026: **419 boards** on 14 pages. They are the visual source of truth; `docs/design/SCREENS.md` maps each screen in the product to its board here.

## How to use these files
- Each `*.dc.html` file is one board. Open it in a browser to read its layout, copy and states. Claude Design's runtime (`support.js`) and uploaded images (the logo) aren't in the export, so interactive bits and the logo won't render; the markup, inline styles and sample data are all there.
- `canvas.json` is the canvas: pages, board positions and titles, and the designer's notes (transcribed in [`../DESIGN-NOTES.md`](../DESIGN-NOTES.md)).
- Colours and type are written inline as hex in these mockups. In the app they become tokens: see `design-system` skill and [`../DESIGN-NOTES.md`](../DESIGN-NOTES.md#tokens).
- Never edit these files to change a design. Build the change, log it in [`../CHANGES.md`](../CHANGES.md), and the next Claude Design pass updates the board.
- Variants: **desktop** 1440px, **tablet** 1024px, **mobile** 390px, **print** A4 (794px portrait, 1123px landscape), **email** 640px, each in light and often dark.

## Desktop screens
| Screen | Board title | Files |
|---|---|---|
| ExecutiveHome | MD — executive home | [desktop](ExecutiveHome.dc.html) |
| Onboarding | Onboarding → home checklist | [desktop](Onboarding.dc.html) |
| LandTitle | Parcels — list & map | [desktop](LandTitle.dc.html) |
| ParcelDetail | Parcel detail | [desktop](ParcelDetail.dc.html) |
| Projects | Project list | [desktop](Projects.dc.html) |
| ProjectDetail | Project detail + raise PO | [desktop](ProjectDetail.dc.html) |
| Sales | Units & lead pipeline | [desktop](Sales.dc.html) |
| LeadDetail | Lead detail | [desktop](LeadDetail.dc.html) |
| NewSubscription | New subscription (stepped sheet) | [desktop](NewSubscription.dc.html) |
| Commissions | Commissions | [desktop](Commissions.dc.html) |
| SubscriptionDetail | Subscription detail | [desktop](SubscriptionDetail.dc.html) |
| RecordReceipt | Record receipt dialog | [desktop](RecordReceipt.dc.html) |
| Receipt | Receipt — PDF & WhatsApp | [desktop](Receipt.dc.html) |
| OfferLetter | Letter of offer | [print](OfferLetter.dc.html) |
| AllocationLetter | Letter of allocation | [print](AllocationLetter.dc.html) |
| Finance | Finance | [desktop](Finance.dc.html) |
| HRPayroll | HR & payroll run | [desktop](HRPayroll.dc.html) |
| Estate | Estates | [desktop](Estate.dc.html) |
| Compliance | Compliance | [desktop](Compliance.dc.html) |
| Documents | Documents & contracts | [desktop](Documents.dc.html) |
| RolesSettings | Roles, permissions & users | [desktop](RolesSettings.dc.html) |
| SecuritySettings | Security: 2FA, sessions, role templates | [desktop](SecuritySettings.dc.html) |

## Role homes
| Screen | Board title | Files |
|---|---|---|
| HomeLand | Land & legal — Ngozi | [desktop](HomeLand.dc.html) |
| HomePM | Project manager — Kunle | [desktop](HomePM.dc.html) |
| HomeSales | Sales — Grace | [desktop](HomeSales.dc.html) |
| HomeFinance | Finance — Aisha | [desktop](HomeFinance.dc.html) |
| HomeHR | HR — Kemi | [desktop](HomeHR.dc.html) |
| HomeFM | Facility manager — Ope | [desktop](HomeFM.dc.html) |

## Capabilities
| Screen | Board title | Files |
|---|---|---|
| Approvals | Approvals inbox (maker-checker) | [desktop](Approvals.dc.html) |
| BuyerProfile | Buyer: timeline, WhatsApp, e-KYC | [desktop](BuyerProfile.dc.html) |
| ImportWizard | Import wizard: upload → map → fix → import → undo | [desktop](ImportWizard.dc.html) |
| SitePlan | Site plan (hover, click, start sale) | [desktop](SitePlan.dc.html) · [tablet](SitePlanTablet.dc.html) |
| SitePlanSetup | Setup: upload plan, place units | [desktop](SitePlanSetup.dc.html) |
| RealtorPortal | Realtor portal | [desktop](RealtorPortal.dc.html) |
| MorningDigest | MD morning digest: WhatsApp & email | [desktop](MorningDigest.dc.html) |

## AI add-on
| Screen | Board title | Files |
|---|---|---|
| AISettings | Settings → AI (use Preview to see 80% and limit states) | [desktop](AISettings.dc.html) |
| DocReader | Document reading (try “AI limit reached”) | [desktop](DocReader.dc.html) |
| PaymentMatching | Payment matching | [desktop](PaymentMatching.dc.html) |
| AskVento | Ask Vento in ⌘K | [desktop](AskVento.dc.html) |
| Drafting | Drafting: reminders & board-pack commentary | [desktop](Drafting.dc.html) |
| AnomalyQueue | Anomaly flags | [desktop](AnomalyQueue.dc.html) |
| ExecutiveHomeAI | Executive home + 13-week cash forecast | [desktop](ExecutiveHomeAI.dc.html) |
| ProjectDetailAI | Project + overrun early warning | [desktop](ProjectDetailAI.dc.html) |
| SubscriptionDetailAI | Subscription + default risk “Why?” | [desktop](SubscriptionDetailAI.dc.html) |

## Mobile by role
| Screen | Board title | Files |
|---|---|---|
| ExecutiveHome | Home | [mobile](ExecutiveHomeMobile.dc.html) |
| Projects | Projects | [mobile](ProjectsMobile.dc.html) |
| Documents | Approvals | [mobile](DocumentsMobile.dc.html) |
| Onboarding | Onboarding | [mobile](OnboardingMobile.dc.html) |
| HomeLand | Home | [mobile](HomeLandMobile.dc.html) |
| LandTitle | Parcels | [mobile](LandTitleMobile.dc.html) |
| ParcelDetail | Parcel | [mobile](ParcelDetailMobile.dc.html) |
| HomePM | Home | [mobile](HomePMMobile.dc.html) |
| SiteDiary | Diary entry (offline) | [mobile](SiteDiaryMobile.dc.html) |
| ProjectDetail | Project | [mobile](ProjectDetailMobile.dc.html) |
| Sales | Units & leads | [mobile](SalesMobile.dc.html) |
| HomeSales | Today | [mobile](HomeSalesMobile.dc.html) |
| LeadDetail | Lead | [mobile](LeadDetailMobile.dc.html) |
| NewSubscription | New subscription | [mobile](NewSubscriptionMobile.dc.html) |
| SubscriptionDetail | Subscription | [mobile](SubscriptionDetailMobile.dc.html) |
| Commissions | Commission | [mobile](CommissionsMobile.dc.html) |
| HomeFinance | Home | [mobile](HomeFinanceMobile.dc.html) |
| Finance | Bank & FX | [mobile](FinanceMobile.dc.html) |
| RecordReceipt | Record receipt | [mobile](RecordReceiptMobile.dc.html) |
| Compliance | AML & permits | [mobile](ComplianceMobile.dc.html) |
| Approvals | Approvals | [mobile](ApprovalsMobile.dc.html) |
| BuyerProfile | Buyer conversation | [mobile](BuyerProfileMobile.dc.html) |
| SitePlan | Site plan | [mobile](SitePlanMobile.dc.html) |
| Import | Import summary & undo | [mobile](ImportMobile.dc.html) |
| Realtor | Realtor portal | [mobile](RealtorMobile.dc.html) |
| Security | Security | [mobile](SecurityMobile.dc.html) |
| VoiceDiary | Voice site diary | [mobile](VoiceDiaryMobile.dc.html) |
| DocReader | Read a document | [mobile](DocReaderMobile.dc.html) |
| Matching | Match payments | [mobile](MatchingMobile.dc.html) |
| AskVento | Ask Vento | [mobile](AskVentoMobile.dc.html) |
| Drafting | Draft reminder | [mobile](DraftingMobile.dc.html) |
| Anomaly | Flags | [mobile](AnomalyMobile.dc.html) |
| AISettings | AI settings | [mobile](AISettingsMobile.dc.html) |
| HomeHR | HR home | [mobile](HomeHRMobile.dc.html) |
| HR | Payroll | [mobile](HRMobile.dc.html) |
| HomeFM | FM requests | [mobile](HomeFMMobile.dc.html) |
| BuyerPortal | Buyer portal | [mobile](BuyerPortalMobile.dc.html) |

## Dark mode
| Screen | Board title | Files |
|---|---|---|
| AISettings | AISettings | [dark](AISettingsDark.dc.html) · [mobile dark](AISettingsMobileDark.dc.html) |
| AnomalyQueue | AnomalyQueue | [dark](AnomalyQueueDark.dc.html) |
| Approvals | Approvals | [dark](ApprovalsDark.dc.html) · [mobile dark](ApprovalsMobileDark.dc.html) |
| AskVento | AskVento | [dark](AskVentoDark.dc.html) · [mobile dark](AskVentoMobileDark.dc.html) |
| BuyerProfile | BuyerProfile | [dark](BuyerProfileDark.dc.html) · [mobile dark](BuyerProfileMobileDark.dc.html) |
| Commissions | Commissions | [dark](CommissionsDark.dc.html) · [mobile dark](CommissionsMobileDark.dc.html) |
| Compliance | Compliance | [dark](ComplianceDark.dc.html) · [mobile dark](ComplianceMobileDark.dc.html) |
| DocReader | DocReader | [dark](DocReaderDark.dc.html) · [mobile dark](DocReaderMobileDark.dc.html) |
| Documents | Documents | [dark](DocumentsDark.dc.html) · [mobile dark](DocumentsMobileDark.dc.html) |
| Drafting | Drafting | [dark](DraftingDark.dc.html) · [mobile dark](DraftingMobileDark.dc.html) |
| Estate | Estate | [dark](EstateDark.dc.html) |
| ExecutiveHomeAI | ExecutiveHomeAI | [dark](ExecutiveHomeAIDark.dc.html) |
| ExecutiveHome | ExecutiveHome | [dark](ExecutiveHomeDark.dc.html) · [mobile dark](ExecutiveHomeMobileDark.dc.html) |
| Finance | Finance | [dark](FinanceDark.dc.html) · [mobile dark](FinanceMobileDark.dc.html) |
| HRPayroll | HRPayroll | [dark](HRPayrollDark.dc.html) |
| HomeFM | HomeFM | [dark](HomeFMDark.dc.html) · [mobile dark](HomeFMMobileDark.dc.html) |
| HomeFinance | HomeFinance | [dark](HomeFinanceDark.dc.html) · [mobile dark](HomeFinanceMobileDark.dc.html) |
| HomeHR | HomeHR | [dark](HomeHRDark.dc.html) · [mobile dark](HomeHRMobileDark.dc.html) |
| HomeLand | HomeLand | [dark](HomeLandDark.dc.html) · [mobile dark](HomeLandMobileDark.dc.html) |
| HomePM | HomePM | [dark](HomePMDark.dc.html) · [mobile dark](HomePMMobileDark.dc.html) |
| HomeSales | HomeSales | [dark](HomeSalesDark.dc.html) · [mobile dark](HomeSalesMobileDark.dc.html) |
| ImportWizard | ImportWizard | [dark](ImportWizardDark.dc.html) |
| LandTitle | LandTitle | [dark](LandTitleDark.dc.html) · [mobile dark](LandTitleMobileDark.dc.html) |
| LeadDetail | LeadDetail | [dark](LeadDetailDark.dc.html) · [mobile dark](LeadDetailMobileDark.dc.html) |
| NewSubscription | NewSubscription | [dark](NewSubscriptionDark.dc.html) · [mobile dark](NewSubscriptionMobileDark.dc.html) |
| ParcelDetail | ParcelDetail | [dark](ParcelDetailDark.dc.html) · [mobile dark](ParcelDetailMobileDark.dc.html) |
| PaymentMatching | PaymentMatching | [dark](PaymentMatchingDark.dc.html) |
| ProjectDetailAI | ProjectDetailAI | [dark](ProjectDetailAIDark.dc.html) |
| ProjectDetail | ProjectDetail | [dark](ProjectDetailDark.dc.html) · [mobile dark](ProjectDetailMobileDark.dc.html) |
| Projects | Projects | [dark](ProjectsDark.dc.html) · [mobile dark](ProjectsMobileDark.dc.html) |
| RecordReceipt | RecordReceipt | [dark](RecordReceiptDark.dc.html) · [mobile dark](RecordReceiptMobileDark.dc.html) |
| RolesSettings | RolesSettings | [dark](RolesSettingsDark.dc.html) |
| Sales | Sales | [dark](SalesDark.dc.html) · [mobile dark](SalesMobileDark.dc.html) |
| SecuritySettings | SecuritySettings | [dark](SecuritySettingsDark.dc.html) |
| SitePlan | SitePlan | [dark](SitePlanDark.dc.html) · [tablet dark](SitePlanTabletDark.dc.html) · [mobile dark](SitePlanMobileDark.dc.html) |
| SitePlanSetup | SitePlanSetup | [dark](SitePlanSetupDark.dc.html) |
| SubscriptionDetailAI | SubscriptionDetailAI | [dark](SubscriptionDetailAIDark.dc.html) |
| SubscriptionDetail | SubscriptionDetail | [dark](SubscriptionDetailDark.dc.html) · [mobile dark](SubscriptionDetailMobileDark.dc.html) |
| Anomaly | AnomalyMobile | [mobile dark](AnomalyMobileDark.dc.html) |
| HR | HRMobile | [mobile dark](HRMobileDark.dc.html) |
| Import | ImportMobile | [mobile dark](ImportMobileDark.dc.html) |
| Matching | MatchingMobile | [mobile dark](MatchingMobileDark.dc.html) |
| Onboarding | OnboardingMobile | [mobile dark](OnboardingMobileDark.dc.html) |
| Security | SecurityMobile | [mobile dark](SecurityMobileDark.dc.html) |
| SiteDiary | SiteDiaryMobile | [mobile dark](SiteDiaryMobileDark.dc.html) |
| VoiceDiary | VoiceDiaryMobile | [mobile dark](VoiceDiaryMobileDark.dc.html) |

## Design system & states
| Screen | Board title | Files |
|---|---|---|
| Main | Design system | [desktop](Main.dc.html) |
| States | Loading · empty · error · offline | [desktop](States.dc.html) |
| DSExtensions | Capabilities & AI components | [desktop](DSExtensions.dc.html) |

## Board pack (print)
| Screen | Board title | Files |
|---|---|---|
| BoardPack | Page 1 | [desktop](BoardPack.dc.html) |
| BoardPack2 | Page 2 | [desktop](BoardPack2.dc.html) |
| BoardPack3 | Page 3 | [desktop](BoardPack3.dc.html) |
| BoardPack4 | Page 4 | [desktop](BoardPack4.dc.html) |
| BoardPack5 | Page 5 | [desktop](BoardPack5.dc.html) |
| BoardPack6 | Page 6 | [desktop](BoardPack6.dc.html) |

## 1 · Access & system states
| Screen | Board title | Files |
|---|---|---|
| SignIn | Sign in | [desktop](SignIn.dc.html) · [mobile](SignInMobile.dc.html) · [dark](SignInDark.dc.html) · [mobile dark](SignInMobileDark.dc.html) |
| SignIn2FA | Two-step (error state) | [desktop](SignIn2FA.dc.html) · [mobile](SignIn2FAMobile.dc.html) · [dark](SignIn2FADark.dc.html) · [mobile dark](SignIn2FAMobileDark.dc.html) |
| SignUp | Sign up | [desktop](SignUp.dc.html) · [mobile](SignUpMobile.dc.html) · [dark](SignUpDark.dc.html) · [mobile dark](SignUpMobileDark.dc.html) |
| VerifyEmail | Verify email | [desktop](VerifyEmail.dc.html) · [mobile](VerifyEmailMobile.dc.html) · [dark](VerifyEmailDark.dc.html) · [mobile dark](VerifyEmailMobileDark.dc.html) |
| ForgotPassword | Forgot password (sent) | [desktop](ForgotPassword.dc.html) · [mobile](ForgotPasswordMobile.dc.html) · [dark](ForgotPasswordDark.dc.html) · [mobile dark](ForgotPasswordMobileDark.dc.html) |
| ResetPassword | Reset password | [desktop](ResetPassword.dc.html) · [mobile](ResetPasswordMobile.dc.html) · [dark](ResetPasswordDark.dc.html) · [mobile dark](ResetPasswordMobileDark.dc.html) |
| AcceptInvite | Accept invitation | [desktop](AcceptInvite.dc.html) · [mobile](AcceptInviteMobile.dc.html) · [dark](AcceptInviteDark.dc.html) · [mobile dark](AcceptInviteMobileDark.dc.html) |
| BuyerSignIn | Buyer portal sign-in | [desktop](BuyerSignIn.dc.html) · [mobile](BuyerSignInMobile.dc.html) · [dark](BuyerSignInDark.dc.html) · [mobile dark](BuyerSignInMobileDark.dc.html) |
| RealtorSignIn | Partner portal sign-in | [desktop](RealtorSignIn.dc.html) · [mobile](RealtorSignInMobile.dc.html) · [dark](RealtorSignInDark.dc.html) · [mobile dark](RealtorSignInMobileDark.dc.html) |
| BuyerSignInCode | Buyer code | [mobile](BuyerSignInCodeMobile.dc.html) · [mobile dark](BuyerSignInCodeMobileDark.dc.html) |
| Error403 | 403 · no access (Request access opens a dialog) | [desktop](Error403.dc.html) · [mobile](Error403Mobile.dc.html) · [dark](Error403Dark.dc.html) · [mobile dark](Error403MobileDark.dc.html) |
| Error404 | 404 | [desktop](Error404.dc.html) · [mobile](Error404Mobile.dc.html) · [dark](Error404Dark.dc.html) · [mobile dark](Error404MobileDark.dc.html) |
| Error500 | 500 | [desktop](Error500.dc.html) · [mobile](Error500Mobile.dc.html) · [dark](Error500Dark.dc.html) · [mobile dark](Error500MobileDark.dc.html) |
| OfflineBanner | Offline banner on a list | [desktop](OfflineBanner.dc.html) · [dark](OfflineBannerDark.dc.html) |
| OfflinePage | Offline page | [desktop](OfflinePage.dc.html) · [dark](OfflinePageDark.dc.html) |
| SessionExpired | Session expired | [desktop](SessionExpired.dc.html) · [mobile](SessionExpiredMobile.dc.html) · [dark](SessionExpiredDark.dc.html) · [mobile dark](SessionExpiredMobileDark.dc.html) |
| Offline | OfflineMobile | [mobile](OfflineMobile.dc.html) · [mobile dark](OfflineMobileDark.dc.html) |
| Notifications | Notifications (grouped) | [desktop](Notifications.dc.html) · [mobile](NotificationsMobile.dc.html) · [dark](NotificationsDark.dc.html) · [mobile dark](NotificationsMobileDark.dc.html) |
| NotificationPrefs | Notification preferences | [desktop](NotificationPrefs.dc.html) · [mobile](NotificationPrefsMobile.dc.html) · [dark](NotificationPrefsDark.dc.html) · [mobile dark](NotificationPrefsMobileDark.dc.html) |

## 2 · Sales lifecycle
| Screen | Board title | Files |
|---|---|---|
| Units | Units | [desktop](Units.dc.html) · [mobile](UnitsMobile.dc.html) · [dark](UnitsDark.dc.html) · [mobile dark](UnitsMobileDark.dc.html) |
| UnitDetail | Unit detail | [desktop](UnitDetail.dc.html) · [mobile](UnitDetailMobile.dc.html) · [dark](UnitDetailDark.dc.html) · [mobile dark](UnitDetailMobileDark.dc.html) |
| BulkCreateUnits | Bulk create units | [desktop](BulkCreateUnits.dc.html) · [mobile](BulkCreateUnitsMobile.dc.html) · [dark](BulkCreateUnitsDark.dc.html) · [mobile dark](BulkCreateUnitsMobileDark.dc.html) |
| PriceList | Price list | [desktop](PriceList.dc.html) · [mobile](PriceListMobile.dc.html) · [dark](PriceListDark.dc.html) · [mobile dark](PriceListMobileDark.dc.html) |
| AddLead | Add lead | [desktop](AddLead.dc.html) · [mobile](AddLeadMobile.dc.html) · [dark](AddLeadDark.dc.html) · [mobile dark](AddLeadMobileDark.dc.html) |
| ContactProfile | Contact profile | [desktop](ContactProfile.dc.html) · [mobile](ContactProfileMobile.dc.html) · [dark](ContactProfileDark.dc.html) · [mobile dark](ContactProfileMobileDark.dc.html) |
| PlanTemplates | Payment plan templates | [desktop](PlanTemplates.dc.html) · [mobile](PlanTemplatesMobile.dc.html) · [dark](PlanTemplatesDark.dc.html) · [mobile dark](PlanTemplatesMobileDark.dc.html) |
| PlanBuilder | Payment plan builder | [desktop](PlanBuilder.dc.html) · [dark](PlanBuilderDark.dc.html) |
| ReschedulePlan | Reschedule plan | [desktop](ReschedulePlan.dc.html) · [dark](ReschedulePlanDark.dc.html) |
| Reschedule | Reschedule (mobile) | [mobile](RescheduleMobile.dc.html) · [mobile dark](RescheduleMobileDark.dc.html) |
| CancelSubscription | Cancel or default | [desktop](CancelSubscription.dc.html) · [mobile](CancelSubscriptionMobile.dc.html) · [dark](CancelSubscriptionDark.dc.html) · [mobile dark](CancelSubscriptionMobileDark.dc.html) |
| TransferUnit | Transfer unit | [desktop](TransferUnit.dc.html) · [mobile](TransferUnitMobile.dc.html) · [dark](TransferUnitDark.dc.html) · [mobile dark](TransferUnitMobileDark.dc.html) |
| Handover | Handover checklist | [desktop](Handover.dc.html) · [mobile](HandoverMobile.dc.html) · [dark](HandoverDark.dc.html) · [mobile dark](HandoverMobileDark.dc.html) |
| HandoverCert | Handover certificate | [print](HandoverCert.dc.html) |
| CommissionDetail | Commission detail | [desktop](CommissionDetail.dc.html) · [mobile](CommissionDetailMobile.dc.html) · [dark](CommissionDetailDark.dc.html) · [mobile dark](CommissionDetailMobileDark.dc.html) |

## 3 · Finance operations
| Screen | Board title | Files |
|---|---|---|
| Receipts | Receipts | [desktop](Receipts.dc.html) · [mobile](ReceiptsMobile.dc.html) · [dark](ReceiptsDark.dc.html) · [mobile dark](ReceiptsMobileDark.dc.html) |
| ReceiptDetail | Receipt detail | [desktop](ReceiptDetail.dc.html) · [mobile](ReceiptDetailMobile.dc.html) · [dark](ReceiptDetailDark.dc.html) · [mobile dark](ReceiptDetailMobileDark.dc.html) |
| ReceiptReverse | Reverse receipt | [desktop](ReceiptReverse.dc.html) · [dark](ReceiptReverseDark.dc.html) |
| UnmatchedReceipts | Unmatched receipts | [desktop](UnmatchedReceipts.dc.html) · [dark](UnmatchedReceiptsDark.dc.html) |
| Unmatched | Unmatched (mobile) | [mobile](UnmatchedMobile.dc.html) · [mobile dark](UnmatchedMobileDark.dc.html) |
| VendorBill | Vendor bill | [desktop](VendorBill.dc.html) · [mobile](VendorBillMobile.dc.html) · [dark](VendorBillDark.dc.html) · [mobile dark](VendorBillMobileDark.dc.html) |
| WHTCreditNote | WHT credit note | [print](WHTCreditNote.dc.html) |
| PeriodClose | Period close | [desktop](PeriodClose.dc.html) · [mobile](PeriodCloseMobile.dc.html) · [dark](PeriodCloseDark.dc.html) · [mobile dark](PeriodCloseMobileDark.dc.html) |
| Statements | Financial statements | [desktop](Statements.dc.html) · [mobile](StatementsMobile.dc.html) · [dark](StatementsDark.dc.html) · [mobile dark](StatementsMobileDark.dc.html) |
| EntityDetail | Entity detail | [desktop](EntityDetail.dc.html) · [mobile](EntityDetailMobile.dc.html) · [dark](EntityDetailDark.dc.html) · [mobile dark](EntityDetailMobileDark.dc.html) |
| FXRates | FX rates | [desktop](FXRates.dc.html) · [mobile](FXRatesMobile.dc.html) · [dark](FXRatesDark.dc.html) · [mobile dark](FXRatesMobileDark.dc.html) |

## 4 · Land & construction
| Screen | Board title | Files |
|---|---|---|
| ParcelEditor | Add or edit parcel | [desktop](ParcelEditor.dc.html) · [mobile](ParcelEditorMobile.dc.html) · [dark](ParcelEditorDark.dc.html) · [mobile dark](ParcelEditorMobileDark.dc.html) |
| TitleStageUpdate | Title stage update | [desktop](TitleStageUpdate.dc.html) · [dark](TitleStageUpdateDark.dc.html) |
| EncumbranceAdd | Add encumbrance | [desktop](EncumbranceAdd.dc.html) · [dark](EncumbranceAddDark.dc.html) |
| EncumbranceClear | Clear encumbrance | [desktop](EncumbranceClear.dc.html) · [dark](EncumbranceClearDark.dc.html) |
| TitleStage | Title stage (mobile) | [mobile](TitleStageMobile.dc.html) · [mobile dark](TitleStageMobileDark.dc.html) |
| Encumbrance | Encumbrance (mobile) | [mobile](EncumbranceMobile.dc.html) · [mobile dark](EncumbranceMobileDark.dc.html) |
| Contractors | Contractors | [desktop](Contractors.dc.html) · [mobile](ContractorsMobile.dc.html) · [dark](ContractorsDark.dc.html) · [mobile dark](ContractorsMobileDark.dc.html) |
| ContractorProfile | Contractor profile | [desktop](ContractorProfile.dc.html) · [mobile](ContractorProfileMobile.dc.html) · [dark](ContractorProfileDark.dc.html) · [mobile dark](ContractorProfileMobileDark.dc.html) |
| MaterialRequest | Material request | [desktop](MaterialRequest.dc.html) · [mobile](MaterialRequestMobile.dc.html) · [dark](MaterialRequestDark.dc.html) · [mobile dark](MaterialRequestMobileDark.dc.html) |
| POCreate | Create purchase order | [desktop](POCreate.dc.html) · [dark](POCreateDark.dc.html) |
| GoodsReceived | Goods received | [desktop](GoodsReceived.dc.html) · [mobile](GoodsReceivedMobile.dc.html) · [dark](GoodsReceivedDark.dc.html) · [mobile dark](GoodsReceivedMobileDark.dc.html) |
| PODetail | PO detail | [desktop](PODetail.dc.html) · [mobile](PODetailMobile.dc.html) · [dark](PODetailDark.dc.html) · [mobile dark](PODetailMobileDark.dc.html) |
| MaterialRates | Material rates | [desktop](MaterialRates.dc.html) · [mobile](MaterialRatesMobile.dc.html) · [dark](MaterialRatesDark.dc.html) · [mobile dark](MaterialRatesMobileDark.dc.html) |

## 5 · Documents & messages
| Screen | Board title | Files |
|---|---|---|
| DocOffer | Letter of offer | [print](DocOffer.dc.html) |
| DocContract | Contract of sale | [print](DocContract.dc.html) · [mobile](DocContractMobile.dc.html) |
| DocAllocation | Letter of allocation | [print](DocAllocation.dc.html) |
| DocDeed | Deed of assignment | [print](DocDeed.dc.html) |
| DocPO | Purchase order PDF | [print](DocPO.dc.html) |
| DocServiceInvoice | Service charge invoice | [print](DocServiceInvoice.dc.html) |
| EmailInvite | Email · Invitation | [email](EmailInvite.dc.html) |
| EmailVerify | Email · Verify email | [email](EmailVerify.dc.html) |
| EmailReset | Email · Reset password | [email](EmailReset.dc.html) |
| EmailReceipt | Email · Receipt | [email](EmailReceipt.dc.html) · [mobile](EmailReceiptMobile.dc.html) |
| EmailReminder | Email · Instalment reminder | [email](EmailReminder.dc.html) · [mobile](EmailReminderMobile.dc.html) |
| EmailApproval | Email · Approval request | [email](EmailApproval.dc.html) |
| EmailDigest | Email · Daily digest | [email](EmailDigest.dc.html) |
| WAReminder | WhatsApp · Instalment reminder | [phone](WAReminder.dc.html) |
| WAOverdue | WhatsApp · Overdue notice | [phone](WAOverdue.dc.html) |
| WAReceipt | WhatsApp · Receipt | [phone](WAReceipt.dc.html) |
| WAConstruction | WhatsApp · Construction update | [phone](WAConstruction.dc.html) |

## 6 · Settings & admin
| Screen | Board title | Files |
|---|---|---|
| DSAdditions | New components | [desktop](DSAdditions.dc.html) · [dark](DSAdditionsDark.dc.html) |
| SetOrg | Organization profile | [desktop](SetOrg.dc.html) · [dark](SetOrgDark.dc.html) |
| SetBranding | Branding | [desktop](SetBranding.dc.html) · [dark](SetBrandingDark.dc.html) |
| SetPermissions | Permissions | [desktop](SetPermissions.dc.html) · [dark](SetPermissionsDark.dc.html) |
| SetApprovalRules | Approval rules | [desktop](SetApprovalRules.dc.html) · [dark](SetApprovalRulesDark.dc.html) |
| SetIntegrations | Integrations | [desktop](SetIntegrations.dc.html) · [dark](SetIntegrationsDark.dc.html) |
| SetStatutory | Statutory rules | [desktop](SetStatutory.dc.html) · [dark](SetStatutoryDark.dc.html) |
| SetDataProtection | Data protection | [desktop](SetDataProtection.dc.html) · [dark](SetDataProtectionDark.dc.html) |
| AuditLog | Audit log | [desktop](AuditLog.dc.html) · [mobile](AuditLogMobile.dc.html) · [dark](AuditLogDark.dc.html) · [mobile dark](AuditLogMobileDark.dc.html) |
| Settings | Settings (mobile) | [mobile](SettingsMobile.dc.html) · [mobile dark](SettingsMobileDark.dc.html) |
| Permissions | Permissions (mobile) | [mobile](PermissionsMobile.dc.html) · [mobile dark](PermissionsMobileDark.dc.html) |
| ApprovalRules | Approval rules (mobile) | [mobile](ApprovalRulesMobile.dc.html) · [mobile dark](ApprovalRulesMobileDark.dc.html) |
| Integrations | Integrations (mobile) | [mobile](IntegrationsMobile.dc.html) · [mobile dark](IntegrationsMobileDark.dc.html) |
| Statutory | Statutory rules (mobile) | [mobile](StatutoryMobile.dc.html) · [mobile dark](StatutoryMobileDark.dc.html) |
| DataRequests | Data requests (mobile) | [mobile](DataRequestsMobile.dc.html) · [mobile dark](DataRequestsMobileDark.dc.html) |
| AdminOrgs | Super-admin · organizations | [desktop](AdminOrgs.dc.html) · [mobile](AdminOrgsMobile.dc.html) · [dark](AdminOrgsDark.dc.html) · [mobile dark](AdminOrgsMobileDark.dc.html) |
| AdminOrgDetail | Super-admin · org detail | [desktop](AdminOrgDetail.dc.html) · [dark](AdminOrgDetailDark.dc.html) |
| AdminJobs | Super-admin · failed jobs | [desktop](AdminJobs.dc.html) · [dark](AdminJobsDark.dc.html) |
