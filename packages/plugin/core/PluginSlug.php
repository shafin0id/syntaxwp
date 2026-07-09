<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

/**
 * Maps between WP's own plugin identifier (the relative file path
 * `get_plugins()` keys its results by, e.g. "woocommerce/woocommerce.php")
 * and the plain slug ("woocommerce") this system's wire payloads and DB
 * columns use everywhere else (plugin_inventory.slug, a work order's
 * `target`). Shared by Heartbeat (reporting inventory outbound) and
 * WorkOrderPoller (resolving an inbound work order's `target` back to a
 * real plugin file) — one implementation of this mapping, not two.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class PluginSlug
{
    public static function fromFile(string $pluginFile): string
    {
        $dir = dirname($pluginFile);

        return $dir !== '.' ? $dir : basename($pluginFile, '.php');
    }

    // Linear scan over every installed plugin — fine at WP's usual
    // plugin-count scale, and this only ever runs when a work order is
    // actually being executed, not on every request.
    public static function toFile(string $slug): ?string
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        foreach (array_keys(get_plugins()) as $pluginFile) {
            if (self::fromFile($pluginFile) === $slug) {
                return $pluginFile;
            }
        }

        return null;
    }
}
