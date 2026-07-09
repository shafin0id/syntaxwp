<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

use SyntaxWP\Plugin\Safety\KillSwitch;
use SyntaxWP\Plugin\Safety\SafeMode;
use SyntaxWP\Plugin\Safety\WorkOrderValidator;
use SyntaxWP\Plugin\Wp7\ActionExecutor;

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
 * Execution itself is wp7/ActionExecutor.php's job (see below) — its own
 * docblock explains the current 4-action scope and why every other
 * whitelisted action gets an honest `not_implemented` result instead of a
 * fragile guess. Reporting the execution result back to the API is A7.2's
 * job ("Legacy outbound polling path completion"): no such endpoint
 * exists yet (only claim does, A5b.1) — poll() returns its result locally
 * so a caller can inspect it, rather than pretending a report round-trip
 * happens today.
 *
 * Checks both safety controls before claiming anything: KillSwitch (a
 * remote backend disable) and SafeMode (this plugin's own anomaly
 * response) each independently stop execution, and every execute() result
 * feeds SafeMode's failure counter — a run of execution failures is
 * exactly the anomaly SafeMode exists to catch.
 *
 * Delegates actual execution to wp7/ActionExecutor.php (A7.1) — that's
 * the single execution authority both this path and the WP7-native path
 * share, so "how to flush the cache" has one implementation, not two that
 * could drift. The `core` -> `wp7` dependency direction reads backwards
 * from the directory names, but is deliberate: nothing about running
 * these 4 actions is actually WP7-specific (see ActionExecutor's own
 * docblock) — only *discovery* differs between the two paths.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class WorkOrderPoller
{
    private const POLL_INTERVAL_SECONDS = 60;
    private const LAST_POLLED_OPTION = 'syntaxwp_work_order_last_polled';

    private CapabilityRouter $capabilityRouter;
    private WorkOrderValidator $validator;
    private ActionExecutor $executor;

    public function __construct(
        CapabilityRouter $capabilityRouter,
        ?WorkOrderValidator $validator = null,
        ?ActionExecutor $executor = null
    ) {
        $this->capabilityRouter = $capabilityRouter;
        $this->validator = $validator ?? new WorkOrderValidator();
        $this->executor = $executor ?? new ActionExecutor();
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

        $action = isset($order->action) ? (string) $order->action : '';
        $target = isset($order->target) ? (string) $order->target : '';
        $result = $this->executor->execute($action, $target);
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

    private function endpointUrl(string $siteId): string
    {
        $base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');

        return rtrim((string) $base, '/') . '/api/sites/' . $siteId . '/work-orders/claim';
    }
}
