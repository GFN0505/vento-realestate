import { publishPlans } from './fixtures'

/** Self-signed-up organizations land on Starter, so the plans must exist before any spec runs. */
export default function globalSetup() {
  publishPlans()
}
