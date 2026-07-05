"use client"

import { useState } from "react"
import Link from "next/link"
import { ShieldCheck, Gauge, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

/**
 * SecurityGlanceCard Component
 * 
 * Bento grid card displaying current site security state.
 */
export function SecurityGlanceCard() {
  return (
    <Link href="/security" className="group block">
      <Card
        variant="interactive"
        rounded="3xl"
        className="flex flex-col justify-between p-3.5 min-h-glance-card-min-h"
      >
        <div className="flex items-center justify-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-success-soft text-success">
            <ShieldCheck className="size-3.5" />
          </span>
          <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
            Security
          </span>
        </div>

        <div className="text-center flex flex-col items-center justify-center flex-1 mt-1.5">
          <span className="text-3xl font-bold tracking-tight text-foreground block">
            100%
          </span>
          <span className="text-3xs text-muted-foreground font-bold uppercase tracking-wider block mt-0.5">
            protected
          </span>
        </div>
      </Card>
    </Link>
  )
}

/**
 * SpeedGlanceCard Component
 * 
 * Bento grid card displaying site loading performance.
 */
export function SpeedGlanceCard() {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")

  const config = {
    desktop: { label: "Fast (Top 8%)", pct: 92, text: "Loads instantly in 1.1s." },
    mobile: { label: "Fast (Top 12%)", pct: 88, text: "Loads smoothly in 1.6s." },
  }

  const current = config[device]

  return (
    <Link
      href="/performance"
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest(".toggle-button")) {
          e.preventDefault()
        }
      }}
      className="group block h-full"
    >
      <Card
        variant="interactive"
        rounded="3xl"
        className="flex flex-col justify-between p-18px shadow-xs h-full min-h-glance-card-min-h"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-success-soft text-success">
                <Gauge className="size-3.5" />
              </span>
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Speed
              </span>
            </div>
          </div>

          {/* Headline & Switcher */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold tracking-tight text-foreground">Fast & smooth</p>
              <p className="text-xs-compact text-muted-foreground mt-0.5 leading-normal">
                {current.text}
              </p>
            </div>

            {/* Compact Switcher */}
            <div className="flex rounded-md bg-accent p-0.5 shrink-0 border border-border/20">
              <button
                onClick={() => setDevice("desktop")}
                className={cn(
                  "toggle-button rounded-sm px-1.5 py-0.5 text-4xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                  device === "desktop"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Desk
              </button>
              <button
                onClick={() => setDevice("mobile")}
                className={cn(
                  "toggle-button rounded-sm px-1.5 py-0.5 text-4xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                  device === "mobile"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Mob
              </button>
            </div>
          </div>

          {/* Load Speed Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-4xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>Load Speed Rating</span>
              <span className="text-success font-extrabold">{current.label}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
              <div
                className="h-full rounded-full bg-success transition-all duration-500 ease-out"
                style={{ width: `${current.pct}%` }}
              />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

/**
 * CheckoutGlanceCard Component
 * 
 * Bento grid card displaying WooCommerce checkout health state.
 */
export function CheckoutGlanceCard() {
  return (
    <Link href="/store" className="group block h-full">
      <Card
        variant="interactive"
        rounded="3xl"
        className="flex flex-col justify-between p-18px px-22px h-full min-h-glance-card-min-h"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-success-soft text-success">
                <ShoppingCart className="size-3.5" />
              </span>
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Checkout
              </span>
            </div>
          </div>

          {/* Headline */}
          <div>
            <p className="text-sm font-bold tracking-tight text-foreground">Ready for sales</p>
            <p className="text-xs-compact text-muted-foreground mt-0.5 leading-normal">
              Stripe payments, PayPal express, and Apple Pay are operational.
            </p>
          </div>
        </div>
      </Card>
    </Link>
  )
}
