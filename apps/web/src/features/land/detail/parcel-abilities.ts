import type { ParcelDetail } from '@vento/shared'

/**
 * What the viewer can do on this parcel, from the server's `can` and `readOnly` (the server
 * checks again on every call; this only decides what to show). Archived parcels and parcels
 * of an archived company are read-only; an archived parcel can still be restored.
 */
export function parcelAbilities(parcel: ParcelDetail) {
  const writable = parcel.readOnly === null
  const abilities = {
    writable,
    updateStage: writable && parcel.can.edit,
    editStages: writable && parcel.can.edit,
    editParcel: writable && parcel.can.edit,
    upload: writable && parcel.can.create,
    removeVersion: writable && parcel.can.delete,
    archive: writable && parcel.can.delete,
    // Restoring a parcel of an archived company would leave it read-only anyway.
    restore: parcel.readOnly === 'archived' && !parcel.entity.archived && parcel.can.delete,
  }
  return {
    ...abilities,
    menu: abilities.upload || abilities.editParcel || abilities.editStages || abilities.archive,
  }
}

export type ParcelAbilities = ReturnType<typeof parcelAbilities>
