/**
 * True on a mouse or trackpad. Auth forms only autofocus there: on phones focusing a field
 * pops the keyboard over the page before the person has read it.
 */
export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true
}
