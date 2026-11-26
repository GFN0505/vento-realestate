import { afterEach, describe, expect, it } from 'vitest'
import { clearRecentPages, readRecentPages, recordRecentPage } from './recent-pages'

const user = 'user-1'
const org = 'org-1'
const page = (n: number) => ({ title: `Page ${n}`, href: `/page-${n}`, module: null })

afterEach(() => localStorage.clear())

describe('recent pages', () => {
  it('keeps the newest five, newest first', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) recordRecentPage(user, org, page(n))
    expect(readRecentPages(user, org).map((p) => p.title)).toEqual([
      'Page 6',
      'Page 5',
      'Page 4',
      'Page 3',
      'Page 2',
    ])
  })

  it('moves a page opened again to the top instead of listing it twice', () => {
    recordRecentPage(user, org, page(1))
    recordRecentPage(user, org, page(2))
    recordRecentPage(user, org, { ...page(1), href: '/page-1?entity=abc' })
    expect(readRecentPages(user, org).map((p) => p.href)).toEqual(['/page-1?entity=abc', '/page-2'])
  })

  it('keeps each organization and person apart', () => {
    recordRecentPage(user, org, page(1))
    expect(readRecentPages(user, 'org-2')).toEqual([])
    expect(readRecentPages('user-2', org)).toEqual([])
  })

  it('clears every organization for that person on sign-out', () => {
    recordRecentPage(user, org, page(1))
    recordRecentPage(user, 'org-2', page(2))
    recordRecentPage('user-2', org, page(3))
    clearRecentPages(user)
    expect(readRecentPages(user, org)).toEqual([])
    expect(readRecentPages(user, 'org-2')).toEqual([])
    expect(readRecentPages('user-2', org)).toHaveLength(1)
  })

  it('ignores a corrupted entry', () => {
    localStorage.setItem(`vento-recent:${user}:${org}`, '{"oops":1}')
    expect(readRecentPages(user, org)).toEqual([])
  })
})
