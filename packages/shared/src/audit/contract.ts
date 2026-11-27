import { z } from 'zod'
import { platform } from '../common/errors'
import { id } from '../common/schemas'
import {
  auditDetail,
  auditFilters,
  auditPeopleInput,
  auditPeopleOutput,
  listAuditInput,
  listAuditOutput,
} from './schema'

// Settings edit plus all-company access (spec open question 1). Platform: in every plan.
export const auditContract = {
  /** Newest first, always inside a date range of at most a year. */
  list: platform.input(listAuditInput).output(listAuditOutput),
  get: platform.input(z.strictObject({ id })).output(auditDetail),
  /** The Person filter: who acted in these dates, members and removed members only. */
  people: platform.input(auditPeopleInput).output(auditPeopleOutput),
  /** The filtered rows as CSV, up to 50,000 (CONFLICT `too_many_rows`). Itself audited. */
  export: platform.input(auditFilters).output(z.file()),
}
