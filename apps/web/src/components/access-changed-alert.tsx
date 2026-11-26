import { CircleAlertIcon, RotateCcwIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { apiErrorMessage, isAccessChanged, isHandledElsewhere } from '@/lib/api-errors'
import { reloadPage } from '@/lib/reload'

/**
 * Why a form's save didn't go through, above its buttons. When the person's own access changed
 * mid-action it says so calmly and offers Reload; what they typed stays until they choose.
 */
export function SaveErrorAlert({ error }: { error: unknown }) {
  if (!error || isHandledElsewhere(error)) return null
  if (isAccessChanged(error)) return <AccessChangedAlert message={apiErrorMessage(error)} />
  return (
    <Alert variant="destructive" aria-live="polite">
      <CircleAlertIcon aria-hidden />
      <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
    </Alert>
  )
}

export function AccessChangedAlert({ message }: { message: string }) {
  return (
    <Alert variant="info" aria-live="polite">
      <RotateCcwIcon aria-hidden />
      <AlertDescription className="gap-2.5">
        <p>{message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reloadPage}
          className="w-fit max-md:h-11"
        >
          Reload
        </Button>
      </AlertDescription>
    </Alert>
  )
}
