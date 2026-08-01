<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Safety;

use SyntaxWP\Plugin\Core\PluginSlug;

/**
 * 6-Stage Safe Update Pipeline Helper
 * 
 * Implements Stage 1, 2, 3, and 5 for atomic updates.
 */
final class SafeUpdate
{
    private const IGNORE_LIST_OPTION = 'syntaxwp_ignore_list';
    private const PRE_UPDATE_OPTIONS_OPTION = 'syntaxwp_pre_update_options';
    private const PRE_UPDATE_SCHEMA_OPTION = 'syntaxwp_pre_update_schema';
    private const BACKUP_DOWNLOAD_URL_OPTION = 'syntaxwp_backup_download_url';
    private const TARGETED_SQL_PATH_OPTION = 'syntaxwp_targeted_sql_path';

    private static string $activeSlug = '';
    private static array $backedUpTables = [];

    /**
     * Stage 1: Pre-flight checks and Routing
     * 
     * @param string $slug
     * @return array{success: bool, reason?: string, backup_type?: string}
     */
    public static function preFlight(string $slug): array
    {
        // 1. Ignore List Check
        $ignoreList = get_option(self::IGNORE_LIST_OPTION, []);
        if (in_array($slug, $ignoreList, true)) {
            return [
                'success' => false,
                'reason' => 'Skipped: User Exclusion'
            ];
        }

        // Find plugin file
        $pluginFile = PluginSlug::toFile($slug);
        if ($pluginFile === null) {
            return [
                'success' => false,
                'reason' => 'Plugin not found'
            ];
        }

        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $plugins = get_plugins();
        $currentVersion = $plugins[$pluginFile]['Version'] ?? '0.0.0';

        // 2. WP.org Fast-Routing (Task 1: HEAD validation)
        $wpOrgApiUrl = "https://api.wordpress.org/plugins/info/1.0/{$slug}.json";
        $response = wp_remote_get($wpOrgApiUrl, ['timeout' => 5]);

        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (is_array($body) && isset($body['slug'])) {
                $downloadUrl = "https://downloads.wordpress.org/plugin/{$slug}.{$currentVersion}.zip";
                
                // Ping SVN HEAD
                $start = microtime(true);
                $headResponse = wp_remote_head($downloadUrl, ['timeout' => 3]);
                $latency = (microtime(true) - $start) * 1000;

                if (!is_wp_error($headResponse) && wp_remote_retrieve_response_code($headResponse) === 200 && $latency < 3000) {
                    update_option(self::BACKUP_DOWNLOAD_URL_OPTION . '_' . $slug, $downloadUrl, false);
                    return [
                        'success' => true,
                        'backup_type' => 'wporg_cloud'
                    ];
                }
            }
        }

        // 3. Fallback: Premium/Custom local backup
        $pluginDir = WP_PLUGIN_DIR . '/' . $slug;
        $backupDir = WP_PLUGIN_DIR . '/temp_backup_' . $slug;

        if (is_dir($pluginDir)) {
            self::deleteDir($backupDir);
            $copied = self::copyDir($pluginDir, $backupDir);
            if (!$copied) {
                return [
                    'success' => false,
                    'reason' => 'Local directory backup failed'
                ];
            }
            return [
                'success' => true,
                'backup_type' => 'local_filesystem'
            ];
        }

        return [
            'success' => false,
            'reason' => 'Plugin directory does not exist'
        ];
    }

    /**
     * Stage 2: Cache Purge & Capture Baseline
     */
    public static function purgeCaches(): void
    {
        // Purge WP Object Cache
        wp_cache_flush();

        // WP Rocket
        if (function_exists('rocket_clean_domain')) {
            rocket_clean_domain();
        }

        // W3 Total Cache
        if (function_exists('w3tc_flush_all')) {
            w3tc_flush_all();
        }

        // LiteSpeed Cache
        if (class_exists('LiteSpeed\Purge')) {
            \LiteSpeed\Purge::purge_all();
        }

        // Cloudflare CDN option based API purge
        $cfZoneId = get_option('syntaxwp_cloudflare_zone_id');
        $cfApiKey = get_option('syntaxwp_cloudflare_api_key');
        if ($cfZoneId && $cfApiKey) {
            wp_remote_post("https://api.cloudflare.com/client/v4/zones/{$cfZoneId}/purge_cache", [
                'headers' => [
                    'Authorization' => 'Bearer ' . $cfApiKey,
                    'Content-Type'  => 'application/json',
                ],
                'body' => json_encode(['purge_everything' => true]),
                'timeout' => 5,
            ]);
        }
    }

    /**
     * Stage 3: Snapshot DB Options and Schemas before update
     */
    public static function snapshotDbState(string $slug): void
    {
        global $wpdb;

        // 1. Snapshot options matching %_version%, %_db_version%, and option names matching slug
        $query = $wpdb->prepare(
            "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s OR option_name LIKE %s",
            '%_version%',
            '%_db_version%',
            '%' . $slug . '%'
        );
        $options = $wpdb->get_results($query, ARRAY_A);
        $optionSnapshot = [];
        if (is_array($options)) {
            foreach ($options as $opt) {
                $optionSnapshot[$opt['option_name']] = $opt['option_value'];
            }
        }
        update_option(self::PRE_UPDATE_OPTIONS_OPTION . '_' . $slug, $optionSnapshot, false);

        // 2. Snapshot table schema structures
        $tables = $wpdb->get_col("SHOW TABLES");
        $schemaSnapshot = [];
        if (is_array($tables)) {
            foreach ($tables as $table) {
                $cols = $wpdb->get_results("DESCRIBE {$table}", ARRAY_A);
                $schemaSnapshot[$table] = $cols;
            }
        }
        update_option(self::PRE_UPDATE_SCHEMA_OPTION . '_' . $slug, $schemaSnapshot, false);
    }

    /**
     * Stage 3: Post-update check for DB migrations & targeted DB backup
     */
    public static function checkMigrationAndBackup(string $slug): void
    {
        global $wpdb;

        $preOptions = get_option(self::PRE_UPDATE_OPTIONS_OPTION . '_' . $slug, []);
        $preSchema = get_option(self::PRE_UPDATE_SCHEMA_OPTION . '_' . $slug, []);

        // Snapshot current options
        $query = $wpdb->prepare(
            "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s OR option_name LIKE %s",
            '%_version%',
            '%_db_version%',
            '%' . $slug . '%'
        );
        $options = $wpdb->get_results($query, ARRAY_A);
        $currOptions = [];
        if (is_array($options)) {
            foreach ($options as $opt) {
                $currOptions[$opt['option_name']] = $opt['option_value'];
            }
        }

        // Compare options
        $optionsChanged = false;
        foreach ($currOptions as $k => $v) {
            if (!isset($preOptions[$k]) || $preOptions[$k] !== $v) {
                $optionsChanged = true;
                break;
            }
        }

        // Compare table schemas
        $tables = $wpdb->get_col("SHOW TABLES");
        $modifiedTables = [];

        if (is_array($tables)) {
            foreach ($tables as $table) {
                $cols = $wpdb->get_results("DESCRIBE {$table}", ARRAY_A);
                if (!isset($preSchema[$table])) {
                    // New table created
                    $modifiedTables[] = $table;
                } else {
                    // Compare columns definition
                    if (json_encode($cols) !== json_encode($preSchema[$table])) {
                        $modifiedTables[] = $table;
                    }
                }
            }
        }

        // If migration detected, take targeted sql backup
        if ($optionsChanged || !empty($modifiedTables)) {
            $sqlBackup = '';

            // For each modified/new table, dump schema and contents
            foreach ($modifiedTables as $table) {
                // If it's a pre-existing table that changed, write DDL to drop and recreate
                $sqlBackup .= "DROP TABLE IF EXISTS `{$table}`;\n";
                $createTable = $wpdb->get_row("SHOW CREATE TABLE `{$table}`", ARRAY_N);
                if ($createTable && isset($createTable[1])) {
                    $sqlBackup .= $createTable[1] . ";\n";
                }

                // Dump contents
                $rows = $wpdb->get_results("SELECT * FROM `{$table}`", ARRAY_A);
                if (is_array($rows) && !empty($rows)) {
                    foreach ($rows as $row) {
                        $keys = array_map(function($k) { return "`{$k}`"; }, array_keys($row));
                        $vals = array_map(function($v) use ($wpdb) {
                            if ($v === null) return 'NULL';
                            return "'" . esc_sql($v) . "'";
                        }, array_values($row));

                        $sqlBackup .= "INSERT INTO `{$table}` (" . implode(', ', $keys) . ") VALUES (" . implode(', ', $vals) . ");\n";
                    }
                }
            }

            if ($sqlBackup !== '') {
                $uploadDir = wp_upload_dir();
                $backupFile = $uploadDir['basedir'] . "/syntaxwp_db_backup_{$slug}.sql";
                file_put_contents($backupFile, $sqlBackup);
                update_option(self::TARGETED_SQL_PATH_OPTION . '_' . $slug, $backupFile, false);
            }
        }
    }

    /**
     * Stage 5: Zero-Tolerance Rollback
     */
    public static function executeRollback(string $slug, string $reason = ''): bool
    {
        global $wpdb;

        $success = true;

        // 1. File Restore
        $downloadUrl = get_option(self::BACKUP_DOWNLOAD_URL_OPTION . '_' . $slug);
        $pluginDir = WP_PLUGIN_DIR . '/' . $slug;
        $backupDir = WP_PLUGIN_DIR . '/temp_backup_' . $slug;

        if ($downloadUrl) {
            // Delete corrupt plugin
            self::deleteDir($pluginDir);

            // Download previous zip and extract
            require_once ABSPATH . 'wp-admin/includes/file.php';
            require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
            
            $tmpFile = download_url($downloadUrl, 60);
            if (!is_wp_error($tmpFile)) {
                $unzipped = unzip_file($tmpFile, WP_PLUGIN_DIR);
                @unlink($tmpFile);
                if (is_wp_error($unzipped)) {
                    $success = false;
                }
            } else {
                $success = false;
            }
        } elseif (is_dir($backupDir)) {
            // Restore from local directory
            self::deleteDir($pluginDir);
            $restored = rename($backupDir, $pluginDir);
            if (!$restored) {
                $success = false;
            }
        } else {
            $success = false;
        }

        // 2. DB Revert (Targeted SQL Import)
        $sqlFile = get_option(self::TARGETED_SQL_PATH_OPTION . '_' . $slug);
        if ($sqlFile && file_exists($sqlFile)) {
            $sql = file_get_contents($sqlFile);
            if ($sql) {
                // Split queries by semicolon + newline
                $queries = preg_split('/;\s*$/m', $sql);
                foreach ($queries as $query) {
                    $query = trim($query);
                    if ($query !== '') {
                        $wpdb->query($query);
                    }
                }
            }
            @unlink($sqlFile);
            delete_option(self::TARGETED_SQL_PATH_OPTION . '_' . $slug);
        }

        // Import pre-alteration SQL file (Task 2)
        $uploadDir = wp_upload_dir();
        $preAlterSqlFile = $uploadDir['basedir'] . '/syntaxwp-temp-db/' . $slug . '_rollback.sql';
        if (file_exists($preAlterSqlFile)) {
            $sql = file_get_contents($preAlterSqlFile);
            if ($sql) {
                // Split queries by semicolon + newline
                $queries = preg_split('/;\s*$/m', $sql);
                foreach ($queries as $query) {
                    $query = trim($query);
                    if ($query !== '') {
                        $wpdb->query($query);
                    }
                }
            }
            @unlink($preAlterSqlFile);
        }

        // 3. Restore Pre-update Option Values
        $preOptions = get_option(self::PRE_UPDATE_OPTIONS_OPTION . '_' . $slug);
        if (is_array($preOptions)) {
            foreach ($preOptions as $name => $val) {
                update_option($name, $val, false);
            }
        }

        // Restore pre-update option ledger (Task 2 Option Intercept)
        $ledger = get_option('syntaxwp_options_rollback_ledger_' . $slug);
        if (is_array($ledger)) {
            foreach ($ledger as $name => $val) {
                update_option($name, $val, false);
            }
            delete_option('syntaxwp_options_rollback_ledger_' . $slug);
        }

        // Clean option caches
        self::purgeCaches();

        // Dispatch status webhook payload to SaaS control plane
        if ($success) {
            self::reportWebhookEvent('update_failed_rollback', "Update Failed -> Automated Rollback Successful. Reason: " . ($reason ?: 'Visual verification or health check failed.'), ['slug' => $slug, 'reason' => $reason]);
        } else {
            self::reportWebhookEvent('update_failed_rollback_failed', "Update Failed -> Automated Rollback FAILED. Reason: " . ($reason ?: 'Visual verification or health check failed.'), ['slug' => $slug, 'reason' => $reason]);
        }

        return $success;
    }

    /**
     * Cleanup temporary files/options
     */
    public static function cleanup(string $slug): void
    {
        $backupDir = WP_PLUGIN_DIR . '/temp_backup_' . $slug;
        self::deleteDir($backupDir);

        $sqlFile = get_option(self::TARGETED_SQL_PATH_OPTION . '_' . $slug);
        if ($sqlFile && file_exists($sqlFile)) {
            @unlink($sqlFile);
        }

        $uploadDir = wp_upload_dir();
        $preAlterSqlFile = $uploadDir['basedir'] . '/syntaxwp-temp-db/' . $slug . '_rollback.sql';
        if (file_exists($preAlterSqlFile)) {
            @unlink($preAlterSqlFile);
        }

        delete_option(self::BACKUP_DOWNLOAD_URL_OPTION . '_' . $slug);
        delete_option(self::TARGETED_SQL_PATH_OPTION . '_' . $slug);
        delete_option(self::PRE_UPDATE_OPTIONS_OPTION . '_' . $slug);
        delete_option(self::PRE_UPDATE_SCHEMA_OPTION . '_' . $slug);
        delete_option('syntaxwp_options_rollback_ledger_' . $slug);

        // Dispatch success webhook payload to SaaS control plane
        self::reportWebhookEvent('update_success', "Safe Update completed successfully for plugin: {$slug}", ['slug' => $slug]);
    }

    public static function registerPreUpdateHooks(string $slug): void
    {
        self::$activeSlug = $slug;
        self::$backedUpTables = [];
        
        add_filter('dbdelta_queries', [self::class, 'interceptDbDeltaQueries'], 10, 1);
        add_action('pre_update_option', [self::class, 'interceptOptionUpdate'], 10, 3);
    }

    public static function removePreUpdateHooks(): void
    {
        remove_filter('dbdelta_queries', [self::class, 'interceptDbDeltaQueries'], 10);
        remove_action('pre_update_option', [self::class, 'interceptOptionUpdate'], 10);
    }

    public static function interceptDbDeltaQueries(array $queries): array
    {
        global $wpdb;

        foreach ($queries as $query) {
            $tableName = '';
            if (preg_match('/(?:CREATE\s+TABLE|ALTER\s+TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/i', $query, $matches)) {
                $tableName = $matches[1];
            }

            if ($tableName !== '' && !in_array($tableName, self::$backedUpTables, true)) {
                $tableExists = $wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $tableName));
                if ($tableExists) {
                    self::backupTable($tableName);
                    self::$backedUpTables[] = $tableName;
                }
            }
        }

        return $queries;
    }

    private static function backupTable(string $table): void
    {
        global $wpdb;

        $uploadDir = wp_upload_dir();
        $dir = $uploadDir['basedir'] . '/syntaxwp-temp-db';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $filePath = $dir . '/' . self::$activeSlug . '_rollback.sql';

        $sql = "DROP TABLE IF EXISTS `{$table}`;\n";
        $createTable = $wpdb->get_row("SHOW CREATE TABLE `{$table}`", ARRAY_N);
        if ($createTable && isset($createTable[1])) {
            $sql .= $createTable[1] . ";\n";
        }
        file_put_contents($filePath, $sql, FILE_APPEND);

        $limit = 500;
        $offset = 0;
        while (true) {
            $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM `{$table}` LIMIT %d OFFSET %d", $limit, $offset), ARRAY_A);
            if (empty($rows)) {
                break;
            }
            $insertSql = '';
            foreach ($rows as $row) {
                $keys = array_map(function($k) { return "`{$k}`"; }, array_keys($row));
                $vals = array_map(function($v) use ($wpdb) {
                    if ($v === null) return 'NULL';
                    return "'" . esc_sql($v) . "'";
                }, array_values($row));
                $insertSql .= "INSERT INTO `{$table}` (" . implode(', ', $keys) . ") VALUES (" . implode(', ', $vals) . ");\n";
            }
            file_put_contents($filePath, $insertSql, FILE_APPEND);
            $offset += $limit;
        }
    }    public static function interceptOptionUpdate($value, string $option, $oldValue)
    {
        $ledgerKey = 'syntaxwp_options_rollback_ledger_' . self::$activeSlug;
        if ($option === $ledgerKey) {
            return $value;
        }

        $matchesVersion = (strpos($option, 'version') !== false || strpos($option, 'db_version') !== false);
        $matchesPlugin = (self::$activeSlug !== '' && strpos($option, self::$activeSlug) !== false);

        if ($matchesVersion || $matchesPlugin) {
            $ledger = get_option($ledgerKey, []);
            if (!is_array($ledger)) {
                $ledger = [];
            }
            if (!array_key_exists($option, $ledger)) {
                $ledger[$option] = $oldValue;
                update_option($ledgerKey, $ledger, false);
            }
        }

        return $value;
    }
    private static function copyDir(string $src, string $dst): bool
    {
        $dir = @opendir($src);
        if ($dir === false) {
            return false;
        }
        @mkdir($dst, 0755, true);
        while (($file = readdir($dir)) !== false) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $srcFile = $src . '/' . $file;
            $dstFile = $dst . '/' . $file;
            if (is_dir($srcFile)) {
                self::copyDir($srcFile, $dstFile);
            } else {
                @copy($srcFile, $dstFile);
            }
        }
        closedir($dir);
        return true;
    }

    private static function deleteDir(string $dirPath): bool
    {
        if (!is_dir($dirPath)) {
            return false;
        }
        if (substr($dirPath, -1) !== '/') {
            $dirPath .= '/';
        }
        $files = glob($dirPath . '*', GLOB_MARK);
        if (is_array($files)) {
            foreach ($files as $file) {
                if (is_dir($file)) {
                    self::deleteDir($file);
                } else {
                    @unlink($file);
                }
            }
        }
        @rmdir($dirPath);
        return true;
    }

    public static function reportWebhookEvent(string $type, string $summary, array $evidence = []): void
    {
        $siteId = get_option('syntaxwp_site_id');
        $secret = get_option('syntaxwp_site_secret');
        if (!$siteId || !$secret) {
            return;
        }

        $event = array_merge([
            'type' => $type,
            'summary' => $summary,
        ], $evidence);

        $payload = [
            'site_id' => $siteId,
            'timestamp' => time(),
            'nonce' => function_exists('wp_generate_uuid4') ? wp_generate_uuid4() : uniqid('', true),
            'events' => [$event],
        ];
        $payload['hmac'] = \SyntaxWP\Plugin\Core\Hmac::sign($payload, (string) $secret);

        $base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');
        wp_remote_post(
            rtrim((string) $base, '/') . '/api/sites/' . $siteId . '/events',
            [
                'body' => wp_json_encode($payload),
                'headers' => ['Content-Type' => 'application/json'],
                'timeout' => 5,
                'blocking' => false,
            ]
        );
    }
}
