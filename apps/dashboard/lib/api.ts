export function mapApiIncidentToDashboardIncident(apiInc: any): any {
  const isResolved = apiInc.status === "resolved";
  
  let stage: any = "resolved";
  if (apiInc.status === "open") stage = "diagnosing";
  else if (apiInc.status === "diagnosing") stage = "diagnosing";
  else if (apiInc.status === "fixing" || apiInc.status === "testing") stage = "testing";
  else if (apiInc.status === "escalated") stage = "awaiting-approval";

  let category: any = "Fatal error";
  if (apiInc.type === "checkout_failure") category = "Checkout";
  else if (apiInc.type === "performance") category = "Performance";
  else if (apiInc.type === "vulnerability") category = "Security";

  let status: any = "warning";
  if (apiInc.severity === "critical" || apiInc.severity === "high") status = "critical";
  else if (isResolved) status = "healthy";

  const step1State = (isResolved || apiInc.status === "escalated" || apiInc.status === "fixing" || apiInc.status === "testing") ? ("done" as const) : ("current" as const);
  const step2State = (isResolved || apiInc.status === "escalated") ? ("done" as const) : (apiInc.status === "fixing" || apiInc.status === "testing" ? ("current" as const) : ("upcoming" as const));
  const step3State = isResolved ? ("done" as const) : (apiInc.status === "escalated" ? ("current" as const) : ("upcoming" as const));

  const steps = [
    { label: "Issue spotted", detail: apiInc.plainEnglish, time: "Just now", state: "done" as const },
    { label: "Root cause found", detail: apiInc.rootCause && apiInc.rootCause !== "unknown" ? `Culprit plugin: ${apiInc.rootCause}` : "Under investigation", state: step1State },
    { label: "Testing fix", state: step2State },
    { label: "Promote fix", state: step3State },
  ];

  return {
    id: apiInc.id,
    title: apiInc.type === "checkout_failure" ? "Checkout flow interrupted" : "Fatal Crash Diagnosed",
    subtitle: apiInc.plainEnglish || "Anomaly detected on site",
    category,
    status,
    stage,
    detectedAgo: "Recently",
    fix: apiInc.rootCause ? `Isolate and deactivate plugin: ${apiInc.rootCause}` : "Repair system core files.",
    risk: apiInc.severity === "critical" ? "High" : "Medium",
    reversible: "Yes, instantly",
    steps,
    evidence: [
      { label: "Incident UUID", value: apiInc.id.slice(0, 8) },
      { label: "Type", value: apiInc.type },
      { label: "Detected At", value: new Date(apiInc.detectedAt).toLocaleTimeString() },
    ],
  };
}
