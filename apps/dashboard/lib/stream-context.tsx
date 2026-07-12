"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { mapApiIncidentToDashboardIncident } from "./api"

interface StreamContextType {
  incidentsList: any[]
  auditLogs: any[]
  refetch: () => void
}

const StreamContext = createContext<StreamContextType | undefined>(undefined)

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const [incidentsList, setIncidentsList] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  const refetch = () => {
    const siteId = typeof window !== "undefined" ? localStorage.getItem("selectedSiteId") : null;
    const url = siteId 
      ? `http://localhost:4000/api/incidents?siteId=${siteId}` 
      : "http://localhost:4000/api/incidents";

    fetch(url)
      .then((r) => r.json())
      .then((data) => setIncidentsList(data.map(mapApiIncidentToDashboardIncident)))
      .catch(console.error)
  }

  useEffect(() => {
    let active = true
    let eventSource: EventSource | null = null
    let reconnectTimeout: any = null

    function connect() {
      if (!active) return

      const siteId = typeof window !== "undefined" ? localStorage.getItem("selectedSiteId") : null;
      const url = siteId 
        ? `http://localhost:4000/api/stream?siteId=${siteId}` 
        : "http://localhost:4000/api/stream";

      eventSource = new EventSource(url)

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
        // Try reconnecting in 3 seconds
        reconnectTimeout = setTimeout(connect, 3000)
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
