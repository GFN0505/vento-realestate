import type { Entity } from '@vento/shared'
import { ChevronRightIcon } from 'lucide-react'
import { companyTypeLabel, NOT_ADDED } from './company-rights'

type Props = { rows: readonly Entity[]; onOpen: (company: Entity) => void }

/**
 * Phones (below 768px): one card per company (name, type, then RC · TIN · VAT on one line). A tap
 * opens the sheet full height; Archive and Restore live at its foot.
 */
export function CompaniesCards({ rows, onOpen }: Props) {
  return (
    <ul aria-label="Companies" className="flex flex-col gap-2">
      {rows.map((company) => (
        <li key={company.id}>
          <button
            type="button"
            data-company-row={company.id}
            onClick={() => onOpen(company)}
            className="flex min-h-[72px] w-full items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 text-left outline-none transition-colors active:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-semibold text-[14px]">{company.name}</span>
              <span className="truncate text-muted-foreground text-xs">
                {companyTypeLabel(company.type)}
              </span>
              <span className="truncate text-muted-foreground text-xs tabular-nums">
                {company.rcNumber ?? `RC ${NOT_ADDED.toLowerCase()}`} ·{' '}
                {company.tin ? `TIN ${company.tin}` : `TIN ${NOT_ADDED.toLowerCase()}`} ·{' '}
                {company.vatRegistered ? (
                  <span className="font-medium text-status-emerald-fg">VAT registered</span>
                ) : (
                  'No VAT'
                )}
              </span>
            </span>
            <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  )
}
