import { encode } from 'uqr'

/**
 * The authenticator QR code, drawn in the browser: the secret inside it never goes to a
 * third-party QR service. Dark modules on white in both themes so every camera can read it.
 */
export function TotpQr({ uri, size = 132 }: { uri: string; size?: number }) {
  const { data, size: modules } = encode(uri, { border: 1, ecc: 'M' })
  const path = data
    .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : '')))
    .join('')
  return (
    <svg
      role="img"
      aria-label="QR code for your authenticator app"
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-md bg-qr-background outline outline-border"
    >
      <path d={path} className="fill-qr-foreground" />
    </svg>
  )
}
