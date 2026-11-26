import { EyeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearPreview } from '@/features/preview/preview-role'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'

/** Stays above the top bar while previewing, so nobody forgets (spec departure: banner). */
export function PreviewBanner() {
  const { previewing } = useEffectiveAccess()
  if (!previewing) return null
  return (
    <div
      role="status"
      className="flex min-h-11 items-center gap-3 bg-selected px-4 py-1.5 text-[13px] text-selected-foreground lg:px-6"
    >
      <EyeIcon aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Previewing as {previewing.name}.</span>{' '}
        <span className="max-sm:hidden">You still have your own access.</span>
      </p>
      <Button size="sm" variant="outline" className="max-md:h-9" onClick={clearPreview}>
        Stop preview
      </Button>
    </div>
  )
}
