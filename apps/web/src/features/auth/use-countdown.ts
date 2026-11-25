import { useEffect, useState } from 'react'

/** Seconds left until `until` (ms timestamp), ticking once a second. 0 when passed. */
export function useCountdown(until: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until])
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/** 42 → "0:42". */
export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
