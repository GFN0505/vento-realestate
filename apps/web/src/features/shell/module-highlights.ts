import type { NavKey } from './nav'

/**
 * What each module will do, in three short points, for its Coming soon page. Plain facts from
 * the product plan (docs/PRODUCT.md), not promises of dates. Kept out of nav.ts so these words
 * load with the page, not with the shell.
 */
export const MODULE_HIGHLIGHTS: Partial<Record<NavKey, readonly string[]>> = {
  land: [
    'Every parcel with its survey plan, C of O and consent',
    'Title stages tracked with dates and documents',
    'Encumbrances flagged wherever the parcel appears',
  ],
  projects: [
    'Phases with planned and actual dates',
    'Budgets, BoQs and purchase orders side by side',
    'A site diary that works on a phone, even offline',
  ],
  estates: [
    'Service charge billed and collected per estate',
    'Utilities and diesel tracked',
    'Maintenance requests with response times',
  ],
  sales: [
    'A live unit grid by block and status',
    'Leads to subscriptions with payment plans',
    'Commission earned per cleared receipt',
  ],
  finance: [
    'Receipts applied to instalments, oldest first',
    'A ledger per entity, in naira and foreign currency',
    'VAT and WHT worked out for you',
  ],
  hr: [
    'Staff and site workers in one register',
    'Payroll with PAYE, pension and NHF',
    'Approval before anything is paid',
  ],
  compliance: [
    'Permits with expiry reminders',
    'Buyer KYC and AML reviews',
    'The UBO register for each entity',
  ],
  documents: [
    'Offer and allocation letters from templates',
    'Approval before anything is sent',
    'E-signature and a verify link on every letter',
  ],
  reports: [
    'A dashboard for each role',
    'Project returns and cash forecasts',
    'Board packs ready to share',
  ],
}
