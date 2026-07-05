"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

/**
 * Modal Component
 * 
 * A responsive overlay dialog box for presenting focused content or actions.
 * Traps focus and lock scroll on mount.
 * 
 * Usage example:
 * ```tsx
 * <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Confirmation">
 *   <p>Are you sure you want to proceed?</p>
 * </Modal>
 * ```
 */
export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    if (isOpen) {
      document.body.style.overflow = "hidden"
      window.addEventListener("keydown", handleEscape)
    }
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={onClose}
        className="fixed inset-0 bg-foreground/45 backdrop-blur-xs transition-opacity duration-300 ease-out"
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg transform overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300 ease-out animate-in fade-in-0 zoom-in-95",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold leading-none tracking-tight text-foreground">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-80vh overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
