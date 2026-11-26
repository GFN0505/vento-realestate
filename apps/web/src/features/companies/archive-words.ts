import { type EntityArchivePreview, joinNames } from '@vento/shared'

const others = (n: number) => (n === 1 ? '1 other' : `${n} others`)

/**
 * Who'd lose their only company: "Kunle Ojo, Ope Martins and 1 other can only see this company."
 * Names come from the server (up to three the viewer may see); the count is the total.
 */
export function dependantsLine({ count, names }: EntityArchivePreview['members']): string {
  const hidden = count - names.length
  const who =
    names.length === 0
      ? count === 1
        ? '1 person'
        : `${count} people`
      : hidden > 0
        ? `${names.join(', ')} and ${others(hidden)}`
        : joinNames(names)
  return `${who} can only see this company. They'll see no company data until you give them access to another.`
}
