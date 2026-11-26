import type { PermissionModule } from '@vento/shared'

/** The role can't view this module. The shell's error boundary shows the 403 page. */
export class ModuleForbiddenError extends Error {
  readonly module: PermissionModule
  constructor(module: PermissionModule) {
    super(`No view access to ${module}`)
    this.name = 'ModuleForbiddenError'
    this.module = module
  }
}
