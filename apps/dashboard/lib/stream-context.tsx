"use client"

import { API_BASE_URL } from "./config"
import { apiFetch, getAccessToken } from "./api-fetch"
import { fetchEventSource } from "@microsoft/fetch-event-source"

import React, { createContext, useContext, useState, useEffect, useRef } from "react"
import { mapApiIncidentToDashboardIncident } from "./api"

interface StreamContextType {
  incidentsList: any[]
  auditLogs: any[]
  refetch: () => void
}

const StreamContext = createContext<StreamContextType | undefined>(undefined)

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const [incidentsList, setIncidentsList] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  // Bumped on every refetch() call so a response for an older request (e.g.
  // from a site that's no longer selected) can't overwrite a newer one that
  // resolved first.
  const refetchSeq = useRef(0)

  const refetch = () => {
    const seq = ++refetchSeq.current
    const siteId = typeof window !== "undefined" ? localStorage.getItem("selectedSiteId") : null;
    const path = siteId
      ? `/api/incidents?siteId=${siteId}`
      : `/api/incidents`;

    apiFetch(path)
      .then((r) => r.json())
      .then((data) => {
        if (seq !== refetchSeq.current) return; // a newer refetch already started
        // Not authenticated (or any other non-2xx) means the API returned
        // an error object, not an incident array — most visibly hit on
        // /login itself, since this provider wraps the whole app.
        if (!Array.isArray(data)) return;
        setIncidentsList(data.map(mapApiIncidentToDashboardIncident))
      })
      .catch(console.error)
  }

  useEffect(() => {
    let active = true
    let controller: AbortController | null = null
    let reconnectDelay = RECONNECT_BASE_MS

    // This provider wraps the whole app (including /login itself), so it
    // can mount before any session exists — skip the initial fetch/stream
    // entirely rather than firing requests guaranteed to 401.

    // Native EventSource can't set an Authorization header, and every
    // dashboard.ts route (including /api/stream) now requires a session —
    // fetch-event-source drives the same SSE protocol over a real fetch()
    // call instead, so the token can ride along as a normal header.
    async function connect() {
      if (!active) return
      const localController = new AbortController()
      controller = localController

      const siteId = typeof window !== "undefined" ? localStorage.getItem("selectedSiteId") : null;
      const path = siteId
        ? `/api/stream?siteId=${siteId}`
        : `/api/stream`;
      const token = await getAccessToken()
      if (!active) return

      try {
        await fetchEventSource(`${API_BASE_URL}${path}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: localController.signal,
          openWhenHidden: true, // match native EventSource: keep running in background tabs
          async onopen(response) {
            if (!response.ok) {
              throw new Error(`Stream connection failed: ${response.status}`)
            }
            reconnectDelay = RECONNECT_BASE_MS
          },
          onmessage(event) {
            if (event.event !== "update") return
            try {
              const payload = JSON.parse(event.data)
              if (payload.incidents) {
                setIncidentsList(payload.incidents.map(mapApiIncidentToDashboardIncident))
              }
              if (payload.logs) {
                setAuditLogs(payload.logs)
              }
            } catch (err) {
              console.error("Failed to parse stream event payload:", err)
            }
          },
          onerror(err) {
            // Returning a delay (rather than throwing) tells the library to
            // retry after that many ms — same exponential backoff shape the
            // hand-rolled EventSource version used.
            const delay = reconnectDelay
            reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
            return delay
          },
        })
      } catch (err) {
        if (localController.signal.aborted) return
        console.error("Stream connection error:", err)
      }
    }

    getAccessToken().then((token) => {
      if (!active || !token) return
      refetch()
      connect()
    })

    const handleSiteChange = () => {
      controller?.abort()
      refetch()
      connect()
    }

    window.addEventListener("siteChanged", handleSiteChange)

    return () => {
      active = false
      controller?.abort()
      window.removeEventListener("siteChanged", handleSiteChange)
    }
  }, [])

  return (
    <StreamContext.Provider value={{ incidentsList, auditLogs, refetch }}>
      {children}
    </StreamContext.Provider>
  )
}

export function useStream() {
  const context = useContext(StreamContext)
  if (context === undefined) {
    throw new Error("useStream must be used within a StreamProvider")
  }
  return context
}
