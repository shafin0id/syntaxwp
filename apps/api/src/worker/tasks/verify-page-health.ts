import { db } from "@syntaxwp/db";
import { sites } from "@syntaxwp/db";
import { eq } from "drizzle-orm";
import { getBrowser } from "../browser-pool.js";

export async function verifyPageHealth(siteId: string, targetUrl: string): Promise<boolean> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new Error("Site not found");

  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors: string[] = [];
  page.on("pageerror", (err: Error) => errors.push(err.message));

  try {
    console.log(`[Playwright] Verifying url: ${targetUrl}`);
    
    // Simulate WP Admin Login if credentials present
    if (site.wpAdminUser && site.wpAdminPassword) {
      const loginUrl = new URL("/wp-login.php", site.url).toString();
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      
      const userField = await page.$("#user_login");
      const passField = await page.$("#user_pass");
      if (userField && passField) {
        await userField.fill(site.wpAdminUser);
        await passField.fill(site.wpAdminPassword);
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }),
          page.click("#wp-submit"),
        ]);
      }
    }

    const res = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    const status = res?.status() || 0;
    
    if (status >= 500) {
      console.log(`[Playwright] URL threw HTTP ${status}`);
      return false;
    }

    const html = await page.content();
    // WSOD detection
    if (html.trim().length < 500 || /Fatal error/i.test(html) || /crashed/i.test(html) || /Parse error/i.test(html) || /Call to undefined function/i.test(html)) {
      console.log("[Playwright] WSOD or Fatal/Parse Error detected in HTML payload.");
      return false;
    }

    if (errors.length > 0) {
      console.log(`[Playwright] Detected ${errors.length} uncaught Javascript errors:`, errors);
      return false;
    }

    return true;
  } catch (err: any) {
    console.warn(`[Playwright] Navigation check failed: ${err.message}`);
    return false;
  } finally {
    await page.close();
    await context.close();
  }
}

