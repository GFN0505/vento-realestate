/*
 * Toasts from code on Home's first load (the shell's sync hooks). `sonner` loads on the first
 * toast instead of with the page; the Toaster itself is already lazy (routes/__root.tsx).
 */
type Toast = typeof import('sonner').toast

export function notify(show: (toast: Toast) => void): void {
  void import('sonner').then((m) => show(m.toast))
}
