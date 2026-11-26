import { z } from 'zod'
import { platform } from '../common/errors'
import { id } from '../common/schemas'
import {
  createOrganizationInput,
  entity,
  entityArchivePreview,
  entityInput,
  listEntitiesInput,
  listEntitiesOutput,
  organization,
  updateEntityInput,
  updateOrganizationInput,
} from './schema'

const byId = z.strictObject({ id })

export const onboardingContract = {
  /** Step 1: creates the organization with the caller as its owner. */
  createOrganization: platform.input(createOrganizationInput).output(organization),
  /** Step 2: the first entity. Refused once the organization has one. */
  createFirstEntity: platform.input(entityInput).output(entity),
}

export const organizationContract = {
  get: platform.output(organization),
  update: platform.input(updateOrganizationInput).output(organization),
}

export const entitiesContract = {
  /** Within the viewer's company access; counts for the Active and Archived chips. */
  list: platform.input(listEntitiesInput).output(listEntitiesOutput),
  get: platform.input(byId).output(entity),
  create: platform.input(entityInput).output(entity),
  update: platform.input(updateEntityInput).output(entity),
  archivePreview: platform.input(byId).output(entityArchivePreview),
  archive: platform.input(byId).output(entity),
  /** Back to active, within the plan's company limit. Also Undo after archive. */
  restore: platform.input(byId).output(entity),
}
