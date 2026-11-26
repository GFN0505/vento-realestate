import { createFileRoute } from '@tanstack/react-router'
import { NotFoundPage } from '@/components/errors/not-found-page'

/** Any address the app doesn't know, signed in: the 404 page inside the shell. */
export const Route = createFileRoute('/_app/_shell/$')({
  component: NotFoundPage,
})
