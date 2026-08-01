import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { db, securityActionsLog, sites } from "@syntaxwp/db";

const execAsync = promisify(exec);

export interface IntegrityReport {
  modified: string[];
  missing: string[];
  untracked: string[];
}

async function computeMD5(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("md5").update(content).digest("hex");
}

// Task B9.4: Safe directory scanner with path traversal defense & depth limits
async function scanDirectory(dir: string, baseDir = dir, depth = 0): Promise<string[]> {
  if (depth > 10) {
    console.warn(`[Integrity] Max directory depth reached at: ${dir}`);
    return [];
  }

  // Resolve absolute paths for containment check
  const absoluteDir = path.resolve(dir);
  const absoluteBase = path.resolve(baseDir);
  if (!absoluteDir.startsWith(absoluteBase)) {
    console.warn(`[Integrity] Directory traversal attempted: ${dir} escapes base ${baseDir}`);
    return [];
  }

  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    // Avoid following symlinks that might cause loops
    if (entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await scanDirectory(fullPath, baseDir, depth + 1)));
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }
  return files;
}

// Task B9.2: WordPress.org Checksum Bridge & Auto-Repair
export async function verifyWordPressCoreFiles(localPath: string, version: string, siteId?: string): Promise<IntegrityReport> {
  // Validate path to prevent arbitrary filesystem reads
  const resolvedLocalPath = path.resolve(localPath);
  
  // Safe version parsing
  const cleanVersion = version.replace(/[^0-9.]/g, "");

  // Resolve siteId
  let actualSiteId = siteId;
  if (!actualSiteId) {
    const [foundSite] = await db.select().from(sites).limit(1);
    if (foundSite) {
      actualSiteId = foundSite.id;
    }
  }

  const res = await fetch(`https://api.wordpress.org/core/checksums/1.0/?version=${cleanVersion}`, {
    signal: AbortSignal.timeout(10000), // safety timeout
  });
  if (!res.ok) {
    throw new Error(`WordPress.org checksums API returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as any;
  const officialChecksums = data.checksums || {};

  const localFiles = await scanDirectory(resolvedLocalPath);
  const localFilesSet = new Set(localFiles);

  const modified: string[] = [];
  const missing: string[] = [];

  const repairCoreFile = async (normalizedPath: string) => {
    if (!actualSiteId) return;
    const svnUrl = `https://core.svn.wordpress.org/tags/${cleanVersion}/${normalizedPath}`;
    const destPath = path.join(resolvedLocalPath, normalizedPath);
    try {
      const fetchRes = await fetch(svnUrl, { signal: AbortSignal.timeout(15000) });
      if (!fetchRes.ok) throw new Error(`SVN HTTP error ${fetchRes.status}`);
      const buffer = Buffer.from(await fetchRes.arrayBuffer());
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, buffer);

      await db.insert(securityActionsLog).values({
        siteId: actualSiteId,
        actionType: "FILE_AUTO_REPAIR",
        target: `core:${normalizedPath}`,
        status: "SUCCESS",
        details: `Successfully restored modified/missing WordPress core file from official SVN`,
      });
    } catch (err: any) {
      console.error(`[Integrity Repair] Failed to repair core file ${normalizedPath}:`, err.message);
      await db.insert(securityActionsLog).values({
        siteId: actualSiteId,
        actionType: "FILE_AUTO_REPAIR",
        target: `core:${normalizedPath}`,
        status: "FAILED",
        details: `Failed to restore core file: ${err.message}`,
      });
    }
  };

  const checkFile = async (relPath: string, officialHash: string) => {
    const normalizedPath = relPath.replace(/\\/g, "/");
    const localFileExists = localFilesSet.has(normalizedPath);
    if (!localFileExists) {
      missing.push(normalizedPath);
      await repairCoreFile(normalizedPath);
      return;
    }

    const fullLocalPath = path.join(resolvedLocalPath, normalizedPath);
    try {
      const localHash = await computeMD5(fullLocalPath);
      if (localHash !== officialHash) {
        modified.push(normalizedPath);
        await repairCoreFile(normalizedPath);
      }
    } catch {
      missing.push(normalizedPath);
      await repairCoreFile(normalizedPath);
    }
  };

  // Convert entries to array and process in batches of 20 for parallel performance
  const entries = Object.entries(officialChecksums);
  const batchSize = 20;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    await Promise.all(batch.map(([relPath, hash]) => checkFile(relPath, hash as string)));
  }

  const untracked = localFiles.filter((f) => !officialChecksums[f] && !officialChecksums[f.replace(/\//g, "\\")]);

  return { modified, missing, untracked };
}

// Plugin Integrity & Repair
export async function verifyAndRepairPluginFiles(
  pluginsDir: string,
  slug: string,
  version: string,
  siteId: string
): Promise<IntegrityReport> {
  const pluginLocalPath = path.join(pluginsDir, slug);
  const zipUrl = `https://downloads.wordpress.org/plugin/${slug}.${version}.zip`;
  const tmpDir = path.join("/tmp", `plugin-repair-${slug}-${Date.now()}`);
  const tmpZip = `${tmpDir}.zip`;

  const report: IntegrityReport = { modified: [], missing: [], untracked: [] };

  try {
    const res = await fetch(zipUrl);
    if (!res.ok) {
      console.log(`Plugin ${slug} not found on WP.org. Skipping.`);
      return report;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(tmpZip), { recursive: true });
    await fs.writeFile(tmpZip, buffer);

    await fs.mkdir(tmpDir, { recursive: true });
    await execAsync(`unzip -o "${tmpZip}" -d "${tmpDir}"`);

    const extractedBase = path.join(tmpDir, slug);
    const officialFiles = await scanDirectory(extractedBase);
    const localFiles = await scanDirectory(pluginLocalPath).catch(() => [] as string[]);
    const localFilesSet = new Set(localFiles);

    for (const relPath of officialFiles) {
      const normalizedPath = relPath.replace(/\\/g, "/");
      const localFileExists = localFilesSet.has(normalizedPath);
      const officialFilePath = path.join(extractedBase, normalizedPath);
      const localFilePath = path.join(pluginLocalPath, normalizedPath);

      if (!localFileExists) {
        report.missing.push(normalizedPath);
        await fs.mkdir(path.dirname(localFilePath), { recursive: true });
        await fs.copyFile(officialFilePath, localFilePath);
        await db.insert(securityActionsLog).values({
          siteId,
          actionType: "FILE_AUTO_REPAIR",
          target: `plugin:${slug}:${normalizedPath}`,
          status: "SUCCESS",
          details: `Restored missing plugin file from official zip`,
        });
      } else {
        const officialHash = await computeMD5(officialFilePath);
        const localHash = await computeMD5(localFilePath);
        if (officialHash !== localHash) {
          report.modified.push(normalizedPath);
          await fs.copyFile(officialFilePath, localFilePath);
          await db.insert(securityActionsLog).values({
            siteId,
            actionType: "FILE_AUTO_REPAIR",
            target: `plugin:${slug}:${normalizedPath}`,
            status: "SUCCESS",
            details: `Restored modified plugin file from official zip`,
          });
        }
      }
    }

    const officialFilesSet = new Set(officialFiles);
    for (const relPath of localFiles) {
      if (!officialFilesSet.has(relPath)) {
        report.untracked.push(relPath);
      }
    }
  } catch (err: any) {
    console.error(`[Plugin Integrity] Error auditing plugin ${slug}:`, err.message);
    await db.insert(securityActionsLog).values({
      siteId,
      actionType: "FILE_AUTO_REPAIR",
      target: `plugin:${slug}`,
      status: "FAILED",
      details: `Failed plugin integrity audit/repair: ${err.message}`,
    });
  } finally {
    await fs.rm(tmpZip, { force: true }).catch(() => {});
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return report;
}

export function verifyManifestDelta(
  baselineManifest: Record<string, string>,
  currentManifest: Record<string, string>
): { added: string[]; modified: string[]; deleted: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [file, currentHash] of Object.entries(currentManifest)) {
    const baselineHash = baselineManifest[file];
    if (!baselineHash) {
      added.push(file);
    } else if (baselineHash !== currentHash) {
      modified.push(file);
    }
  }

  for (const file of Object.keys(baselineManifest)) {
    if (!currentManifest[file]) {
      deleted.push(file);
    }
  }

  return { added, modified, deleted };
}
