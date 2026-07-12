import type { Task } from "graphile-worker";
import { db } from "@syntaxwp/db";
import { sites, auditLog, pluginInventory } from "@syntaxwp/db";
import { eq, and } from "drizzle-orm";
import { getBrowser } from "../browser-pool.js";
import { executeMcpActionOnSite } from "./diagnostics.js";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

interface SafeUpdatePayload {
  siteId: string;
  slug: string;
  type?: "plugin" | "theme";
}

// Injected CSS to mask dynamic layout components
const MASKING_CSS = `
  .cookie-banner, .cookie-consent, #cookie-law-info-bar, 
  .ad-banner, .google-ad, .carousel, .slider, 
  .timestamp, .date, .current-time, .widget_recent_entries,
  [class*="cookie" i], [id*="cookie" i], 
  [class*="banner" i], [class*="ad-" i], 
  [class*="slider" i], [class*="carousel" i] {
    visibility: hidden !important;
  }
`;

export const safeUpdateVerifier: Task = async (payload: any) => {
  const { siteId, slug, type = "plugin" } = payload as SafeUpdatePayload;
  console.log(`[Safe Update] Beginning 6-Stage Update for site: ${siteId}, ${type}: ${slug}`);

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) {
    console.error(`[Safe Update] Site ${siteId} not found.`);
    return;
  }

  const siteUrl = site.url;
  const updateStartTime = Date.now();

  await db.insert(auditLog).values({
    siteId,
    eventType: "update_started",
    actor: "system",
    summary: `Initiating Safe Update Pipeline for ${type}: ${slug}`,
  });

  // Fetch latest post URL dynamically from the plugin to avoid static/broken route checks
  let latestPostUrl = "/random-post-slug/";
  try {
    const siteSecretDecrypted = await decryptSecretHelper(site.siteSecretCiphertext);
    const mcpRes = await callMcpAction(siteId, siteUrl, "get_latest_post_url", "", siteSecretDecrypted);
    if (mcpRes && mcpRes.success && mcpRes.url) {
      const parsedUrl = new URL(mcpRes.url);
      latestPostUrl = parsedUrl.pathname + parsedUrl.search;
    }
  } catch (err: any) {
    console.warn(`[Safe Update] Failed to fetch latest post URL dynamically: ${err.message}. Falling back to default.`);
  }

  // Critical paths to verify
  const testPaths = [
    "/",
    "/shop/",
    latestPostUrl
  ];

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const baselines: Record<string, { screenshot: Buffer; domCount: number }> = {};
  let baselineFailed = false;

  // --- STAGE 2: Capturing Baseline & Purging Before State ---
  console.log(`[Safe Update] Stage 2: Capturing pre-update baseline states`);
  try {
    for (const path of testPaths) {
      const page = await context.newPage();
      const targetUrl = new URL(path, siteUrl).toString();
      
      try {
        console.log(`[Safe Update] Capturing baseline for ${targetUrl}`);
        const res = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        
        // Skip path if it returns 404 or fails to load, but keep homepage mandatory
        if (res && res.status() >= 400 && path !== "/") {
          console.log(`[Safe Update] Path ${path} returned ${res.status()}, skipping baseline`);
          await page.close();
          continue;
        }

        // Inject masking CSS
        await page.addStyleTag({ content: MASKING_CSS });
        
        // Allow layout to stabilize
        await page.waitForTimeout(500);

        const screenshot = await page.screenshot({ fullPage: false });
        const domCount = await page.evaluate(() => (globalThis as any).document.getElementsByTagName("*").length);

        baselines[path] = { screenshot, domCount };
        console.log(`[Safe Update] Baseline saved for ${path} (DOM nodes: ${domCount})`);
      } catch (err: any) {
        console.error(`[Safe Update] Failed to capture baseline for ${path}: ${err.message}`);
        if (path === "/") {
          baselineFailed = true;
        }
      } finally {
        await page.close();
      }
    }
  } catch (err: any) {
    console.error(`[Safe Update] Error during baseline capture phase: ${err.message}`);
    baselineFailed = true;
  }

  if (baselineFailed || !baselines["/"]) {
    console.error("[Safe Update] Crucial baseline capture for Homepage failed. Aborting update.");
    await context.close();
    await db.insert(auditLog).values({
      siteId,
      eventType: "update_failed",
      actor: "system",
      summary: `Safe Update aborted: Homepage baseline capture failed for ${type}: ${slug}`,
    });
    return;
  }

  await db.insert(auditLog).values({
    siteId,
    eventType: "update_baseline_captured",
    actor: "system",
    summary: `Pre-update baseline captured for ${type}: ${slug}`,
  });

  // --- STAGE 3: Run Update via ActionExecutor ---
  console.log(`[Safe Update] Stage 3: Running WordPress ${type === "theme" ? "Theme" : "Plugin"} Upgrader`);
  const action = type === "theme" ? "update_theme" : "update_plugin";
  const updateSuccess = await executeMcpActionOnSite(siteId, action, slug);

  if (!updateSuccess) {
    console.error(`[Safe Update] ${type === "theme" ? "Theme" : "Plugin"} update execution failed.`);
    await context.close();
    await db.insert(auditLog).values({
      siteId,
      eventType: "update_failed",
      actor: "system",
      summary: type === "theme"
        ? `Theme update execution failed or was rejected for theme: ${slug}.`
        : `Plugin update execution failed or was rejected for plugin: ${slug}. Pre-update state automatically restored by plugin.`,
    });
    return;
  }

  await db.insert(auditLog).values({
    siteId,
    eventType: "update_applied",
    actor: "system",
    summary: `Update applied successfully for ${type}: ${slug}`,
  });

  // --- STAGE 4: Deterministic Post-Flight Verification ---
  console.log(`[Safe Update] Stage 4: Executing post-update verifications`);
  
  try {
    console.log(`[Safe Update] Explicitly triggering post-update cache purge`);
    const siteSecretDecrypted = await decryptSecretHelper(site.siteSecretCiphertext);
    await callMcpAction(siteId, siteUrl, "flush_cache", "", siteSecretDecrypted);
  } catch (err: any) {
    console.warn(`[Safe Update] Failed to trigger post-update cache purge: ${err.message}`);
  }
  let verificationPassed = true;
  let verificationFailureReason = "";

  // 1. Strict Latency & Gateway Timeout Assertions (Task 3)
  let networkVerificationPassed = true;
  let networkFailureEndpoint = "";

  const endpointsToCheck = ["/", "/wp-json/"];
  for (const endpoint of endpointsToCheck) {
    try {
      const targetUrl = new URL(endpoint, siteUrl).toString();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5000ms hard timeout

      const res = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status !== 200) {
        networkVerificationPassed = false;
        networkFailureEndpoint = endpoint;
        break;
      }
    } catch (err) {
      networkVerificationPassed = false;
      networkFailureEndpoint = endpoint;
      break;
    }
  }

  if (!networkVerificationPassed) {
    console.warn(`[Safe Update] Network/Latency check failed for endpoint: ${networkFailureEndpoint}. Instantly aborting and triggering rollback!`);
    
    let rollbackSuccess = false;
    try {
      const siteSecretDecrypted = await decryptSecretHelper(site.siteSecretCiphertext);
      const mcpRes = await callMcpAction(
        siteId,
        siteUrl,
        "rollback_plugin",
        slug,
        siteSecretDecrypted,
        "GATEWAY_TIMEOUT_OR_FATAL_LATENCY"
      );
      rollbackSuccess = !!mcpRes?.success;
    } catch (err: any) {
      console.error(`[Safe Update] Instant Rollback MCP execution failed: ${err.message}`);
    }

    await db.insert(auditLog).values({
      siteId,
      eventType: "update_failed",
      actor: "system",
      summary: rollbackSuccess
        ? `Update Failed -> Automated Rollback Successful. Reason: GATEWAY_TIMEOUT_OR_FATAL_LATENCY on ${networkFailureEndpoint} for plugin: ${slug}`
        : `Update Failed -> Automated Rollback FAILED. Reason: GATEWAY_TIMEOUT_OR_FATAL_LATENCY on ${networkFailureEndpoint} for plugin: ${slug}. Manual intervention required!`,
      evidence: { reason: "GATEWAY_TIMEOUT_OR_FATAL_LATENCY", target: networkFailureEndpoint, rollbackSuccess },
    });

    await context.close();
    return;
  }

  // 2. Playwright Visual Diff & DOM Node Count Checks
  if (verificationPassed) {
    for (const path of Object.keys(baselines)) {
      const page = await context.newPage();
      const targetUrl = new URL(path, siteUrl).toString();
      const baseline = baselines[path];

      try {
        console.log(`[Safe Update] Verifying visual & DOM state for ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.addStyleTag({ content: MASKING_CSS });
        await page.waitForTimeout(500);

        const postDomCount = await page.evaluate(() => (globalThis as any).document.getElementsByTagName("*").length);
        const postScreenshot = await page.screenshot({ fullPage: false });

        // A. DOM Node drop check (< 15% drop allowed)
        const domDropPercent = ((baseline.domCount - postDomCount) / baseline.domCount) * 100;
        if (domDropPercent > 15) {
          verificationPassed = false;
          verificationFailureReason = `DOM node count dropped significantly on ${path} (${baseline.domCount} -> ${postDomCount}, drop of ${domDropPercent.toFixed(1)}%)`;
          await page.close();
          break;
        }

        // B. CPU-based Pixel Diffing (< 2% variance allowed)
        const img1 = PNG.sync.read(baseline.screenshot);
        const img2 = PNG.sync.read(postScreenshot);
        const { width, height } = img1;

        if (img2.width !== width || img2.height !== height) {
          verificationPassed = false;
          verificationFailureReason = `Viewport dimension mismatch on ${path} post-update (Expected: ${width}x${height}, Actual: ${img2.width}x${img2.height})`;
          await page.close();
          break;
        }

        const diff = new PNG({ width, height });
        const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });
        const variancePercent = (diffPixels / (width * height)) * 100;

        console.log(`[Safe Update] Path ${path} pixel variance: ${variancePercent.toFixed(2)}%`);
        if (variancePercent >= 2.0) {
          verificationPassed = false;
          verificationFailureReason = `Visual regression threshold exceeded on ${path}: ${variancePercent.toFixed(2)}% pixel mismatch`;
          await page.close();
          break;
        }

      } catch (err: any) {
        verificationPassed = false;
        verificationFailureReason = `Visual verification failed on ${path}: ${err.message}`;
        await page.close();
        break;
      } finally {
        await page.close();
      }
    }
  }

  // 3. Log Scraping Verification
  if (verificationPassed) {
    console.log(`[Safe Update] Scraping site debug.log for errors`);
    // We execute read_debug_log via MCP endpoints
    // Note: since executeMcpActionOnSite returns boolean, we'd rather fetch the log details.
    // Wait, executeMcpActionOnSite can be modified to return output, or we make a direct fetch to the execute endpoint to inspect the payload.
    // Let's implement a clean log fetch inside safeUpdateVerifier.
    try {
      const siteSecret = site.siteSecretCiphertext; // Decrypting it
      // Let's use custom execution method to read the logs from MCPEndpoints
      const siteSecretDecrypted = await decryptSecretHelper(site.siteSecretCiphertext);
      const res = await callMcpAction(siteId, siteUrl, "read_debug_log", "", siteSecretDecrypted);
      
      if (res && res.success && res.log) {
        const logContent = res.log;
        // Regex parse for timestamps or errors occurring after updateStartTime
        // WordPress logs typically have timestamp format like: [12-Jul-2026 00:30:10 UTC]
        const errorRegex = /(Fatal error|Parse error|Uncaught TypeError|Call to undefined function)/i;
        
        // Find errors in log file
        const lines = logContent.split("\n");
        let foundFatal = false;
        let fatalMessage = "";

        for (const line of lines) {
          if (errorRegex.test(line)) {
            // Check if log contains timestamp to see if it occurred after updateStartTime
            const match = line.match(/^\[([^\]]+)\]/);
            if (match && match[1]) {
              const logTime = Date.parse(match[1]);
              if (!isNaN(logTime) && logTime >= updateStartTime) {
                foundFatal = true;
                fatalMessage = line;
                break;
              }
            } else {
              // No timestamp, treat as potential match
              foundFatal = true;
              fatalMessage = line;
              break;
            }
          }
        }

        if (foundFatal) {
          verificationPassed = false;
          verificationFailureReason = `New Fatal error detected in debug.log: ${fatalMessage}`;
        }
      }
    } catch (err: any) {
      console.warn(`[Safe Update] Debug log check bypassed: ${err.message}`);
    }
  }

  await context.close();

  if (verificationPassed) {
    await db.insert(auditLog).values({
      siteId,
      eventType: "update_verified",
      actor: "system",
      summary: `Verification checks passed for ${type}: ${slug}`,
    });
  }

  // --- STAGE 5: Rollback vs Cleanup Routing ---
  if (!verificationPassed) {
    console.warn(`[Safe Update] Verification FAILED: ${verificationFailureReason}.`);
    
    let rollbackSuccess = false;
    if (type === "theme") {
      console.warn(`[Safe Update] Theme rollback is not supported. Skipping.`);
    } else {
      // Execute Rollback via MCP using callMcpAction to supply decrypted secret and verification failure reason
      try {
        const siteSecretDecrypted = await decryptSecretHelper(site.siteSecretCiphertext);
        const mcpRes = await callMcpAction(siteId, siteUrl, "rollback_plugin", slug, siteSecretDecrypted, verificationFailureReason);
        rollbackSuccess = !!mcpRes?.success;
      } catch (err: any) {
        console.error(`[Safe Update] Rollback MCP execution failed: ${err.message}`);
      }
    }

    await db.insert(auditLog).values({
      siteId,
      eventType: "update_failed",
      actor: "system",
      summary: type === "theme"
        ? `Update Failed for theme: ${slug}. Reason: ${verificationFailureReason}.`
        : (rollbackSuccess
            ? `Update Failed -> Automated Rollback Successful. Reason: ${verificationFailureReason} for plugin: ${slug}`
            : `Update Failed -> Automated Rollback FAILED. Reason: ${verificationFailureReason} for plugin: ${slug}. Manual intervention required!`),
      evidence: { reason: verificationFailureReason, rollbackSuccess },
    });
  } else {
    console.log(`[Safe Update] Verification PASSED. Cleaning up temp backups and syncing.`);
    
    // Execute Cleanup via MCP using callMcpAction
    try {
      const siteSecretDecrypted = await decryptSecretHelper(site.siteSecretCiphertext);
      if (type !== "theme") {
        await callMcpAction(siteId, siteUrl, "cleanup_plugin", slug, siteSecretDecrypted);
      }
      // Force sync updates immediately to update local DB version inventory
      await callMcpAction(siteId, siteUrl, "sync_updates", "", siteSecretDecrypted);
    } catch (err: any) {
      console.error(`[Safe Update] Cleanup or Sync MCP execution failed: ${err.message}`);
    }

    await db.insert(auditLog).values({
      siteId,
      eventType: "update_success",
      actor: "system",
      summary: `Safe Update completed successfully for ${type}: ${slug}`,
    });
  }
};

// Helpers for manual MCP calls inside worker
import { decryptSiteSecret, loadSiteSecretEncryptionKey, signPayload } from "@syntaxwp/shared";
import crypto from "node:crypto";
import { env } from "../../env.js";

const encryptionKey = loadSiteSecretEncryptionKey(env.SITE_SECRET_ENCRYPTION_KEY);

async function decryptSecretHelper(cipherText: string): Promise<string> {
  return decryptSiteSecret(cipherText, encryptionKey);
}

async function callMcpAction(siteId: string, url: string, action: string, target: string, secret: string, reason?: string): Promise<any> {
  const nonce = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const ability = `syntaxwp/${action.replace(/_/g, "-")}`;
  const unsignedPayload = {
    ability,
    input: {
      target,
      ...(reason ? { reason } : {}),
    },
    timestamp,
    nonce,
  };
  const hmac = signPayload(unsignedPayload, secret);

  const res = await fetch(`${url}/wp-json/syntaxwp/v1/mcp/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...unsignedPayload, hmac }),
  });

  if (res.ok) {
    return res.json();
  }
  throw new Error(`HTTP ${res.status}`);
}
