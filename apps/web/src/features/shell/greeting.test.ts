import { describe, expect, it } from 'vitest'
import { greeting, longDateInLagos } from './greeting'

// Lagos is UTC+1 all year (no daylight saving).
const lagos = (time: string) => new Date(`2026-11-26T${time}+01:00`)

describe('greeting', () => {
  it('says good morning until noon in Lagos', () => {
    expect(greeting('Olumide Bankole', lagos('05:00:00'))).toBe('Good morning, Olumide')
    expect(greeting('Olumide Bankole', lagos('11:59:59'))).toBe('Good morning, Olumide')
  })

  it('says good afternoon from noon until 5 pm', () => {
    expect(greeting('Grace Umeh', lagos('12:00:00'))).toBe('Good afternoon, Grace')
    expect(greeting('Grace Umeh', lagos('16:59:59'))).toBe('Good afternoon, Grace')
  })

  it('says good evening from 5 pm', () => {
    expect(greeting('Aisha Bello', lagos('17:00:00'))).toBe('Good evening, Aisha')
    expect(greeting('Aisha Bello', lagos('00:30:00'))).toBe('Good evening, Aisha')
  })

  it('uses Lagos time, not the device clock zone', () => {
    // 11:30 UTC is 12:30 in Lagos.
    expect(greeting('Tunde Ola', new Date('2026-11-26T11:30:00Z'))).toBe('Good afternoon, Tunde')
  })
})

describe('date line', () => {
  it('writes the weekday, day, month and year', () => {
    expect(longDateInLagos(lagos('09:00:00'))).toBe('Thursday, 26 November 2026')
  })

  it('rolls over at Lagos midnight', () => {
    expect(longDateInLagos(new Date('2026-11-26T23:30:00Z'))).toBe('Friday, 27 November 2026')
  })
})
