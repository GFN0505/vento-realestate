import type { Entity } from '@vento/shared'
import type { ReactNode } from 'react'
import { StatusBadge } from '@/components/status-badge'
import { companyTypeLabel, NOT_ADDED } from './company-rights'

const th =
  'h-10 px-3 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] first:pl-5'
const td = 'h-[60px] px-3 align-middle first:pl-5'
const INTERACTIVE = 'button, a, input, [role="menuitem"]'

type Props = {
  rows: readonly Entity[]
  onOpen: (company: Entity) => void
  /** The row's ⋯ menu. */
  menu: (company: Entity) => ReactNode
}

/**
 * Companies (board SetOrg, entities table, with the spec's columns). A plain table: tens of rows
 * at most, A–Z by name. A row opens the Company sheet; the name is its keyboard target.
 */
export function CompaniesTable({ rows, onOpen, menu }: Props) {
  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Companies</caption>
        <colgroup>
          <col className="w-2/5" />
          <col className="w-[19%]" />
          <col className="w-[19%]" />
          <col className="w-[22%] @3xl:w-[16%]" />
          <col className="w-12" />
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={th}>
              Company
            </th>
            <th scope="col" className={th}>
              RC number
            </th>
            <th scope="col" className={th}>
              TIN
            </th>
            <th scope="col" className={th}>
              VAT
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((company) => (
            <tr
              key={company.id}
              onClick={(event) => {
                const target = event.target as Element
                if (!event.currentTarget.contains(target) || target.closest(INTERACTIVE)) return
                onOpen(company)
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <td className={td}>
                <div className="flex min-w-0 flex-col">
                  <button
                    type="button"
                    data-company-row={company.id}
                    onClick={() => onOpen(company)}
                    className="truncate rounded-sm text-left font-semibold outline-none hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    title={company.name}
                  >
                    {company.name}
                  </button>
                  <span className="truncate text-muted-foreground text-xs">
                    {companyTypeLabel(company.type)}
                  </span>
                </div>
              </td>
              <td className={`${td} tabular-nums`}>
                <Code value={company.rcNumber} />
              </td>
              <td className={`${td} tabular-nums`}>
                <Code value={company.tin} />
              </td>
              <td className={td}>
                <VatCell registered={company.vatRegistered} />
              </td>
              <td className={`${td} pr-3 text-right`}>{menu(company)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Code({ value }: { value: string | null }) {
  return value ? (
    <span className="block truncate" title={value}>
      {value}
    </span>
  ) : (
    <span className="text-muted-foreground">{NOT_ADDED}</span>
  )
}

export function VatCell({ registered }: { registered: boolean }) {
  return registered ? (
    <StatusBadge tone="emerald">VAT registered</StatusBadge>
  ) : (
    <span className="text-muted-foreground">Not registered</span>
  )
}
