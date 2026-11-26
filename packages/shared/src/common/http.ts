/**
 * The organization a browser tab is showing, sent on every oRPC call (decision 0013). The
 * server refuses a mismatch with the session; it never uses the value to choose an organization.
 */
export const ORGANIZATION_HEADER = 'x-vento-organization'
