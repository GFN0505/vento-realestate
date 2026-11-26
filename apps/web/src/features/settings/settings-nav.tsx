import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import type { SettingsSection } from './sections'

/**
 * SettingsNav (boards SetOrg, DSAdditions "Settings navigation"): a card in the left column with
 * a quiet "Settings" label and one row per section the member can open. Sticky under the top bar.
 * My security, the person's own page, sits after a divider so the organization's sections stay
 * together.
 */
export function SettingsNav({ sections }: { sections: readonly SettingsSection[] }) {
  return (
    <nav
      aria-label="Settings"
      className="sticky top-[calc(var(--topbar-height)+1.75rem)] flex flex-col gap-0.5 rounded-[10px] border bg-card px-2 py-3"
    >
      <span className="px-3 pt-1 pb-2 font-bold text-[11px] text-muted-foreground uppercase tracking-[0.05em]">
        Settings
      </span>
      {sections.map((section, index) => (
        <Fragment key={section.key}>
          {index > 0 && section.group !== sections[index - 1]?.group && (
            <hr aria-hidden className="mx-3 my-2 border-border" />
          )}
          <Link
            to={section.to}
            preload="intent"
            activeOptions={{ includeSearch: false }}
            className="rounded-lg px-3 py-2 font-medium text-[13px] text-foreground outline-hidden transition-colors hover:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring data-[status=active]:bg-selected data-[status=active]:font-semibold data-[status=active]:text-selected-foreground"
          >
            {section.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  )
}
