"use client"

import { useEffect, useRef } from "react"

type AutoRefreshOptions = {
  enabled?: boolean
  intervalMs?: number
  skipWhenHidden?: boolean
  refreshOnFocus?: boolean
}

export function useAutoRefresh(
  refresh: () => Promise<void> | void,
  {
    enabled = true,
    intervalMs = 12000,
    skipWhenHidden = true,
    refreshOnFocus = true,
  }: AutoRefreshOptions = {}
) {
  const refreshRef = useRef(refresh)
  const inFlightRef = useRef(false)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled || intervalMs <= 0 || typeof window === "undefined") {
      return
    }

    let isClosed = false

    const tick = async () => {
      if (isClosed || inFlightRef.current) {
        return
      }
      if (skipWhenHidden && typeof document !== "undefined" && document.hidden) {
        return
      }

      inFlightRef.current = true
      try {
        await refreshRef.current()
      } catch {
        // Component-level loaders already handle their own error state.
      } finally {
        inFlightRef.current = false
      }
    }

    const intervalId = window.setInterval(() => {
      void tick()
    }, intervalMs)

    const handleVisibilityChange = () => {
      if (!refreshOnFocus || document.hidden) {
        return
      }
      void tick()
    }

    if (refreshOnFocus && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange)
    }

    return () => {
      isClosed = true
      window.clearInterval(intervalId)
      if (refreshOnFocus && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
      }
    }
  }, [enabled, intervalMs, skipWhenHidden, refreshOnFocus])
}
