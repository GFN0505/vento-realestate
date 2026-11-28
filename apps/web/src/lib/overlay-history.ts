import { useRouter } from '@tanstack/react-router'

/*
 * Sheets and previews live in the address (`?sheet=…`), so Back closes them. When one was opened
 * from its page, closing it goes Back too: replacing the entry instead would leave the page in
 * history twice and the next Back would seem to do nothing. A deep link (or a reload) has no
 * page behind it, so closing replaces the entry instead.
 */

/** History entries (by the router's key) that an overlay opened on top of its page. */
const openedFromPage = new Set<string>()

export function useOverlayHistory() {
  const router = useRouter()
  const currentKey = () => router.history.location.state.__TSR_key

  return {
    /** Wraps the navigation that opens an overlay from its page. */
    opened(navigation: Promise<void>) {
      void navigation.then(() => {
        const key = currentKey()
        if (key) openedFromPage.add(key)
      })
    },
    /** Wraps a navigation that replaces an open overlay's entry (e.g. another stage). */
    replaced(navigation: Promise<void>) {
      const before = currentKey()
      void navigation.then(() => {
        const key = currentKey()
        if (before && key && openedFromPage.delete(before)) openedFromPage.add(key)
      })
    },
    /** Closes the overlay: Back when it was opened from the page, else `replace`. */
    close(replace: () => void) {
      const key = currentKey()
      if (key && openedFromPage.delete(key)) router.history.back()
      else replace()
    },
  }
}
