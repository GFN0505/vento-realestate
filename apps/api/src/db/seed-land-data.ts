import type {
  NigerianState,
  ParcelStatus,
  TitleDocumentType,
  TitleStageStatus,
  TitleStageType,
} from '@vento/shared'

// The six golden-thread parcels (plan §9, LandTitle board): 45.00 ha in all. Days are counted
// back from the run date. The plan's "Vento Homes Ltd" parcels sit under the seed's holding
// company, Victoria Gardens Dev. Ltd: in the fictional world Vento Homes Ltd is the
// organization, not one of its companies (DESIGN-NOTES "Fictional world").

export type ParcelSeed = {
  reference: number
  name: string
  company: 'victoria' | 'parkview' | 'lekki'
  state: NigerianState
  lga: string
  area: string
  sizeHa: string
  status: ParcelStatus
  acquiredOn?: string
  cost?: string
  seller?: string
  /** When Ngozi added it, in days before the run. */
  addedDaysAgo: number
  stages: {
    type: TitleStageType
    status: TitleStageStatus
    daysAgo?: number
    note?: string
    followUpDaysAgo?: number
    reference?: string
    issuedBy?: string
  }[]
  documents: { type: TitleDocumentType; name?: string; kind?: 'pdf' | 'png'; number?: string }[]
}

const LAGOS_LANDS = 'Lagos State Lands Bureau'

export const LAND_PARCELS: readonly ParcelSeed[] = [
  {
    reference: 7,
    name: 'Admiralty Way plot',
    company: 'victoria',
    state: 'Lagos',
    lga: 'Eti-Osa',
    area: 'Lekki Phase 1',
    sizeHa: '0.90',
    status: 'titled',
    acquiredOn: '2023-06-12',
    cost: '310000000.00',
    addedDaysAgo: 620,
    stages: [
      {
        type: 'survey_plan',
        status: 'granted',
        daysAgo: 600,
        issuedBy: 'Office of the Surveyor-General, Lagos',
      },
      {
        type: 'excision_gazette',
        status: 'granted',
        daysAgo: 560,
        issuedBy: 'Lagos State Government',
      },
      {
        type: 'c_of_o',
        status: 'granted',
        daysAgo: 430,
        reference: 'LND/CO/2025/0118',
        issuedBy: LAGOS_LANDS,
      },
    ],
    documents: [
      { type: 'survey_plan' },
      { type: 'excision_gazette' },
      { type: 'c_of_o', number: 'LND/CO/2025/0118' },
    ],
  },
  {
    reference: 9,
    name: 'Victoria Gardens tract',
    company: 'victoria',
    state: 'Lagos',
    lga: 'Eti-Osa',
    area: 'Ajah',
    sizeHa: '6.80',
    status: 'titled',
    acquiredOn: '2024-02-20',
    cost: '1950000000.00',
    addedDaysAgo: 540,
    stages: [
      {
        type: 'survey_plan',
        status: 'granted',
        daysAgo: 520,
        issuedBy: 'Office of the Surveyor-General, Lagos',
      },
      {
        type: 'excision_gazette',
        status: 'granted',
        daysAgo: 470,
        issuedBy: 'Lagos State Government',
      },
      {
        type: 'c_of_o',
        status: 'granted',
        daysAgo: 300,
        reference: 'LND/CO/2025/0907',
        issuedBy: LAGOS_LANDS,
      },
    ],
    documents: [
      { type: 'survey_plan', kind: 'png' },
      { type: 'excision_gazette' },
      { type: 'c_of_o', number: 'LND/CO/2025/0907' },
    ],
  },
  {
    reference: 12,
    name: 'Plot 22, Folu Ayo',
    company: 'lekki',
    state: 'Lagos',
    lga: 'Ibeju-Lekki',
    area: 'Ibeju-Lekki',
    sizeHa: '4.20',
    status: 'acquired',
    acquiredOn: '2025-03-14',
    cost: '840000000.00',
    seller: 'Adeyemi family',
    addedDaysAgo: 250,
    stages: [
      {
        type: 'survey_plan',
        status: 'granted',
        daysAgo: 240,
        issuedBy: 'Office of the Surveyor-General, Lagos',
      },
      {
        type: 'excision_gazette',
        status: 'granted',
        daysAgo: 120,
        issuedBy: 'Lagos State Government',
      },
      { type: 'c_of_o', status: 'in_progress', daysAgo: 30 },
      { type: 'governors_consent', status: 'not_started' },
    ],
    // The gazette's document too: a granted stage always has its evidence in the vault.
    documents: [
      { type: 'family_receipt', kind: 'png' },
      { type: 'survey_plan' },
      { type: 'excision_gazette' },
    ],
  },
  {
    reference: 15,
    name: 'Parkview Block B',
    company: 'parkview',
    state: 'Lagos',
    lga: 'Kosofe',
    area: 'Gbagada',
    sizeHa: '1.10',
    status: 'acquired',
    acquiredOn: '2024-08-01',
    cost: '420000000.00',
    addedDaysAgo: 330,
    stages: [
      { type: 'survey_plan', status: 'granted', daysAgo: 320 },
      { type: 'excision_gazette', status: 'granted', daysAgo: 200 },
      {
        type: 'c_of_o',
        status: 'submitted',
        daysAgo: 40,
        followUpDaysAgo: 1,
        reference: 'LSLB/CO/2026/2231',
        issuedBy: LAGOS_LANDS,
      },
    ],
    documents: [{ type: 'survey_plan' }, { type: 'excision_gazette' }],
  },
  {
    reference: 18,
    name: 'Idu family land',
    company: 'victoria',
    state: 'FCT',
    lga: 'Abuja Municipal',
    area: 'Idu',
    sizeHa: '12.00',
    status: 'acquired',
    acquiredOn: '2025-07-01',
    cost: '2100000000.00',
    seller: 'Idu family',
    addedDaysAgo: 150,
    stages: [
      { type: 'survey_plan', status: 'granted', daysAgo: 140, issuedBy: 'FCT Surveyor-General' },
      {
        type: 'r_of_o',
        status: 'queried',
        daysAgo: 25,
        note: "Registry asked for the family's consent letter",
        reference: 'AGIS/RO/2026/0457',
        issuedBy: 'AGIS',
      },
      { type: 'c_of_o', status: 'in_progress', daysAgo: 94 },
    ],
    documents: [{ type: 'survey_plan' }, { type: 'other', name: 'Query letter', kind: 'png' }],
  },
  {
    reference: 21,
    name: 'Epe farmland',
    company: 'victoria',
    state: 'Lagos',
    lga: 'Epe',
    area: 'Epe',
    sizeHa: '20.00',
    status: 'prospect',
    addedDaysAgo: 12,
    stages: [
      { type: 'survey_plan', status: 'not_started' },
      { type: 'excision_gazette', status: 'not_started' },
      { type: 'c_of_o', status: 'not_started' },
    ],
    documents: [],
  },
]
