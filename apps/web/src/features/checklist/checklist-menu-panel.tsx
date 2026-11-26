import { useQueryClient } from '@tanstack/react-query'
import { EllipsisIcon, EyeOffIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type LazyMenuProps, useAutoFocus } from '@/components/ui/lazy-menu'
import { hideChecklist } from './checklist-visibility'
import { checklistMenuTrigger } from './setup-checklist'

/** The card's ⋯ menu, loaded when someone heads for it (keeps Radix out of Home's first load). */
export function ChecklistMenuPanel({ defaultOpen, autoFocus }: LazyMenuProps) {
  const trigger = useAutoFocus<HTMLButtonElement>(autoFocus)
  const queryClient = useQueryClient()
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        ref={trigger}
        aria-label="Checklist options"
        className={checklistMenuTrigger}
      >
        <EllipsisIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => hideChecklist(queryClient)}>
          <EyeOffIcon aria-hidden />
          Hide checklist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
