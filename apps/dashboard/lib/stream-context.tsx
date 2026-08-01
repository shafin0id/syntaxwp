"use client"

import { API_BASE_URL } from "./config"

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
    const url = siteId
      ? `${API_BASE_URL}/api/incidents?siteId=${siteId}`
      : `${API_BASE_URL}/api/incidents`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (seq !== refetchSeq.current) return; // a newer refetch already started
        setIncidentsList(data.map(mapApiIncidentToDashboardIncident))
      })
      .catch(console.error)
  }

  useEffect(() => {
    let active = true
    let eventSource: EventSource | null = null
    let reconnectTimeout: any = null
    let reconnectDelay = RECONNECT_BASE_MS

    function connect() {
      if (!active) return

      const siteId = typeof window !== "undefined" ? localStorage.getItem("selectedSiteId") : null;
      const url = siteId
        ? `${API_BASE_URL}/api/stream?siteId=${siteId}`
        : `${API_BASE_URL}/api/stream`;

      eventSource = new EventSource(url)

      eventSource.onopen = () => {
        reconnectDelay = RECONNECT_BASE_MS
      }

      eventSource.addEventListener("update", (event: MessageEvent) => {
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
      })

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close()
        }
        reconnectTimeout = setTimeout(connect, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
      }
    }

    refetch()
    connect()

    const handleSiteChange = () => {
      if (eventSource) {
        eventSource.close()
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      refetch()
      connect()
    }

    window.addEventListener("siteChanged", handleSiteChange)

    return () => {
      active = false
      if (eventSource) {
        eventSource.close()
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
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
