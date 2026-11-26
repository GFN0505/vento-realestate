import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { useMe } from '@/features/preview/use-effective-permissions'
import { usePageTitle } from '@/features/shell/use-page-title'
import type { SettingsSection } from './sections'

/**
 * Phones, with two or more sections (board SettingsMobile): one card per section. With a single
 * section `/settings` opens it directly instead, so this never shows a list of one.
 */
export function SettingsMobileList({ sections }: { sections: readonly SettingsSection[] }) {
  const me = useMe()
  usePageTitle('Settings', { module: 'settings' })
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Settings"
        description={`${me.organization?.name ?? ''} · ${me.member?.role.name ?? ''}`}
      />
      <ul className="flex flex-col gap-2.5">
        {sections.map((section, index) => (
          <li
            key={section.key}
            // My security, the person's own page, stands apart from the organization's sections.
            className={
              index > 0 && section.group !== sections[index - 1]?.group ? 'mt-3' : undefined
            }
          >
            <Link
              to={section.to}
              className="flex min-h-14 items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 outline-hidden active:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-semibold text-sm">{section.label}</span>
                <span className="text-muted-foreground text-xs">{section.summary}</span>
              </span>
              <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
