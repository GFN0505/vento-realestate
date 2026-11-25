import type * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/*
 * shadcn Field, trimmed to what forms use: a labelled control with a description and an
 * inline error. FieldSeparator is left out (it needs Separator, which isn't installed).
 */

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset data-slot="field-set" className={cn('flex flex-col gap-3', className)} {...props} />
  )
}

function FieldLegend({ className, ...props }: React.ComponentProps<'legend'>) {
  return (
    <legend
      data-slot="field-legend"
      className={cn('mb-1.5 font-semibold text-muted-foreground text-xs', className)}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn('@container/field-group flex w-full flex-col gap-4', className)}
      {...props}
    />
  )
}

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & { orientation?: 'vertical' | 'horizontal' }) {
  return (
    <div
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        'group/field flex w-full min-w-0 data-[invalid=true]:text-destructive',
        orientation === 'vertical' ? 'flex-col gap-1.5' : 'flex-row items-start gap-2.5',
        className,
      )}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-content"
      className={cn('flex flex-1 flex-col gap-0.5 leading-snug', className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn('leading-snug', className)} {...props} />
}

function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-title"
      className={cn('font-semibold text-[13px] text-foreground', className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'font-normal text-muted-foreground text-xs leading-normal [&>a]:text-link [&>a]:underline-offset-4 [&>a:hover]:underline',
        className,
      )}
      {...props}
    />
  )
}

function FieldError({ className, children, ...props }: React.ComponentProps<'p'>) {
  if (!children) return null
  return (
    <p
      data-slot="field-error"
      className={cn('font-normal text-[13px] text-destructive leading-snug', className)}
      {...props}
    >
      {children}
    </p>
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
}
