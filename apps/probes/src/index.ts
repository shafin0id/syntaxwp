export interface Env {
  SYNTAXWP_API_URL: string;
}

interface Site {
  id: string;
  url: string;
}

async function checkSite(site: Site, apiUrl: string) {
  const startTime = Date.now();
  try {
    const response = await fetch(site.url, {
      method: "GET",
      headers: {
        "User-Agent": "SyntaxWP-Uptime-Probe/1.0",
      },
      // 15 seconds timeout
      signal: AbortSignal.timeout(15000),
    });

    const ttfb = Date.now() - startTime;
    const status = response.status;

    if (status >= 500) {
      await reportAnomaly(apiUrl, {
        site_id: site.id,
        type: "wsod",
        severity: "high",
        root_cause: `HTTP status ${status} returned`,
        plain_english: `The site returned a server error (HTTP status code ${status}).`,
        confidence: 1.0,
      });
      return;
    }

    if (status === 200) {
      const text = await response.text();
      // WSOD check: HTML is empty or extremely short (typical WSOD pages contain no content or minimal PHP error text)
      if (text.trim().length < 500) {
        await reportAnomaly(apiUrl, {
          site_id: site.id,
          type: "wsod",
          severity: "high",
          root_cause: `Empty or extremely short HTML response (length: ${text.trim().length})`,
          plain_english: `The site returned an empty or extremely short page (under 500 characters), indicating a potential White Screen of Death (WSOD).`,
          confidence: 0.95,
        });
        return;
      }

      // Performance check: TTFB exceeding threshold
      if (ttfb > 3000) {
        await reportAnomaly(apiUrl, {
          site_id: site.id,
          type: "perf_regression",
          severity: "low",
          root_cause: `TTFB threshold exceeded: ${ttfb}ms`,
          plain_english: `The site response speed is slow, taking ${ttfb}ms to return the first byte.`,
          confidence: 0.85,
        });
      }
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    await reportAnomaly(apiUrl, {
      site_id: site.id,
      type: "wsod",
      severity: "high",
      root_cause: `Network error or timeout: ${err.message || err}`,
      plain_english: `Connection failed or timed out after ${duration}ms: ${err.message || err}`,
      confidence: 1.0,
    });
  }
}

async function reportAnomaly(apiUrl: string, payload: any) {
  try {
    const res = await fetch(`${apiUrl}/api/probes/anomaly`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Failed to report anomaly to API: HTTP ${res.status} | ${await res.text()}`);
    }
  } catch (err: any) {
    console.error("Failed to report anomaly to API:", err.message);
  }
}

export default {
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    console.log("Running scheduled uptime checks...");

    try {
      const res = await fetch(`${env.SYNTAXWP_API_URL}/api/probes/sites`);
      if (!res.ok) {
        console.error(`Failed to fetch monitored sites from API: HTTP ${res.status}`);
        return;
      }

      const sites = (await res.json()) as Site[];
      console.log(`Fetched ${sites.length} sites to probe.`);

      // Check all sites in parallel
      const checks = sites.map((site) => checkSite(site, env.SYNTAXWP_API_URL));
      await Promise.all(checks);
    } catch (err: any) {
      console.error("Scheduled probe run failed:", err.message);
    }
  },

  // Manual trigger via HTTP request for local development testing
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    console.log("Manually triggering uptime checks...");
    
    ctx.waitUntil(
      (async () => {
        const res = await fetch(`${env.SYNTAXWP_API_URL}/api/probes/sites`);
        if (res.ok) {
          const sites = (await res.json()) as Site[];
          const checks = sites.map((site) => checkSite(site, env.SYNTAXWP_API_URL));
          await Promise.all(checks);
        }
      })()
    );

    return new Response("Probes triggered in background.", { status: 200 });
  },
};
