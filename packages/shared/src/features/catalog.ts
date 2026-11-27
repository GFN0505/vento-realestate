// The feature catalog (docs/specs/feature-flags.md). Code, not data: stages, plans, add-ons and
// overrides are data in the database. No zod here, so the web can import it without the schemas.

export const RELEASE_STAGES = ['off', 'internal', 'pilot', 'on'] as const
export type ReleaseStage = (typeof RELEASE_STAGES)[number]

export const RELEASE_GROUPS = ['standard', 'pilot', 'internal'] as const
export type ReleaseGroup = (typeof RELEASE_GROUPS)[number]

/** Plan limits. Counts, except `ai_budget` (NGN a month). A missing limit means unlimited. */
export const LIMIT_KEYS = ['projects', 'entities', 'members', 'ai_budget'] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

/** Limits that count records, checked when something is created. */
export const COUNT_LIMIT_KEYS = ['projects', 'entities', 'members'] as const
export type CountLimitKey = (typeof COUNT_LIMIT_KEYS)[number]

export type FeatureKind = 'module' | 'feature' | 'add_on'

export const ADD_ONS = {
  ai: { label: 'AI', limit: 'ai_budget' },
} as const satisfies Record<string, { label: string; limit: LimitKey }>
export type AddOnKey = keyof typeof ADD_ONS
export const ADD_ON_KEYS = Object.keys(ADD_ONS) as AddOnKey[]

type Def = {
  kind: FeatureKind
  /** Used in hints and command output: "Commissions · Available on Growth". */
  label: string
  /** Every one must also be available. One level is enough; prerequisites chain. */
  requires: readonly string[]
  /** In every plan, never priced (security, compliance). May still have a release flag. */
  core?: true
  /** Sold as part of this add-on, not in plans. */
  addOn?: AddOnKey
}

const mod = (label: string, requires: readonly string[] = [], core?: true): Def =>
  core ? { kind: 'module', label, requires, core } : { kind: 'module', label, requires }
const feature = (label: string, requires: readonly string[] = [], core?: true): Def =>
  core ? { kind: 'feature', label, requires, core } : { kind: 'feature', label, requires }
const ai = (label: string, requires: readonly string[] = []): Def => ({
  kind: 'add_on',
  label,
  requires,
  addOn: 'ai',
})

export const FEATURES = {
  // Modules
  land: mod('Land & title'),
  projects: mod('Projects'),
  sales: mod('Sales', ['projects']),
  finance: mod('Finance'),
  compliance: mod('Compliance', [], true),
  documents: mod('Documents'),
  analytics: mod('Reports'),
  buyer_portal: mod('Buyer portal', ['sales', 'finance']),
  facility: mod('Estates'),
  hr: mod('HR & payroll'),
  realtor_portal: mod('Realtor portal', ['sales.leads', 'sales.commissions']),

  // Platform features
  'platform.import': feature('Excel import'),
  'platform.whatsapp': feature('WhatsApp messages'),
  'platform.sms': feature('SMS messages'),
  'platform.digest': feature('Daily digest'),
  'platform.ekyc': feature('Identity checks (e-KYC)'),
  'platform.passkeys': feature('Passkeys', [], true),

  // Finance
  'finance.paystack': feature('Paystack payments', ['finance']),
  'finance.bank_import': feature('Bank statement import', ['finance']),
  'finance.vendor_bills': feature('Vendor bills', ['finance']),
  'finance.close': feature('Period close', ['finance']),
  'finance.facilities': feature('Construction finance', ['finance']),
  'finance.revenue_recognition': feature('Revenue recognition (IFRS 15)', ['finance']),
  'finance.intercompany': feature('Intercompany', ['finance']),
  'finance.tax': feature('Tax summary', ['finance']),

  // Projects and site work
  'projects.costs': feature('BoQ and budget', ['projects']),
  'projects.procurement': feature('Procurement', ['projects']),
  'projects.site_diary': feature('Site diary', ['projects']),

  // Sales
  'sales.leads': feature('Leads', ['sales']),
  'sales.commissions': feature('Commissions', ['sales']),
  'sales.site_plan': feature('Estate layout', ['sales']),
  'sales.transfer': feature('Unit transfer', ['sales']),
  'sales.construction_linked_plans': feature('Construction-linked plans', ['sales']),

  // Compliance (core: KYC and AML are a legal duty)
  'compliance.permits': feature('Permits', ['compliance'], true),
  'compliance.ubo_scuml': feature('UBO and SCUML records', ['compliance'], true),

  // Documents and reports
  'documents.contracts': feature('Contracts and e-signature', ['documents']),
  'analytics.board_pack': feature('Board pack', ['analytics']),

  // AI add-on. Prerequisites beyond the spec's example are placeholders until the AI spec.
  'ai.document_extraction': ai('Document reading'),
  'ai.payment_matching': ai('Payment matching', ['finance.bank_import']),
  'ai.ask': ai('Ask'),
  'ai.drafting': ai('Drafting', ['documents']),
  'ai.site_diary_voice': ai('Voice site diary', ['projects.site_diary']),
  'ai.predictions': ai('Predictions'),
  'ai.anomaly_detection': ai('Unusual activity alerts'),
} as const satisfies Record<string, Def>

export type FeatureKey = keyof typeof FEATURES
export type FeatureDef = Def

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[]

export function isFeatureKey(value: string): value is FeatureKey {
  return Object.hasOwn(FEATURES, value)
}

export function isLimitKey(value: string): value is LimitKey {
  return (LIMIT_KEYS as readonly string[]).includes(value)
}

export function isAddOnKey(value: string): value is AddOnKey {
  return Object.hasOwn(ADD_ONS, value)
}

export function featureDef(key: FeatureKey): FeatureDef {
  return FEATURES[key]
}

export function featureLabel(key: FeatureKey): string {
  return FEATURES[key].label
}

export function isCoreFeature(key: FeatureKey): boolean {
  return (FEATURES[key] as Def).core === true
}

export function addOnOf(key: FeatureKey): AddOnKey | undefined {
  return (FEATURES[key] as Def).addOn
}

export function prerequisitesOf(key: FeatureKey): readonly FeatureKey[] {
  return FEATURES[key].requires as readonly FeatureKey[]
}

/** The features an add-on includes, in catalog order. */
export function featuresOfAddOn(addOn: AddOnKey): FeatureKey[] {
  return FEATURE_KEYS.filter((k) => addOnOf(k) === addOn)
}

/** Features a plan may list: not core (always included) and not sold as an add-on. */
export function isPlanFeature(key: FeatureKey): boolean {
  return !isCoreFeature(key) && addOnOf(key) === undefined
}
