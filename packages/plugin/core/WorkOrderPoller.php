<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

use SyntaxWP\Plugin\Safety\KillSwitch;
use SyntaxWP\Plugin\Safety\SafeMode;
use SyntaxWP\Plugin\Safety\WorkOrderValidator;

/**
 * Claim + execute signed work orders (§4.1's legacy outbound-polling
 * path) — only relevant when CapabilityRouter routes away from
 * `wp7_native`; a WP7 site with MCP available never needs this, since the
 * control plane calls it directly instead of being polled.
 *
 * Fires on `shutdown` like Heartbeat, same 60s cadence and same
 * "gate-on-shutdown beats WP-Cron's unreliable pseudo-schedule" rationale
 * (§4.1's own "HMAC-signed work order poll every 60s").
 *
 * Execution only covers the whitelisted actions with a genuinely simple,
 * safe, single-mechanism WP-native implementation right now: flush_cache,
 * clear_transients, activate_plugin, deactivate_plugin — the same subset
 * A4.3's revert executor already treats as "the ones with a clean
 * mechanical implementation using data already on hand". Every other
 * whitelisted action (update_plugin's upgrader flow, delete_plugin/
 * update_core's destructive-operation safeguards, switch_theme,
 * update_option, toggle_debug's wp-config.php editing, disable_
 * maintenance_mode's ambiguity over which maintenance mechanism is meant)
 * needs real, carefully-tested implementations this task doesn't build —
 * A7.2's own description ("Legacy outbound polling path completion") is
 * explicitly where this gets finished, not here. Reporting the execution
 * result back to the API is likewise A7.2's job: no such endpoint exists
 * yet (only claim does, A5b.1) — poll() returns its result locally so a
 * caller can inspect it, rather than pretending a report round-trip
 * happens today.
 *
 * Checks both safety controls before claiming anything: KillSwitch (a
 * remote backend disable) and SafeMode (this plugin's own anomaly
 * response) each independently stop execution, and every execute() result
 * feeds SafeMode's failure counter — a run of execution failures is
 * exactly the anomaly SafeMode exists to catch.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class WorkOrderPoller
{
    private const POLL_INTERVAL_SECONDS = 60;
    private const LAST_POLLED_OPTION = 'syntaxwp_work_order_last_polled';

    private CapabilityRouter $capabilityRouter;
    private WorkOrderValidator $validator;

    public function __construct(CapabilityRouter $capabilityRouter, ?WorkOrderValidator $validator = null)
    {
        $this->capabilityRouter = $capabilityRouter;
        $this->validator = $validator ?? new WorkOrderValidator();
    }

    public function registerHooks(): void
    {
        add_action('shutdown', [$this, 'maybePoll']);
    }

    public function maybePoll(): void
    {
        if ($this->capabilityRouter->detectExecutionPath() !== CapabilityRouter::LEGACY_OUTBOUND) {
            return;
        }

        $lastPolled = (int) get_option(self::LAST_POLLED_OPTION, 0);
        if (time() - $lastPolled < self::POLL_INTERVAL_SECONDS) {
            return;
        }

        update_option(self::LAST_POLLED_OPTION, time(), false);
        $this->poll();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function poll(): ?array
    {
        if (KillSwitch::isActive() || SafeMode::isActive()) {
            return null;
        }

        $siteId = get_option('syntaxwp_site_id');
        $secret = get_option('syntaxwp_site_secret');
        if (!$siteId || !$secret) {
            return null;
        }

        $order = $this->claim((string) $siteId, (string) $secret);
        if ($order === null) {
            return null;
        }

        if (!$this->validator->validate($order, (string) $secret)) {
            SafeMode::recordFailure();

            return ['success' => false, 'reason' => 'validation_failed'];
        }

        $result = $this->execute($order);
        if ($result['success'] ?? false) {
            SafeMode::recordSuccess();
        } else {
            SafeMode::recordFailure();
        }

        return $result;
    }

    private function claim(string $siteId, string $secret): ?object
    {
        $payload = [
            'site_id' => $siteId,
            'timestamp' => time(),
            'nonce' => wp_generate_uuid4(),
        ];
        $payload['hmac'] = Hmac::sign($payload, $secret);

        $response = wp_remote_post($this->endpointUrl($siteId), [
            'body' => wp_json_encode($payload),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 5,
        ]);

        if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }

        // Decoded WITHOUT forcing associative arrays — same reason as
        // WorkOrderValidator's own docblock: only this decode mode
        // preserves an empty `parameters: {}` through to the HMAC check.
        $body = json_decode((string) wp_remote_retrieve_body($response));
        if (!isset($body->workOrder) || !is_object($body->workOrder)) {
            return null;
        }

        return $body->workOrder;
    }

    /**
     * @return array<string, mixed>
     */
    private function execute(object $order): array
    {
        $action = isset($order->action) ? (string) $order->action : '';
        $target = isset($order->target) ? (string) $order->target : '';

        switch ($action) {
            case 'flush_cache':
                wp_cache_flush();

                return ['success' => true, 'action' => $action];

            case 'clear_transients':
                $this->clearTransients();

                return ['success' => true, 'action' => $action];

            case 'deactivate_plugin':
            case 'activate_plugin':
                return $this->togglePlugin($action, $target);

            default:
                return ['success' => false, 'action' => $action, 'reason' => 'not_implemented'];
        }
    }

    private function clearTransients(): void
    {
        global $wpdb;
        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_%' OR option_name LIKE '\\_site\\_transient\\_%'"
        );
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

    private function endpointUrl(string $siteId): string
    {
        $base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');

        return rtrim((string) $base, '/') . '/api/sites/' . $siteId . '/work-orders/claim';
    }
}
