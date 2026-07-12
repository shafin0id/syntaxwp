export function estimateRevenueLoss(
  hourlyBaseline: number,
  outageDurationMinutes: number,
  detectedAt: Date,
  siteTimezone?: string
): number {
  let hour = detectedAt.getHours();

  if (siteTimezone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: siteTimezone,
        hour: "numeric",
        hour12: false,
      });
      hour = Number(formatter.format(detectedAt));
    } catch (e) {
      console.warn(`[Revenue Loss] Invalid timezone "${siteTimezone}", falling back to local time.`);
    }
  }

  // Peak hours: 6 PM (18) to 10 PM (22) in client local time
  const isPeak = hour >= 18 && hour <= 22;
  const multiplier = isPeak ? 1.8 : 1.0;

  const loss = (outageDurationMinutes / 60) * hourlyBaseline * multiplier;
  return Number(loss.toFixed(2));
}

