/**
 * WelcomeBanner Component
 * 
 * Displays a personalized greeting to the user based on local system time,
 * along with quick links/actions to execute full site health checks or view reports.
 */

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Play, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function WelcomeBanner() {
  const [timeGreeting, setTimeGreeting] = useState("Good day!")

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) {
      setTimeGreeting("Good morning!")
    } else if (hour < 18) {
      setTimeGreeting("Good afternoon!")
    } else {
      setTimeGreeting("Good evening!")
    }
  }, [])

  return (
    <Card variant="interactive" rounded="3xl" className="relative overflow-hidden p-5 px-6">
      {/* Mesh Grid & Radial Glow Backgrounds */}
      <div className="absolute inset-0 bg-blueprint-grid opacity-blueprint pointer-events-none" />
      <div className="absolute -right-24 -top-24 size-48 rounded-full bg-primary/4 blur-3xl pointer-events-none" />
      
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          <span className="inline-flex items-center gap-2">
            <span>👋</span>
            <span className="whitespace-nowrap">Hi Shafin, {timeGreeting}</span>
          </span>
        </h1>

        {/* Action Button Stack */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center shrink-0">
          <Button variant="secondary" icon={Play} className="w-full sm:w-auto min-w-145px justify-between">
            Run full check
          </Button>
          <Link href="/reports" className="w-full sm:w-auto">
            <Button variant="primary" icon={ArrowRight} className="w-full sm:w-auto min-w-145px justify-between">
              View report
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  )
}
