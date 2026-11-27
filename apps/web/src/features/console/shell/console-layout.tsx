import { Outlet } from '@tanstack/react-router'
import { ConsoleAccessGate } from '../access/console-access-gate'
import { ConsoleShell } from './console-shell'

/** `/console`: the console's frame, then the access gate, then the page. */
export function ConsoleLayout() {
  return (
    <ConsoleShell>
      <ConsoleAccessGate>
        <Outlet />
      </ConsoleAccessGate>
    </ConsoleShell>
  )
}
