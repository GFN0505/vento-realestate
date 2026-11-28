import { z } from 'zod'
import { forFeature } from '../common/errors'
import { id, paginated } from '../common/schemas'
import {
  recordEncumbranceInput,
  requestClearInput,
  requestClearOutput,
  updateEncumbranceInput,
} from './encumbrance-schema'
import {
  createParcelInput,
  documentLinkInput,
  documentLinkOutput,
  documentOutput,
  documentVersion,
  documentVersionsInput,
  landBlockers,
  landBlockersInput,
  landHome,
  landHomeInput,
  listParcelsInput,
  listParcelsOutput,
  parcelActivityInput,
  parcelDetail,
  parcelNameTakenInput,
  parcelRow,
  removeVersionInput,
  setStagesInput,
  timelineEvent,
  undoStageInput,
  updateParcelInput,
  updateStageInput,
  uploadDocumentInput,
  uploadDocumentOutput,
  versionIdInput,
} from './schema'

// Land & title (spec slice 1). Every procedure is gated on `land` (unavailable → NOT_FOUND), then
// checks its permission. A parcel outside the viewer's companies is NOT_FOUND, never FORBIDDEN.
const land = forFeature('land')
const byId = z.strictObject({ id })

export const parcelsContract = {
  /** land.view. Within the viewer's companies ∩ `entityId`. */
  list: land.input(listParcelsInput).output(listParcelsOutput),
  /** land.view. NOT_FOUND outside the viewer's companies. */
  get: land.input(byId).output(parcelDetail),
  /** land.view. An active parcel with this name (any case) in the viewer's companies, for the hint. */
  nameTaken: land.input(parcelNameTakenInput).output(z.object({ id, name: z.string() }).nullable()),
  /**
   * land.create. BAD_REQUEST `future_date`, `file_unavailable`; NOT_FOUND for a company outside
   * access; CONFLICT `entity_archived`.
   */
  create: land.input(createParcelInput).output(parcelDetail),
  /**
   * land.edit. CONFLICT `stale` (changedByName), `parcel_archived`, `entity_archived`; BAD_REQUEST
   * `lga_not_in_state`, `future_date`; NOT_FOUND when either company is outside access.
   */
  update: land.input(updateParcelInput).output(parcelDetail),
  /**
   * land.delete. Leaves the list; reachable read-only by link. Also Undo after restore. CONFLICT
   * `encumbered` while an encumbrance is active ("Clear the caveat before archiving this parcel.").
   */
  archive: land.input(byId).output(parcelRow),
  /** land.delete. Also Undo after archive. */
  restore: land.input(byId).output(parcelRow),
  /** land.view. The parcel's audit trail, newest first, in plain words. */
  activity: land.input(parcelActivityInput).output(paginated(timelineEvent)),
}

export const stagesContract = {
  /**
   * land.edit (attachments: land.create too). BAD_REQUEST `granted_needs_document`,
   * `note_required`, `future_date`, `file_unavailable`; CONFLICT `stale` (changedByName),
   * `parcel_archived`, `entity_archived`.
   */
  update: land.input(updateStageInput).output(parcelDetail),
  /** land.edit. The caller's own last update within 2 minutes; CONFLICT `undo_expired`, `stale`. */
  undo: land.input(undoStageInput).output(parcelDetail),
  /** land.edit. CONFLICT `stage_started`, `stale`, `parcel_archived`, `entity_archived`. */
  set: land.input(setStagesInput).output(parcelDetail),
}

export const documentsContract = {
  /**
   * land.create. A same-type (or same-name) file becomes the next version. BAD_REQUEST
   * `file_unavailable`, `future_date`, `evidence_from_encumbrance` (a new encumbrance evidence
   * document: those come from the encumbrance sheets); CONFLICT `parcel_archived`,
   * `entity_archived`.
   */
  upload: land.input(uploadDocumentInput).output(uploadDocumentOutput),
  /** land.view. Newest first, removed ones included and flagged. */
  versions: land.input(documentVersionsInput).output(z.array(documentVersion)),
  /**
   * land.delete. CONFLICT `evidence_for_granted`, `evidence_for_encumbrance`, `parcel_archived`,
   * `entity_archived`.
   */
  removeVersion: land.input(removeVersionInput).output(documentOutput),
  /** land.delete. Undo of a remove. */
  restoreVersion: land.input(versionIdInput).output(documentOutput),
  /**
   * land.view. A 5-minute link (decision 0025), audited. A mutation on the web, never cached.
   */
  link: land.input(documentLinkInput).output(documentLinkOutput),
}

export const encumbrancesContract = {
  /**
   * land.create. Saved active; a blocking one blocks sales in the same transaction; owners are
   * emailed after commit. BAD_REQUEST `future_date`, `file_unavailable`; CONFLICT
   * `parcel_archived`, `entity_archived`.
   */
  record: land.input(recordEncumbranceInput).output(parcelDetail),
  /**
   * land.edit. Details only. CONFLICT `stale` (changedByName), `clearing_pending`,
   * `encumbrance_cleared`, `parcel_archived`, `entity_archived`; BAD_REQUEST `future_date`.
   */
  update: land.input(updateEncumbranceInput).output(parcelDetail),
  /**
   * land.edit and land.create (the evidence upload). Files the clearance evidence, then asks for
   * approval (*Clear an encumbrance*); nothing unblocks until the last approval. BAD_REQUEST
   * `future_date`, `cleared_before_served`, `reason_required`, `file_unavailable`; CONFLICT
   * `approval_pending` (requestId), `no_approver`, `no_rule`, `stale`, `encumbrance_cleared`,
   * `parcel_archived`, `entity_archived`.
   */
  requestClear: land.input(requestClearInput).output(requestClearOutput),
}

export const landContract = {
  parcels: parcelsContract,
  stages: stagesContract,
  documents: documentsContract,
  encumbrances: encumbrancesContract,
  /** land.view. The Land & legal home: tiles, panels and queue, within the company filter. */
  home: land.input(landHomeInput).output(landHome),
  /** land.view. Blocked parcels for the executive home's *Needs attention*, oldest first. */
  blockers: land.input(landBlockersInput).output(landBlockers),
}
