import { z } from 'zod'
import { base } from '../common/errors'
import { id, paginated } from '../common/schemas'
import {
  createOrganizationInput,
  entity,
  entityArchivePreview,
  entityInput,
  listEntitiesInput,
  organization,
  updateEntityInput,
  updateOrganizationInput,
} from './schema'

const byId = z.strictObject({ id })

export const onboardingContract = {
  /** Step 1: creates the organization with the caller as its owner. */
  createOrganization: base.input(createOrganizationInput).output(organization),
  /** Step 2: the first entity. Refused once the organization has one. */
  createFirstEntity: base.input(entityInput).output(entity),
}

export const organizationContract = {
  get: base.output(organization),
  update: base.input(updateOrganizationInput).output(organization),
}

export const entitiesContract = {
  list: base.input(listEntitiesInput).output(paginated(entity)),
  get: base.input(byId).output(entity),
  create: base.input(entityInput).output(entity),
  update: base.input(updateEntityInput).output(entity),
  archivePreview: base.input(byId).output(entityArchivePreview),
  archive: base.input(byId).output(entity),
}
