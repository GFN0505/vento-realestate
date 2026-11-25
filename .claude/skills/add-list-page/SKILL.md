---
name: add-list-page
description: Recipe for a standard list screen in apps/web — route with URL-synced search/filter/sort/pagination, DataTable, create/edit FormDialog, delete confirm, toasts, loading/empty/error states. Use when building any page that lists records.
---

# Add a list page

Example: Subscriptions. Assumes the module's contract already exists in `packages/shared`.

## Files
```
apps/web/src/routes/_app/subscriptions/index.tsx               route + search-param schema + loader
apps/web/src/features/subscriptions/columns.tsx                TanStack Table column defs
apps/web/src/features/subscriptions/SubscriptionFormDialog.tsx create + edit in one dialog
apps/web/src/features/subscriptions/SubscriptionFormFields.tsx fields (reused on detail pages)
apps/web/src/features/subscriptions/queries.ts                 orpc query/mutation options
```

## Route
```tsx
const search = listSubscriptionsInput.pick({ page: true, pageSize: true, q: true, sort: true, status: true })

export const Route = createFileRoute('/_app/subscriptions/')({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(subscriptionQueries.list(deps)),
  component: SubscriptionsPage,
})
```
- All table state (page, size, search, sort, filters) lives in the URL. Use `Route.useSearch()` / `navigate({ search })`. No `useState` copies.
- Debounce the search input (300 ms) before updating the URL, and reset `page` to 1 when filters change.

## Page layout (match every other list page)
```
<PageHeader title="Subscriptions" description="…" actions={<Button><Plus/> New subscription</Button>} />
<DataTableToolbar search filters />   // search left, filter pills, column picker right
<DataTable columns data total isLoading />  // inside a Card
<SubscriptionFormDialog />             // mode: create | edit, controlled by URL `?dialog=new|edit&id=`
<ConfirmDialog />                      // delete / archive
```

## Data
- Queries: `orpc.subscription.list.queryOptions({ input })`. Mutations: `orpc.subscription.create.mutationOptions()`.
- On success: `toast.success('Subscription created')`, close the dialog, `queryClient.invalidateQueries({ queryKey: orpc.subscription.key() })`.
- On error: `toast.error(error.message)`. For form field errors, map them back with `form.setError`.
- Use `placeholderData: keepPreviousData` so the table doesn't flash between pages.

## Form dialog
- `useForm({ resolver: zodResolver(createSubscriptionInput), defaultValues })`. Build edit defaults from the record.
- Money fields use `<MoneyInput>` with a currency select (formats ₦, $, £ or €, stores a decimal string and the currency). Dates use `<DatePicker>`. References (unit, buyer, payment plan) use `<EntityCombobox>` (async search).
- The submit button shows a pending state. Disable close while saving.

## States
- Loading: table skeleton rows (not a spinner).
- Empty with no filters: `<EmptyState>` with an illustration, a one-line explanation and a primary action.
- Empty with filters: "No results" plus a "Clear filters" button.
- Error: an inline message with a Retry button.

## Columns
- Status columns use `<StatusBadge status=…>`. Money columns are right-aligned and use `formatMoney(amount, currency)`. Dates use `formatDate`.
- The last column is a row-actions dropdown (`aria-label="Actions for {name}"`).
- Mobile: hide secondary columns under `md`, and keep name, status and actions.

## Done when
Works in light and dark mode at 375px and desktop, every state is reachable, `pnpm --filter web typecheck` passes, and there's an e2e test for create → appears in list → edit → delete.
