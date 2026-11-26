import { Command as CommandPrimitive } from 'cmdk'
import { SearchIcon } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

/*
 * Command list on cmdk (plan 6.3): a tested combobox and listbox with aria-activedescendant,
 * arrow keys and groups. Styling follows the board ExecutiveHome palette. Lazy-loaded.
 */

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  )
}

function CommandInput({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex shrink-0 items-center gap-2.5 border-b px-4 sm:px-[18px]"
    >
      <SearchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'h-14 w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:h-[52px] sm:text-[15px]',
          className,
        )}
        {...props}
      />
      {children}
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        'min-h-0 flex-1 scroll-py-2 overflow-y-auto overscroll-contain py-1.5',
        className,
      )}
      {...props}
    />
  )
}

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="px-[18px] py-10 text-center text-[13px] text-muted-foreground [overflow-wrap:anywhere]"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden [&_[cmdk-group-heading]]:px-[18px] [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.04em]',
        className,
      )}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // 44px rows on phones, 40px with a pointer; the highlighted row is the keyboard focus.
        'relative flex min-h-11 cursor-default select-none items-center gap-3 px-[18px] text-[14px] outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-highlight data-[selected=true]:shadow-[inset_2px_0_0_var(--color-brand)] data-[disabled=true]:opacity-50 sm:min-h-10 sm:text-[13px] [&_svg:not([class*=size-])]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** The muted note at the end of a row: "Page", "Entity", "Organization". */
function CommandHint({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('ml-auto shrink-0 text-[11px] text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Command, CommandEmpty, CommandGroup, CommandHint, CommandInput, CommandItem, CommandList }
