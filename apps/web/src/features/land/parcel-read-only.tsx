import type { ParcelDetail } from '@vento/shared'
import { ArchiveIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { readOnlyText } from './land-words'

/**
 * Why nothing on a parcel can change (spec): it's archived, or its company is. Shown on the
 * parcel page and in Edit parcel; null when the parcel can change.
 */
export function ParcelReadOnlyBanner({
  parcel,
  className,
}: {
  parcel: Pick<ParcelDetail, 'readOnly' | 'entity'>
  className?: string
}) {
  if (!parcel.readOnly) return null
  return (
    <Alert className={cn('bg-muted/40', className)}>
      <ArchiveIcon aria-hidden />
      <AlertDescription>{readOnlyText(parcel.readOnly, parcel.entity.name)}</AlertDescription>
    </Alert>
  )
}
