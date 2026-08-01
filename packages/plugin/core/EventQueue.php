<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

/**
 * Batches WP lifecycle events (plugin change, WooCommerce checkout events,
 * ...) and flushes them to POST /api/sites/:id/events on `shutdown`, same
 * network-timing rationale as Heartbeat.
 *
 * Backed by a (non-autoloaded) option rather than an in-memory array: §4.4
 * requires failed sends to "silently queue + retry", and a WP process
 * doesn't persist between requests, so retry durability across requests
 * needs the pending queue written to the DB, not held only in memory.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class EventQueue
{
    private const OPTION_KEY = 'syntaxwp_pending_events';

    /**
     * @param array<string, mixed> $event Must include a 'type' key — mirrors
     *   the API's EventsSchema (apps/api/src/routes/sites.ts), which requires
     *   `type` and passes every other key through as evidence.
     */
    public static function push(array $event): void
    {
        $pending = get_option(self::OPTION_KEY, []);
        $pending[] = $event;
        update_option(self::OPTION_KEY, $pending, false);
    }

    public function registerHooks(): void
    {
        add_action('shutdown', [$this, 'flush']);
    }

    public function flush(): void
    {
        $pending = get_option(self::OPTION_KEY, []);
        if ($pending === []) {
            return;
        }

        $siteId = get_option('syntaxwp_site_id');
        $secret = get_option('syntaxwp_site_secret');
        if (!$siteId || !$secret) {
            return; // stays queued until the site is connected
        }

        $payload = [
            'site_id' => $siteId,
            'timestamp' => time(),
            'nonce' => wp_generate_uuid4(),
            'events' => $pending,
        ];
        $payload['hmac'] = Hmac::sign($payload, (string) $secret);

        $response = wp_remote_post($this->endpointUrl((string) $siteId), [
            'body' => wp_json_encode($payload),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 5,
        ]);

        if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) >= 300) {
            return; // left in the option for the next request's flush to retry
        }

        delete_option(self::OPTION_KEY);
    }

    private function endpointUrl(string $siteId): string
    {
        $base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');

        return rtrim((string) $base, '/') . '/api/sites/' . $siteId . '/events';
    }
}
