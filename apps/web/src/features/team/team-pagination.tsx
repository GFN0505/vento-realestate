import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = { page: number; pageSize: number; total: number; onPage: (page: number) => void }

/** "51–100 of 120" with Previous and Next; nothing when everything fits on one page. */
export function TeamPagination({ page, pageSize, total, onPage }: Props) {
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground tabular-nums">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="max-md:h-11"
        >
          <ChevronLeftIcon aria-hidden />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={to >= total}
          onClick={() => onPage(page + 1)}
          className="max-md:h-11"
        >
          Next
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
