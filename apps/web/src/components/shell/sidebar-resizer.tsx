import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import {
  previewSidebarWidth,
  SIDEBAR_WIDTH,
  setSidebarCollapsed,
  setSidebarWidth,
  storedSidebarWidth,
  useSidebarCollapsed,
  widthFromDrag,
  widthFromKey,
} from '@/lib/theme'

/**
 * The sidebar's right edge (desktop). Drag between 220 and 320px; below 180 it snaps to icons
 * and drags back out again. Double-click resets to 256. Keyboard: arrows (Shift for bigger
 * steps), Home and End. While dragging only a CSS variable changes, once per frame.
 */
export function SidebarResizer() {
  const collapsed = useSidebarCollapsed()
  const [width, setWidth] = useState(storedSidebarWidth)
  const drag = useRef<{ frame: number; latest: number; collapsed: boolean } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    document.documentElement.setAttribute('data-sidebar-resizing', '')
    drag.current = { frame: 0, latest: event.clientX, collapsed }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state) return
    state.latest = event.clientX
    if (state.frame) return
    state.frame = requestAnimationFrame(() => {
      state.frame = 0
      const next = widthFromDrag(state.latest)
      if (next.collapsed !== state.collapsed) {
        state.collapsed = next.collapsed
        setSidebarCollapsed(next.collapsed)
      }
      if (!next.collapsed) previewSidebarWidth(next.width)
    })
  }

  function onPointerUp() {
    const state = drag.current
    if (!state) return
    cancelAnimationFrame(state.frame)
    drag.current = null
    document.documentElement.removeAttribute('data-sidebar-resizing')
    const next = widthFromDrag(state.latest)
    setSidebarCollapsed(next.collapsed)
    if (!next.collapsed) {
      setSidebarWidth(next.width)
      setWidth(next.width)
    }
  }

  function commit(next: number) {
    if (collapsed) setSidebarCollapsed(false)
    setSidebarWidth(next)
    setWidth(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Enter and Escape keep the width as it is; nothing to undo.
    if (event.key === 'Enter' || event.key === 'Escape') return
    // Collapsed, only growing keys open it again; the Collapse button and [ collapse.
    if (collapsed && event.key !== 'ArrowRight' && event.key !== 'End') return
    const next = widthFromKey(collapsed ? SIDEBAR_WIDTH.min - 16 : width, event.key, event.shiftKey)
    if (next === null) return
    event.preventDefault()
    commit(next)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable window splitter; <hr> can't take focus or keys
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuenow={collapsed ? SIDEBAR_WIDTH.min : width}
      aria-valuetext={collapsed ? 'Collapsed' : `${width} pixels`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => commit(SIDEBAR_WIDTH.default)}
      onKeyDown={onKeyDown}
      // Another tab may have changed it.
      onFocus={() => setWidth(storedSidebarWidth())}
      title="Drag to resize. Double-click to reset."
      className="group/resize fixed inset-y-0 left-[calc(var(--sidebar-width)-4px)] z-50 w-2 cursor-col-resize touch-none outline-none max-lg:hidden"
    >
      {/* The hairline: invisible at rest, brand on hover, drag or keyboard focus. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-[3px] w-0.5 bg-transparent transition-colors duration-150 group-hover/resize:bg-brand group-focus-visible/resize:left-0.5 group-focus-visible/resize:w-1 group-focus-visible/resize:bg-ring in-data-sidebar-resizing:bg-brand motion-reduce:transition-none"
      />
    </div>
  )
}
