import type { PaginationInput } from '@vento/shared'

export function pageOffset(input: PaginationInput): { limit: number; offset: number } {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize }
}

/** The shared list shape: `{ items, page, pageSize, total }`. */
export function toPage<T>(items: T[], input: PaginationInput, total: number) {
  return { items, page: input.page, pageSize: input.pageSize, total }
}
