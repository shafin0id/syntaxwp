<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

/**
 * 60s health payload — inventory, PHP version, DB size (§4.3, §4.4).
 *
 * Fires on the `shutdown` hook, not a WP-Cron event: WP-Cron's built-in
 * schedules don't go below hourly, and its "pseudo-cron" only runs when a
 * request happens to land after the scheduled time anyway — on typical WP
 * hosting, gating on `shutdown` (which itself only runs after the response
 * has already been sent to the visitor, satisfying §4.4's "never on
 * request critical path") is the more reliable way to approximate a fixed
 * interval than trusting WP-Cron to fire every 60s.
 *
 * Only reports fields this plugin can populate from WordPress core APIs
 * alone. `theme`/`db_size_mb`/`autoload_size_kb`/`is_woocommerce` are real
 * core-API reads; `active_users_online` and the `health.*` fields from
 * §4.3's illustrative payload need infrastructure (session tracking,
 * ErrorCapture's rolling fatal-error count, WooCommerce checkout hooks)
 * that belongs to `monitoring/` — deliberately not built in Task A6 (see
 * plan's file-ownership note) — so they're omitted here rather than
 * fabricated.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class Heartbeat
{
    private const INTERVAL_SECONDS = 60;
    private const LAST_SENT_OPTION = 'syntaxwp_heartbeat_last_sent';

    private CapabilityRouter $capabilityRouter;

    public function __construct(CapabilityRouter $capabilityRouter)
    {
        $this->capabilityRouter = $capabilityRouter;
    }

    public function registerHooks(): void
    {
        add_action('shutdown', [$this, 'maybeSend']);
    }

    public function maybeSend(): void
    {
        $lastSent = (int) get_option(self::LAST_SENT_OPTION, 0);
        if (time() - $lastSent < self::INTERVAL_SECONDS) {
            return;
        }

        // Not autoloaded (§4.4's "zero DB writes on autoload=yes options")
        // — this option is only ever read here, on shutdown, never on the
        // request-critical path, so autoloading it into every page load
        // would be pure waste.
        update_option(self::LAST_SENT_OPTION, time(), false);
        $this->send();
    }

    public function send(): void
    {
        $siteId = get_option('syntaxwp_site_id');
        $secret = get_option('syntaxwp_site_secret');
        // Not yet connected to a SyntaxWP account — the connect flow that
        // populates these two options is a future onboarding-UI task, out
        // of scope for this module (mirrors A5a.1's own boundary: how the
        // dashboard learns a site's id is likewise treated as given).
        if (!$siteId || !$secret) {
            return;
        }

        $payload = $this->buildPayload((string) $siteId);
        $payload['hmac'] = Hmac::sign($payload, (string) $secret);

        wp_remote_post($this->endpointUrl((string) $siteId), [
            'body' => wp_json_encode($payload),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 5,
            // Fire-and-forget: a dropped heartbeat is corrected by the next
            // one 60s later, so it isn't worth blocking shutdown to confirm
            // delivery (§4.4's "zero visitor impact").
            'blocking' => true,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function buildPayload(string $siteId): array
    {
        $update_core = get_site_transient('update_core');
        $available_wp_version = null;
        if (isset($update_core->updates) && is_array($update_core->updates)) {
            foreach ($update_core->updates as $update) {
                if ($update->response === 'development') {
                    continue;
                }
                if (isset($update->current)) {
                    $available_wp_version = $update->current;
                    break;
                }
            }
        }

        return [
            'site_id' => $siteId,
            'timestamp' => time(),
            'nonce' => wp_generate_uuid4(),
            'wp_version' => get_bloginfo('version'),
            'available_wp_version' => $available_wp_version,
            'execution_path' => $this->capabilityRouter->detectExecutionPath(),
            'site_title' => get_bloginfo('name'),
            'plugins' => $this->collectPlugins(),
            'theme' => $this->collectTheme(),
            'themes' => $this->collectThemes(),
            'php_version' => PHP_VERSION,
            'db_size_mb' => (string) $this->calculateDbSizeMb(),
            'autoload_size_kb' => (string) $this->calculateAutoloadSizeKb(),
            'is_woocommerce' => class_exists('WooCommerce'),
        ];
    }

    /**
     * @return array<int, array{slug: string, version: string, active: bool, update_available: bool, update_version: string|null}>
     */
    private function collectPlugins(): array
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $update_plugins = get_site_transient('update_plugins');

        $plugins = [];
        foreach (get_plugins() as $pluginFile => $data) {
            $slug = PluginSlug::fromFile($pluginFile);
            $update_available = isset($update_plugins->response[$pluginFile]);
            $plugins[] = [
                'slug' => $slug,
                'name' => $data['Name'] ?? '',
                'version' => $data['Version'] ?? '',
                'active' => is_plugin_active($pluginFile),
                'update_available' => $update_available,
                'update_version' => $update_available ? ($update_plugins->response[$pluginFile]->new_version ?? '') : null,
            ];
        }

        return $plugins;
    }

    /**
     * @return array{slug: string, version: string}
     */
    private function collectTheme(): array
    {
        $theme = wp_get_theme();

        return [
            'slug' => $theme->get_stylesheet(),
            'version' => (string) $theme->get('Version'),
        ];
    }

    /**
     * @return array<int, array{name: string, slug: string, current: string, latest: string, status: string, description: string, update_available: bool}>
     */
    private function collectThemes(): array
    {
        if (function_exists('search_theme_directories')) {
            search_theme_directories(true);
        }
        foreach (wp_get_themes(array('errors' => null)) as $theme) {
            $theme->cache_delete();
        }
        $update_themes = get_site_transient('update_themes');
        $themes = [];

        foreach (wp_get_themes() as $stylesheet => $theme_obj) {
            $update_available = isset($update_themes->response[$stylesheet]);
            $themes[] = [
                'name' => (string) $theme_obj->get('Name'),
                'slug' => $stylesheet,
                'current' => (string) $theme_obj->get('Version'),
                'latest' => (string) ($update_available ? ($update_themes->response[$stylesheet]['new_version'] ?? '') : $theme_obj->get('Version')),
                'status' => ($stylesheet === get_stylesheet()) ? 'active' : 'inactive',
                'description' => (string) ($theme_obj->get('Description') ?: ''),
                'update_available' => $update_available,
            ];
        }

        return $themes;
    }

    private function calculateDbSizeMb(): float
    {
        global $wpdb;
        $bytes = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT SUM(data_length + index_length) FROM information_schema.TABLES WHERE table_schema = %s',
                DB_NAME
            )
        );

        return $bytes !== null ? round(((float) $bytes) / 1024 / 1024, 2) : 0.0;
    }

    private function calculateAutoloadSizeKb(): float
    {
        global $wpdb;
        $bytes = $wpdb->get_var(
            "SELECT SUM(LENGTH(option_value)) FROM {$wpdb->options} WHERE autoload = 'yes'"
        );

        return $bytes !== null ? round(((float) $bytes) / 1024, 2) : 0.0;
    }

    private function endpointUrl(string $siteId): string
    {
        $base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');

        return rtrim((string) $base, '/') . '/api/sites/' . $siteId . '/heartbeat';
    }
}
