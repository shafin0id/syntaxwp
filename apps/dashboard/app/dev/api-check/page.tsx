"use client"

import { useEffect, useState } from "react"

// Throwaway page for Task 1's definition-of-done check only: proves the
// dashboard can reach apps/api over HTTP. Not part of the product surface —
// real data wiring happens in Task B11.
export default function ApiCheckPage() {
  const [result, setResult] = useState<string>("checking...")

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
    fetch(`${apiUrl}/api/dev/site-health`)
      .then((res) => res.json())
      .then((data) => setResult(`API reachable — healthScore: ${data.healthScore}`))
      .catch((err) => setResult(`API unreachable: ${String(err)}`))
  }, [])

  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>apps/api connectivity check</h1>
      <p>{result}</p>
    </main>
  )
}
