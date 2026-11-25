---
name: performance
description: Performance budgets and techniques for a fast app on mid-range Android phones and weak Nigerian networks — bundle size, Core Web Vitals, images, data loading, API latency, database queries, and how to measure. Use when building heavy screens, adding dependencies, or investigating slowness.
---

# Performance

## Budgets (enforced in CI where possible)
| Metric | Budget |
|---|---|
| Web first-load JS (gzip) | ≤ 200 KB |
| Per-route chunk | ≤ 80 KB |
| LCP (Moto G-class device, Fast 4G throttle) | ≤ 2.5 s |
| INP | ≤ 200 ms |
| CLS | ≤ 0.05 |
| API p95 for list/detail endpoints | ≤ 200 ms |
| API response size for a list page | ≤ 50 KB |

## Web
- **Check before adding a dependency:** size on bundlephobia / `pnpm why`. Prefer tree-shakable imports (`lucide-react` named icons, `date-fns` functions). No moment, lodash (full), or UI kits beside shadcn.
- **Load data before render** with route loaders. Prefetch on hover/touch (`preload: 'intent'`). Use `keepPreviousData` for paginated tables.
- **Lazy-load heavy parts:** charts (Recharts), rich text, PDF preview, image gallery lightbox, maps.
- **Images:** serve resized variants (thumbnail 400w, card 800w, hero 1600w) in WebP/AVIF from the storage/CDN, with `srcset`, `sizes`, `width`/`height`, `loading="lazy"` (except the LCP image, which gets `fetchpriority="high"`). Blur placeholder for unit and site photos.
- **Lists:** virtualize anything over ~100 rows (TanStack Virtual).
- **Rendering:** avoid context values that change often at the top of the tree; keep state local; only memoize after profiling.
- **Fonts:** self-host, subset to Latin, `font-display: swap`, preload the main weight only.
- **Weak networks:** show cached data immediately (TanStack Query `staleTime`), retry failed GETs with backoff, keep form input on failure, and show an offline banner when `navigator.onLine` is false.

## API and database
- Select only needed columns; never return whole joined graphs to a list view.
- Every filtered or sorted column has an index (composite with `organization_id` first). Check plans with `EXPLAIN ANALYZE` for new list queries.
- No N+1 queries: batch with `inArray` or joins.
- Paginate everything; count totals efficiently (or use estimated counts on very large tables).
- Compress responses (Hono `compress`). Set cache headers on static and media assets.
- Heavy work (PDFs, statements, bulk reminders, exports) runs in background jobs, with progress shown in the UI.

## Measuring
- `pnpm --filter web build` prints chunk sizes — compare before and after a change.
- Lighthouse (mobile preset) on Home, Portfolio, a list page and a detail page.
- In the browser: Performance panel with 4× CPU slowdown and Fast 4G throttle.
- API: log request duration; investigate anything over budget.

Report numbers before and after for any performance change.
