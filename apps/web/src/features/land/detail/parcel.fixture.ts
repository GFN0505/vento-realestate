import type { DocumentVersion, ParcelDetail, TitleDocument, TitleStage } from '@vento/shared'

/*
 * Test data for the parcel page's components: Plot 22, Folu Ayo (golden thread), with ids that
 * look real. Overrides replace whole fields.
 */

let n = 0
const nextId = () => `0193a1b2-c3d4-7e5f-8a9b-${String(++n).padStart(12, '0')}`

export function stageFixture(overrides: Partial<TitleStage> = {}): TitleStage {
  return {
    id: nextId(),
    type: 'c_of_o',
    status: 'not_started',
    statusOn: null,
    reference: null,
    issuedBy: null,
    note: null,
    followUpOn: null,
    version: 1,
    updatedAt: '2026-11-20T10:00:00.000Z',
    updatedBy: null,
    canUndo: false,
    ...overrides,
  }
}

export function versionFixture(overrides: Partial<DocumentVersion> = {}): DocumentVersion {
  return {
    id: nextId(),
    versionNo: 1,
    number: null,
    issuedOn: null,
    issuedBy: null,
    note: null,
    uploadedAt: '2026-11-02T09:00:00.000Z',
    uploadedBy: { name: 'Ngozi Adeyemi' },
    file: { name: 'scan.pdf', contentType: 'application/pdf', sizeBytes: 1_200_000 },
    removed: null,
    ...overrides,
  }
}

export function documentFixture(overrides: Partial<TitleDocument> = {}): TitleDocument {
  return {
    id: nextId(),
    type: 'survey_plan',
    name: null,
    stageType: 'survey_plan',
    latest: versionFixture(),
    earlierCount: 0,
    ...overrides,
  }
}

export function parcelFixture(overrides: Partial<ParcelDetail> = {}): ParcelDetail {
  const stages = overrides.stages ?? [
    stageFixture({ type: 'survey_plan', status: 'granted', statusOn: '2025-02-14' }),
    stageFixture({ type: 'excision_gazette', status: 'granted', statusOn: '2025-06-01' }),
    stageFixture({ type: 'c_of_o', status: 'submitted', statusOn: '2026-10-10', version: 3 }),
  ]
  return {
    id: nextId(),
    reference: 'P-0012',
    referenceNumber: 12,
    name: 'Plot 22, Folu Ayo',
    state: 'Lagos',
    lga: 'Ibeju-Lekki',
    area: 'Ibeju-Lekki',
    sizeSqm: '42000.00',
    sizeUnit: 'ha',
    sizeEntered: '4.2000',
    plotSizeSqm: null,
    status: 'acquired',
    entity: { id: nextId(), name: 'Lekki Pearl Estates Ltd', archived: false },
    archivedAt: null,
    currentStage: { type: 'c_of_o', status: 'submitted', statusOn: '2026-10-10' },
    stagesGranted: 2,
    stagesTotal: 3,
    acquisition: null,
    costHidden: false,
    updatedAt: '2026-11-20T10:00:00.000Z',
    seller: null,
    sellerHidden: false,
    notes: null,
    version: 4,
    stages,
    documents: [documentFixture()],
    suggestedIssuers: { c_of_o: 'Lands Bureau, Lagos' },
    can: { edit: true, create: true, delete: true },
    readOnly: null,
    ...overrides,
  }
}
