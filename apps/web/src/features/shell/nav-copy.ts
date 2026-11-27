import type { NavKey } from './nav'

/*
 * Words only the ⌘K palette and the Coming soon page need, kept out of Home's first load.
 */

type NavCopy = {
  /** Extra words ⌘K matches on. */
  keywords: readonly string[]
  /** The Coming soon page's one line (spec UI copy). */
  comingSoon?: string
}

export const NAV_COPY: Record<NavKey, NavCopy> = {
  home: {
    keywords: ['dashboard', 'start'],
  },
  approvals: {
    keywords: ['approve', 'reject', 'requests', 'sign off', 'waiting for me', 'maker checker'],
  },
  land: {
    keywords: ['parcels', 'plots', 'c of o', 'consent', 'survey', 'encumbrances'],
    comingSoon:
      "Track parcels from purchase to perfected title: survey plans, C of O, governor's consent and encumbrances.",
  },
  projects: {
    keywords: ['construction', 'phases', 'site', 'diary', 'boq', 'contractors', 'purchase orders'],
    comingSoon: 'Run phases, budgets, BoQs, contractors, purchase orders and the site diary.',
  },
  estates: {
    keywords: ['facility', 'service charge', 'maintenance', 'residents'],
    comingSoon: 'Manage handed-over estates: service charge, utilities and maintenance.',
  },
  sales: {
    keywords: ['leads', 'buyers', 'units', 'subscriptions', 'payment plans', 'commissions', 'crm'],
    comingSoon: 'Sell off-plan: leads, units, subscriptions, payment plans and commissions.',
  },
  finance: {
    keywords: ['receipts', 'ledger', 'fx', 'tax', 'vat', 'wht', 'banks'],
    comingSoon: 'Receipts, ledgers per company, FX, construction finance and tax.',
  },
  hr: {
    keywords: ['staff', 'payroll', 'paye', 'pension', 'nhf', 'leave'],
    comingSoon: 'Staff, site workers and payroll with PAYE, pension and NHF.',
  },
  compliance: {
    keywords: ['permits', 'kyc', 'aml', 'ubo', 'scuml'],
    comingSoon: 'Permits, buyer KYC, AML reviews and the UBO register.',
  },
  documents: {
    keywords: ['contracts', 'letters', 'templates', 'e-signature', 'offer', 'allocation'],
    comingSoon: 'Contracts and letters from templates, with approvals and e-signature.',
  },
  reports: {
    keywords: ['analytics', 'dashboards', 'board pack', 'returns'],
    comingSoon: 'Dashboards, project returns and board packs.',
  },
  settings: {
    keywords: [
      'team',
      'members',
      'roles',
      'permissions',
      'companies',
      'entities',
      'organization',
      'security',
      'approval rules',
      'audit log',
    ],
    comingSoon: 'Your team, roles and permissions, companies and your own security.',
  },
  help: {
    keywords: ['support', 'guides', 'how to', 'help centre'],
    comingSoon: 'Short guides for each task, written for your role. They arrive with each module.',
  },
}
