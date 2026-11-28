import { requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { assertLinkAllowed, documentLink, listVersions } from './document-link.service'
import { removeVersion, restoreVersion, uploadDocument } from './documents.service'
import { parcelActivity } from './land-activity.service'
import { landHome } from './land-home.service'
import { archiveParcel, restoreParcel, updateParcel } from './parcel-changes.service'
import { createParcel } from './parcel-create.service'
import { getParcel, listParcels, parcelNameTaken } from './parcels.service'
import { setStages } from './stage-set.service'
import { undoStage, updateStage } from './title-stages.service'

// Land & title (plan §5). `member.land.*` carries the `land` feature gate (NOT_FOUND when it
// isn't available), then each procedure checks its permission. Company limits are the services'.
const view = requirePermission('land', 'view', 'see Land & title')

export const landRouter = {
  parcels: {
    list: member.land.parcels.list
      .use(view)
      .handler(({ context, input }) => listParcels(serviceContext(context), input)),
    get: member.land.parcels.get
      .use(view)
      .handler(({ context, input }) => getParcel(serviceContext(context), input.id)),
    nameTaken: member.land.parcels.nameTaken
      .use(view)
      .handler(({ context, input }) => parcelNameTaken(serviceContext(context), input)),
    create: member.land.parcels.create
      .use(requirePermission('land', 'create', 'add parcels'))
      .handler(({ context, input }) => createParcel(serviceContext(context), input)),
    update: member.land.parcels.update
      .use(requirePermission('land', 'edit', 'edit parcels'))
      .handler(({ context, input }) => updateParcel(serviceContext(context), input)),
    archive: member.land.parcels.archive
      .use(requirePermission('land', 'delete', 'archive parcels'))
      .handler(({ context, input }) => archiveParcel(serviceContext(context), input.id)),
    restore: member.land.parcels.restore
      .use(requirePermission('land', 'delete', 'restore parcels'))
      .handler(({ context, input }) => restoreParcel(serviceContext(context), input.id)),
    activity: member.land.parcels.activity
      .use(view)
      .handler(({ context, input }) => parcelActivity(serviceContext(context), input)),
  },
  stages: {
    update: member.land.stages.update
      .use(requirePermission('land', 'edit', 'update title stages'))
      .handler(({ context, input }) => updateStage(serviceContext(context), input)),
    undo: member.land.stages.undo
      .use(requirePermission('land', 'edit', 'update title stages'))
      .handler(({ context, input }) => undoStage(serviceContext(context), input)),
    set: member.land.stages.set
      .use(requirePermission('land', 'edit', 'edit title stages'))
      .handler(({ context, input }) => setStages(serviceContext(context), input)),
  },
  documents: {
    upload: member.land.documents.upload
      .use(requirePermission('land', 'create', 'upload title documents'))
      .handler(({ context, input }) => uploadDocument(serviceContext(context), input)),
    versions: member.land.documents.versions
      .use(view)
      .handler(({ context, input }) => listVersions(serviceContext(context), input.documentId)),
    removeVersion: member.land.documents.removeVersion
      .use(requirePermission('land', 'delete', 'remove title documents'))
      .handler(({ context, input }) => removeVersion(serviceContext(context), input)),
    restoreVersion: member.land.documents.restoreVersion
      .use(requirePermission('land', 'delete', 'restore title documents'))
      .handler(({ context, input }) => restoreVersion(serviceContext(context), input.versionId)),
    link: member.land.documents.link.use(view).handler(({ context, input }) => {
      const ctx = serviceContext(context)
      assertLinkAllowed(context.rateLimiter, ctx)
      return documentLink(ctx, input)
    }),
  },
  home: member.land.home
    .use(view)
    .handler(({ context, input }) => landHome(serviceContext(context), input)),
}
