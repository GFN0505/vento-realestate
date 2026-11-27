// Cross-site request forgery guard for /rpc (audit M3). The web app calls the API from its own
// origin; a browser always says where a request came from (Sec-Fetch-Site, Origin), so anything
// another site makes a browser send is refused. Non-browser callers send neither and go ahead:
// they hold no victim's cookie.

/** True when a browser says this request comes from another site than the web app. */
export function isCrossSite(headers: Headers, webOrigin: string): boolean {
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return true
  const origin = headers.get('origin')
  return origin !== null && origin !== new URL(webOrigin).origin
}
