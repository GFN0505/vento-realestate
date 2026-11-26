/** The role New role just made, so its page can select the name once for retyping. */
let justCreated: string | null = null

export function markJustCreated(roleId: string): void {
  justCreated = roleId
}

export function takeJustCreated(roleId: string): boolean {
  if (justCreated !== roleId) return false
  justCreated = null
  return true
}
