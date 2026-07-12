<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Wp7;

use SyntaxWP\Plugin\Core\PluginSlug;
use SyntaxWP\Plugin\Safety\SafeUpdate;

/**
 * Executes a whitelisted action (§4.1, §4.2). Named `wp7/ActionExecutor`
 * per the plan's own file tree ("execute actions via WP7 native APIs"),
 * but in practice none of the 4 actions implemented so far
 * (flush_cache/clear_transients/activate_plugin/deactivate_plugin) have a
 * WP7-specific execution mechanism distinct from the legacy path's own
 * calls — `wp_cache_flush()`, `activate_plugin()`, etc. are plain,
 * long-standing WP core functions, not WP7-exclusive ones. The real
 * distinction the architecture doc draws between the two paths is
 * *discovery* (MCP-invoked vs. outbound-polling-claimed), not execution,
 * so this class is the single execution authority both
 * `core/WorkOrderPoller.php` (legacy) and `wp7/AbilitiesRegistrar.php`
 * (native) delegate to — one implementation of "how to flush the cache",
 * not two that could drift.
 *
 * Same 4-action scope as WorkOrderPoller originally had before this
 * extraction, for the same reasons documented there: every other
 * whitelisted action gets an honest `not_implemented` result rather than
 * a fragile guess.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class ActionExecutor
{
    /**
     * @return array<string, mixed>
     */
    public function execute(string $action, string $target = '', string $reason = ''): array
    {
        switch ($action) {
            case 'flush_cache':
                return $this->flushCache();

            case 'clear_transients':
                return $this->clearTransients();

            case 'activate_plugin':
                return $this->togglePlugin('activate_plugin', $target);

            case 'deactivate_plugin':
                return $this->togglePlugin('deactivate_plugin', $target);

            case 'update_plugin':
                return $this->updatePlugin($target);

            case 'autoload_audit':
                return $this->autoloadAudit();

            case 'rollback_plugin':
                return ['success' => SafeUpdate::executeRollback($target, $reason), 'action' => 'rollback_plugin', 'target' => $target];

            case 'cleanup_plugin':
                SafeUpdate::cleanup($target);
                return ['success' => true, 'action' => 'cleanup_plugin', 'target' => $target];

            case 'read_debug_log':
                return $this->readDebugLog();

            case 'get_latest_post_url':
                return $this->getLatestPostUrl();

            case 'update_theme':
                return $this->updateTheme($target);

            case 'update_core':
                return $this->updateCore();

            case 'sync_updates':
                return $this->syncUpdates();

            default:
                return ['success' => false, 'action' => $action, 'reason' => 'not_implemented'];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function syncUpdates(): array
    {
        if (!function_exists('wp_version_check')) {
            require_once ABSPATH . WPINC . '/update.php';
        }

        delete_site_transient('update_plugins');
        delete_site_transient('update_themes');
        delete_site_transient('update_core');

        if (function_exists('wp_clean_plugins_cache')) {
            wp_clean_plugins_cache();
        }
        if (function_exists('wp_clean_themes_cache')) {
            wp_clean_themes_cache();
        }
        if (function_exists('search_theme_directories')) {
            search_theme_directories(true);
        }
        foreach (wp_get_themes(array('errors' => null)) as $theme) {
            $theme->cache_delete();
        }

        wp_update_plugins();
        wp_update_themes();
        wp_version_check();

        $capability_router = \SyntaxWP\Plugin\Core\CapabilityRouter::forCurrentEnvironment();
        $heartbeat = new \SyntaxWP\Plugin\Core\Heartbeat($capability_router);
        $heartbeat->send();

        return ['success' => true, 'action' => 'sync_updates'];
    }

    /**
     * @return array<string, mixed>
     */
    private function updatePlugin(string $slug): array
    {
        // 1. Stage 1: Pre-flight & routing
        $preFlight = SafeUpdate::preFlight($slug);
        if (!$preFlight['success']) {
            return [
                'success' => false,
                'action' => 'update_plugin',
                'reason' => $preFlight['reason'] ?? 'Pre-flight check failed',
                'target' => $slug
            ];
        }

        // 2. Stage 3: DB Snapshot before update
        SafeUpdate::snapshotDbState($slug);

        // 3. Stage 2: Cache Purge before update
        SafeUpdate::purgeCaches();

        $pluginFile = PluginSlug::toFile($slug);
        if ($pluginFile === null) {
            SafeUpdate::cleanup($slug);
            return ['success' => false, 'action' => 'update_plugin', 'reason' => 'plugin_not_found', 'target' => $slug];
        }

        if (!class_exists('Plugin_Upgrader', false)) {
            require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        }

        // Register Pre-Update Hooks (Stage 3 DB Schema & Option Interceptor)
        SafeUpdate::registerPreUpdateHooks($slug);

        $upgrader = new \Plugin_Upgrader(new \Automatic_Upgrader_Skin());
        $result = $upgrader->upgrade($pluginFile);

        // Remove Pre-Update Hooks
        SafeUpdate::removePreUpdateHooks();

        $updateSuccess = !is_wp_error($result) && $result !== false;

        if (!$updateSuccess) {
            // Immediate rollback if upgrade itself failed
            SafeUpdate::executeRollback($slug);
            SafeUpdate::cleanup($slug);
            return [
                'success' => false,
                'action' => 'update_plugin',
                'reason' => 'upgrade_failed_rollback_triggered',
                'target' => $slug
            ];
        }

        // 4. Stage 3: Post-update migration detection & targeted backup
        SafeUpdate::checkMigrationAndBackup($slug);

        // 5. Stage 4: Post-update Cache Purge
        SafeUpdate::purgeCaches();

        return [
            'success' => true,
            'action' => 'update_plugin',
            'target' => $slug,
            'backup_type' => $preFlight['backup_type'] ?? 'unknown'
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function updateTheme(string $slug): array
    {
        if (!class_exists('Theme_Upgrader', false)) {
            require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        }

        $upgrader = new \Theme_Upgrader(new \Automatic_Upgrader_Skin());
        $result = $upgrader->upgrade($slug);

        return ['success' => !is_wp_error($result) && $result !== false, 'action' => 'update_theme', 'target' => $slug];
    }

    /**
     * @return array<string, mixed>
     */
    private function updateCore(): array
    {
        if (!class_exists('Core_Upgrader', false)) {
            require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        }

        $update_core = get_site_transient('update_core');
        if (!isset($update_core->updates) || !is_array($update_core->updates) || empty($update_core->updates)) {
            return ['success' => false, 'action' => 'update_core', 'reason' => 'no_updates_available'];
        }

        $update = $update_core->updates[0];
        $upgrader = new \Core_Upgrader(new \Automatic_Upgrader_Skin());
        $result = $upgrader->upgrade($update);

        return ['success' => !is_wp_error($result) && $result !== false, 'action' => 'update_core'];
    }

    /**
     * @return array<string, mixed>
     */
    public function flushCache(): array
    {
        SafeUpdate::purgeCaches();

        return ['success' => true, 'action' => 'flush_cache'];
    }

    /**
     * @return array<string, mixed>
     */
    public function autoloadAudit(): array
    {
        global $wpdb;

        $row = $wpdb->get_row(
            "SELECT SUM(LENGTH(option_value)) as total_bytes FROM {$wpdb->options} WHERE autoload = 'yes'"
        );
        $totalBytes = (int) ($row->total_bytes ?? 0);
        $cleaned = false;

        if ($totalBytes > 1500000) {
            $wpdb->query(
                "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_%' OR option_name LIKE '\\_site\\_transient\\_%'"
            );
            $cleaned = true;
        }

        return [
            'success'     => true,
            'action'      => 'autoload_audit',
            'total_bytes' => $totalBytes,
            'over_limit'  => $totalBytes > 1500000,
            'cleaned'     => $cleaned,
            'message'     => $cleaned
                ? sprintf('Transients cleaned. Autoloaded was %d bytes (>1.5MB).', $totalBytes)
                : sprintf('Autoloaded is %d bytes — under 1.5MB limit, no cleanup needed.', $totalBytes),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function clearTransients(): array
    {
        global $wpdb;
        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_%' OR option_name LIKE '\\_site\\_transient\\_%'"
        );

        return ['success' => true, 'action' => 'clear_transients'];
    }

    /**
     * @return array<string, mixed>
     */
    private function togglePlugin(string $action, string $slug): array
    {
        $pluginFile = PluginSlug::toFile($slug);
        if ($pluginFile === null) {
            return ['success' => false, 'action' => $action, 'reason' => 'plugin_not_found', 'target' => $slug];
        }

        if ($action === 'activate_plugin') {
            $result = activate_plugin($pluginFile);

            return ['success' => !is_wp_error($result), 'action' => $action, 'target' => $slug];
        }

        deactivate_plugins($pluginFile);

        return ['success' => true, 'action' => $action, 'target' => $slug];
    }

    /**
     * @return array<string, mixed>
     */
    private function readDebugLog(): array
    {
        $logPath = WP_CONTENT_DIR . '/debug.log';
        if (!file_exists($logPath)) {
            return ['success' => true, 'log' => ''];
        }
        $size = filesize($logPath);
        $offset = max(0, $size - 102400); // last 100KB
        $content = file_get_contents($logPath, false, null, $offset);

        return ['success' => true, 'log' => $content ?: ''];
    }

    /**
     * @return array<string, mixed>
     */
    private function getLatestPostUrl(): array
    {
        $latest = get_posts([
            'numberposts' => 1,
            'post_status'  => 'publish',
        ]);
        if (!empty($latest)) {
            $url = get_permalink($latest[0]->ID);
            return ['success' => true, 'url' => $url ?: home_url()];
        }

        return ['success' => true, 'url' => home_url()];
    }
}
