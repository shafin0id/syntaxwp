<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Wp7;

use SyntaxWP\Plugin\Core\PluginSlug;

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
    public function execute(string $action, string $target = ''): array
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

            default:
                return ['success' => false, 'action' => $action, 'reason' => 'not_implemented'];
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function flushCache(): array
    {
        wp_cache_flush();

        return ['success' => true, 'action' => 'flush_cache'];
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
}
