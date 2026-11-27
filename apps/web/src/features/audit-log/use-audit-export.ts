import { useMutation } from '@tanstack/react-query'
import type { AuditFilters } from '@vento/shared'
import { toast } from 'sonner'
import { OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'

/** Hands a file to the browser's downloads. */
function download(file: Blob, name: string) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  // Some browsers start the download after the click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * **Export CSV**: the filtered rows, up to 50,000. Over that the server answers with the count
 * ("Narrow the dates to export. This view has 64,210 entries."), shown as it is. The export is
 * itself an audit entry, so the list refreshes.
 */
export function useAuditExport(onExported: () => void) {
  return useMutation({
    mutationFn: (filters: AuditFilters) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return client.audit.export(filters)
    },
    onSuccess: (file, filters) => {
      const name =
        file instanceof File && file.name
          ? file.name
          : `audit-log-${filters.from}-to-${filters.to}.csv`
      download(file, name)
      toast.success('Audit log exported')
      onExported()
    },
    onError: toastApiError,
  })
}
