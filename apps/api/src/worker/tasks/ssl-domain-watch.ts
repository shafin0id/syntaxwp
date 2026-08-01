import type { Task } from "graphile-worker";
import { db } from "@syntaxwp/db";
import { sites } from "@syntaxwp/db";
import { eq } from "drizzle-orm";
import tls from "node:tls";

function checkCertificate(host: string): Promise<{ valid: boolean; expiresAt: Date | null; daysUntilExpiry: number; issuer: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false, // get cert details even if self-signed/expired
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          resolve({ valid: false, expiresAt: null, daysUntilExpiry: 0, issuer: "Unknown" });
          return;
        }
        const expiresAt = new Date(cert.valid_to);
        const now = new Date();
        const diffMs = expiresAt.getTime() - now.getTime();
        const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const authorized = socket.authorized;
        resolve({
          valid: authorized,
          expiresAt,
          daysUntilExpiry,
          issuer: typeof cert.issuer === "string" ? cert.issuer : cert.issuer?.O || "Unknown",
        });
      }
    );

    // Set connection timeout (5 seconds)
    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ valid: false, expiresAt: null, daysUntilExpiry: 0, issuer: "Timeout" });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ valid: false, expiresAt: null, daysUntilExpiry: 0, issuer: "Error: " + err.message });
    });
  });
}

async function getDomainExpiry(domain: string): Promise<Date | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(10000), // safety timeout
    });
    if (!res.ok) {
      console.warn(`RDAP query failed for ${domain}: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as any;
    const events = json.events || [];
    const expirationEvent = events.find((e: any) => e.eventAction === "expiration");
    if (expirationEvent && expirationEvent.eventDate) {
      return new Date(expirationEvent.eventDate);
    }
  } catch (err: any) {
    console.error(`RDAP parsing failed for ${domain}:`, err.message);
  }
  return null;
}

export const sslDomainWatch: Task = async () => {
  console.log("Starting SSL and Domain watch daily check...");

  const allSites = await db.select().from(sites);

  for (const site of allSites) {
    try {
      const urlObj = new URL(site.url);
      const host = urlObj.hostname;

      // Skip local development hosts or raw IP addresses
      const isLocal =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".local") ||
        /^(\d{1,3}\.){3}\d{1,3}$/.test(host);

      if (isLocal) {
        console.log(`Skipping SSL/Domain checks for local site: ${site.url}`);
        continue;
      }

      console.log(`Checking SSL and Domain for host: ${host}`);

      const certInfo = await checkCertificate(host);
      const domainExpiry = await getDomainExpiry(host);

      console.log(`Host: ${host} | SSL Valid: ${certInfo.valid}, Expires: ${certInfo.expiresAt} | Domain Expires: ${domainExpiry}`);

      // Safe DB Update: do not overwrite previously known valid dates with null/epoch on transient network failure
      const updates: Record<string, any> = {};
      if (certInfo.expiresAt !== null) {
        updates.sslExpiresAt = certInfo.expiresAt;
      }
      if (domainExpiry !== null) {
        updates.domainExpiresAt = domainExpiry;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(sites)
          .set(updates)
          .where(eq(sites.id, site.id));
      }
    } catch (err: any) {
      console.error(`Error checking SSL/Domain for site ${site.url}:`, err.message);
    }
  }

  console.log("SSL and Domain watch check complete.");
};
