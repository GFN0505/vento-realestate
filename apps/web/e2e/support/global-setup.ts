import { expireStaffInvitations, publishPlans } from './fixtures'

/** Self-signed-up organizations land on Starter, so the plans must exist before any spec runs. */
export default function globalSetup() {
  publishPlans()
  // The cap of 5 open staff invitations is global: start without earlier runs' leftovers.
  expireStaffInvitations()
}
