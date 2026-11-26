/*
 * A reload the person asked for (Reload after "Your access has changed"). Pages with unsaved
 * changes skip the browser's leave prompt for it: they already chose to reload.
 */
let reloading = false

export function reloadPage(): void {
  reloading = true
  window.location.reload()
}

export function isReloading(): boolean {
  return reloading
}
