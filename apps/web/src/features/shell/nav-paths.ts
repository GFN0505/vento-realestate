/*
 * Every module's address, without icons or copy, so the route guard can recognise app
 * addresses without pulling the navigation registry into the first load. nav.ts must use these.
 */
export const NAV_PATHS = [
  '/',
  '/land',
  '/projects',
  '/estates',
  '/sales',
  '/finance',
  '/hr',
  '/compliance',
  '/documents',
  '/reports',
] as const
export type NavPath = (typeof NAV_PATHS)[number]
