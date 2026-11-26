import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/features/shell/home-page'

export const Route = createFileRoute('/_app/_shell/')({
  component: HomePage,
})
