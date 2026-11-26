import type { Entity } from '@vento/shared'
import { ArchiveIcon } from 'lucide-react'
import { VatCell } from '@/features/companies/companies-table'
import { companyTypeLabel, NOT_ADDED } from '@/features/companies/company-rights'
import { formatDate } from '@/lib/format'

/** A company as read-only facts: archived, or for someone who can't change it. */
export function CompanyFacts({ company }: { company: Entity }) {
  const archived = company.status === 'archived'
  return (
    <>
      {archived && (
        <p className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3.5 py-3 text-[13px]">
          <ArchiveIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span>
            Archived{company.archivedAt ? ` ${formatDate(company.archivedAt)}` : ''}
            {company.archivedByName ? ` by ${company.archivedByName}` : ''}
          </span>
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-3 text-[13px]">
        <dt className="text-muted-foreground">Type</dt>
        <dd>{companyTypeLabel(company.type)}</dd>
        <dt className="text-muted-foreground">RC number</dt>
        <dd className="tabular-nums">{company.rcNumber ?? <Missing />}</dd>
        <dt className="text-muted-foreground">TIN</dt>
        <dd className="tabular-nums">{company.tin ?? <Missing />}</dd>
        <dt className="text-muted-foreground">VAT</dt>
        <dd>
          <VatCell registered={company.vatRegistered} />
        </dd>
        <dt className="text-muted-foreground">Books kept in</dt>
        <dd>NGN · ₦</dd>
      </dl>
    </>
  )
}

function Missing() {
  return <span className="text-muted-foreground">{NOT_ADDED}</span>
}
