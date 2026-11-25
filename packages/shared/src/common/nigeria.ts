import { z } from 'zod'

/** The 36 states and the Federal Capital Territory, in the order Nigerians expect. */
export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const

export const nigerianState = z.enum(NIGERIAN_STATES, { message: 'Choose a state' })
export type NigerianState = z.infer<typeof nigerianState>

/** Display label: "FCT" reads better in full. */
export function stateLabel(state: NigerianState): string {
  return state === 'FCT' ? 'FCT (Abuja)' : state
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** 1 = January. Financial years in Nigeria usually start in January. */
export const monthNumber = z
  .number({ message: 'Choose a month' })
  .int()
  .min(1, { message: 'Choose a month' })
  .max(12, { message: 'Choose a month' })
