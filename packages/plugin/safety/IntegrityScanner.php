<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Safety;

/**
 * Local core-file checksum audit + auto-repair (§8, §12.1-12.2). Runs
 * client-side because it has to: the control plane is a remote SaaS
 * process with no filesystem access to any client site (P2 — client
 * content never leaves the client's server), so only the plugin itself
 * can read ABSPATH and compare it against WordPress.org's official
 * checksums. The control plane's job is only to trigger this (via the
 * `verify_core_integrity` ability/work order) and record whatever result
 * comes back.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class IntegrityScanner
{
    /**
     * @param string|null $basePath Defaults to ABSPATH; overridable so tests
     *                              don't need a real WordPress install on disk.
     * @return array<string, mixed>
     */
    public static function verifyCoreFiles(?string $basePath = null): array
    {
        global $wp_version;
        $version = (string) $wp_version;
        $basePath = $basePath ?? ABSPATH;

        $checksums = self::fetchOfficialChecksums($version);
        if ($checksums === null) {
            return ['success' => false, 'action' => 'verify_core_integrity', 'reason' => 'checksum_fetch_failed'];
        }

        $modified = [];
        $missing = [];
        $repaired = [];
        $repairFailed = [];

        foreach ($checksums as $relPath => $officialHash) {
            $localPath = $basePath . $relPath;

            if (!file_exists($localPath)) {
                $missing[] = $relPath;
                self::repairFile($relPath, $version, $basePath) ? $repaired[] = $relPath : $repairFailed[] = $relPath;
                continue;
            }

            if (md5_file($localPath) !== $officialHash) {
                $modified[] = $relPath;
                self::repairFile($relPath, $version, $basePath) ? $repaired[] = $relPath : $repairFailed[] = $relPath;
            }
        }

        return [
            'success' => true,
            'action' => 'verify_core_integrity',
            'wp_version' => $version,
            'modified' => $modified,
            'missing' => $missing,
            'repaired' => $repaired,
            'repair_failed' => $repairFailed,
        ];
    }

    /**
     * @return array<string, string>|null Flat map of relative path => official MD5.
     */
    private static function fetchOfficialChecksums(string $version): ?array
    {
        $response = wp_remote_get(
            sprintf(
                'https://api.wordpress.org/core/checksums/1.0/?version=%s&locale=en_US',
                rawurlencode($version)
            ),
            ['timeout' => 10]
        );

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        $checksums = $body['checksums'] ?? null;

        return is_array($checksums) ? $checksums : null;
    }

    /**
     * Overwrites a single core file with the byte-identical official
     * version from WordPress.org's SVN tag for this release — deterministic
     * restoration, never arbitrary content.
     */
    private static function repairFile(string $relPath, string $version, string $basePath): bool
    {
        $url = sprintf(
            'https://core.svn.wordpress.org/tags/%s/%s',
            rawurlencode($version),
            $relPath
        );

        $response = wp_remote_get($url, ['timeout' => 15]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return false;
        }

        $destPath = $basePath . $relPath;
        $dir = dirname($destPath);
        if (!is_dir($dir)) {
            wp_mkdir_p($dir);
        }

        return (bool) file_put_contents($destPath, wp_remote_retrieve_body($response));
    }
}
