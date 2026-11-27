import { CopyIcon, DownloadIcon } from 'lucide-react'
import { useId } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

type Props = {
  codes: string[]
  email: string
  saved: boolean
  onSavedChange: (saved: boolean) => void
}

/** The 10 single-use backup codes, shown once after two-step is turned on. */
export function BackupCodes({ codes, email, saved, onSavedChange }: Props) {
  const checkboxId = useId()
  const text = codes.join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Backup codes copied')
    } catch {
      toast.error("Couldn't copy. Use Download instead.")
    }
  }

  function download() {
    const body = `Vento Real Estate backup codes for ${email}\nEach code works once.\n\n${text}\n`
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'vento-backup-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-muted-foreground text-sm">
        Save these 10 codes somewhere safe. Each works once.
      </p>
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-muted px-4 py-3.5 font-medium text-[15px] tabular-nums tracking-wider"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={download}>
          <DownloadIcon /> Download
        </Button>
        <Button type="button" variant="outline" onClick={copy}>
          <CopyIcon /> Copy
        </Button>
      </div>
      <label
        htmlFor={checkboxId}
        className="flex cursor-pointer items-start gap-2.5 border-t py-2.5 font-semibold text-[13px]"
      >
        <Checkbox
          id={checkboxId}
          checked={saved}
          onCheckedChange={(value) => onSavedChange(value === true)}
          className="mt-px"
        />
        I've saved my backup codes
      </label>
    </div>
  )
}
