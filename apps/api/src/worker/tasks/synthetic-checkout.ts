import type { Task } from "graphile-worker";
import { db } from "@syntaxwp/db";
import { sites, incidents } from "@syntaxwp/db";
import { eq, and } from "drizzle-orm";
import { estimateRevenueLoss } from "@syntaxwp/shared";
import { getBrowser } from "../browser-pool.js";

export const syntheticCheckoutCheck: Task = async () => {
  console.log("Starting synthetic checkout checks...");

  const wooSites = await db.select().from(sites).where(eq(sites.wooEnabled, true));

  if (wooSites.length === 0) {
    console.log("No WooCommerce-enabled sites to scan.");
    return;
  }

  // Get shared browser instance
  let browser;
  try {
    browser = await getBrowser();
  } catch (err: any) {
    console.error("Failed to launch or get Chromium browser:", err.message);
    return;
  }

  for (const site of wooSites) {
    let context = null;
    let page = null;
    try {
      console.log(`Running synthetic checkout check for site: ${site.url}`);
      
      context = await browser.newContext();
      page = await context.newPage();

      // Track console errors
      const consoleErrors: string[] = [];
      page.on("pageerror", (err: Error) => {
        consoleErrors.push(err.message);
      });
      page.on("console", (msg: any) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      const checkoutUrl = new URL("/checkout", site.url).toString();
      
      // Navigate to checkout page
      const response = await page.goto(checkoutUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const status = response?.status() || 0;
      if (status !== 200) {
        throw new Error(`Checkout page returned HTTP ${status}`);
      }

      // Assert common WooCommerce elements are present using combined selector
      const combinedSelector = ".woocommerce-checkout, form.checkout, .wc-block-checkout, #payment, #place_order, [name='billing_first_name']";
      const hasWoo = await page.$(combinedSelector);

      if (!hasWoo) {
        throw new Error("Could not find WooCommerce checkout fields or form on page.");
      }

      // Check for Stripe / PayPal elements if checkout loaded
      const stripeFields = await page.$("[name='stripe-card-element'], .stripe-source, iframe[src*='stripe.com']");
      console.log(`WooCommerce checkout loaded successfully. Stripe fields/iframe present: ${!!stripeFields}`);

      // If we got here, checkout is healthy
      console.log(`Checkout check passed for site: ${site.url}`);

      // Auto-resolve any open checkout failure incidents for this site
      const openIncidents = await db
        .select()
        .from(incidents)
        .where(
          and(
            eq(incidents.siteId, site.id),
            eq(incidents.type, "checkout_failure"),
            eq(incidents.status, "open")
          )
        );

      for (const incident of openIncidents) {
        await db
          .update(incidents)
          .set({ status: "resolved", resolvedAt: new Date() })
          .where(eq(incidents.id, incident.id));
        console.log(`Auto-resolved incident ${incident.id} for site: ${site.url}`);
      }

    } catch (err: any) {
      console.error(`Checkout verification failed for site ${site.url}:`, err.message);

      // Estimate revenue loss using dynamic AOV
      const detectedAt = new Date();
      const loss = estimateRevenueLoss(site.avgOrderValue ?? 79, 10, detectedAt);

      const fingerprint = `${site.id}_checkout_failure_${Math.floor(Date.now() / (3600 * 1000))}`;
      
      await db
        .insert(incidents)
        .values({
          siteId: site.id,
          fingerprint,
          type: "checkout_failure",
          severity: "high", // High severity for checkout failures
          status: "open",
          class: "client",
          rootCause: "Checkout Form Loading Failure",
          plainEnglish: `WooCommerce checkout page is failing to load or render form fields correctly: ${err.message}. Estimated revenue loss: $${loss}.`,
          confidence: 0.98,
        })
        .onConflictDoNothing();
    } finally {
      if (page) {
        await page.close();
      }
      if (context) {
        await context.close();
      }
    }
  }

  console.log("Synthetic checkout checks complete.");
};
