# 0020 · Approximate place from an offline IP database, looked up once at sign-in

- **Date:** 2026-11-26
- **Status:** proposed (with the brick 3d plan)

## Context
My security lists where a person is signed in. A masked IP address ("102.89.34.x") means nothing to Aisha; "Lekki, Lagos" or "London, United Kingdom" does, and the "new sign-in" email needs the same words. Turning an IP address into a place needs a lookup. We never store or log a full IP address (brick 2a, NDPA), and we don't want to send people's addresses to an outside service at every sign-in.

## Decision
- **DB-IP "IP to City Lite"** in MMDB format (CC BY 4.0, free, monthly), read inside the API with **`mmdb-lib`** (MIT, no dependencies). No outside service is called.
- The lookup runs **once, when a session is created**, from the full address held in memory for that request. Only the place text is stored on the session (`sessions.place`); the address is masked as before. The place is never written to logs, analytics or the audit trail (the security alert email shows it to the account's owner only).
- The database file is **not in the repository** (121 MB). Devops downloads it at deploy time and refreshes it monthly; the path is `GEOIP_DB_PATH`. A missing or unreadable file means no place (the list shows the masked IP only); sign-in never fails because of it.
- Attribution, as the licence requires: "IP geolocation by DB-IP" with a link to db-ip.com under the sessions list, and in the privacy notice.
- No "unusual location" warnings: places for Nigerian mobile networks are often wrong.

## Consequences
- The API holds the database in memory (about 120 MB) once the first sign-in loads it. If that's too much for the host, the country-only file (a few MB) is a drop-in swap with "Nigeria" instead of "Lagos".
- Places go stale between refreshes and are sometimes wrong. Copy says "approximate place" and "near".
- A paid or more accurate database later only changes the file and the reader's field names.

## Alternatives considered
- MaxMind GeoLite2: needs an account and licence key, and its licence limits redistribution and requires deleting old copies; more process for similar accuracy.
- IP2Location LITE: CC BY-SA and a registration to download.
- An online lookup API: sends every sign-in's address to a third party and adds a network call to sign-in.
- Masked IP only: honest but not useful to the person reading it.
