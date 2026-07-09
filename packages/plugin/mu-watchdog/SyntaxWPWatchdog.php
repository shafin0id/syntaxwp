<?php
/**
 * MU plugin: last-resort heartbeat + restart detection if the main
 * SyntaxWP plugin crashed or was deactivated unexpectedly (§4.2).
 *
 * Deliberately self-contained — no dependency on the main plugin's
 * Composer autoloader or any of its classes (core/Hmac.php included).
 * Must-use plugins load before regular plugins in WP's bootstrap
 * sequence, so `vendor/autoload.php` isn't even guaranteed to be
 * available yet when this file runs — and if the main plugin's own code
 * is what's actually broken, this file needs to keep working regardless.
 * It duplicates a minimal (but still fully recursive — see sortKeysDeep())
 * HMAC canonicalization rather than requiring core/Hmac.php, and a plain
 * global class name rather than a namespaced one, for the same reason.
 *
 * @package SyntaxWP\Plugin\MuWatchdog
 * @author  Tanmay Kirtania <jktanmay@gmail.com>
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!class_exists('SyntaxWP_Watchdog')) {
    final class SyntaxWP_Watchdog
    {
        // Less frequent than the main plugin's own 60s heartbeat — this
        // only exists to catch the main plugin being *down*, not to
        // duplicate its normal reporting cadence.
        private const CHECK_INTERVAL_SECONDS = 300;
        private const LAST_CHECK_OPTION = 'syntaxwp_watchdog_last_check';

        /**
         * @var callable(): bool
         */
        private $healthChecker;

        // Takes the health check as an injected callable, defaulting to
        // the real one — same "constructor-inject the thing under test"
        // pattern as core/CapabilityRouter.php and core/ErrorCapture.php,
        // for the same reason: keeps this class `final` and testable
        // without subclassing (PHPUnit can't extend a final class, and a
        // watchdog that could silently be swapped out by a subclass in
        // production defeats the point of a last-resort safety class).
        public function __construct(?callable $healthChecker = null)
        {
            $this->healthChecker = $healthChecker ?? [self::class, 'checkMainPluginHealth'];
        }

        public function register(): void
        {
            add_action('shutdown', [$this, 'maybeCheck']);
        }

        public function maybeCheck(): void
        {
            $lastCheck = (int) get_option(self::LAST_CHECK_OPTION, 0);
            if (time() - $lastCheck < self::CHECK_INTERVAL_SECONDS) {
                return;
            }
            update_option(self::LAST_CHECK_OPTION, time(), false);

            if (($this->healthChecker)()) {
                return;
            }

            $this->reportDown();
        }

        public static function checkMainPluginHealth(): bool
        {
            if (!function_exists('is_plugin_active')) {
                require_once ABSPATH . 'wp-admin/includes/plugin.php';
            }

            return class_exists('SyntaxWP') && is_plugin_active('syntaxwp/syntaxwp.php');
        }

        public function reportDown(): void
        {
            $siteId = get_option('syntaxwp_site_id');
            $secret = get_option('syntaxwp_site_secret');
            if (!$siteId || !$secret) {
                return;
            }

            $payload = [
                'site_id' => $siteId,
                'timestamp' => time(),
                'nonce' => function_exists('wp_generate_uuid4') ? wp_generate_uuid4() : uniqid('', true),
                'events' => [[
                    'type' => 'plugin_crashed',
                    'summary' => 'SyntaxWP main plugin appears inactive or crashed — reported by the mu-plugin watchdog',
                ]],
            ];
            $payload['hmac'] = self::sign($payload, (string) $secret);

            $base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');
            wp_remote_post(
                rtrim((string) $base, '/') . '/api/sites/' . $siteId . '/events',
                [
                    'body' => wp_json_encode($payload),
                    'headers' => ['Content-Type' => 'application/json'],
                    'timeout' => 5,
                    // Fire-and-forget, same as every other outbound call in
                    // this plugin — a dropped crash report waits for the
                    // next 5-minute check, not worth blocking shutdown for.
                    'blocking' => false,
                ]
            );
        }

        /**
         * @param array<string, mixed> $payload
         */
        private static function sign(array $payload, string $secret): string
        {
            $canonical = json_encode(
                self::sortKeysDeep($payload),
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );

            return hash_hmac('sha256', (string) $canonical, $secret);
        }

        /**
         * @param mixed $value
         * @return mixed
         */
        private static function sortKeysDeep($value)
        {
            if (is_array($value)) {
                if (self::isList($value)) {
                    return array_map([self::class, 'sortKeysDeep'], $value);
                }
                ksort($value, SORT_STRING);
                $sorted = [];
                foreach ($value as $key => $val) {
                    $sorted[$key] = self::sortKeysDeep($val);
                }

                return $sorted;
            }

            return $value;
        }

        private static function isList(array $value): bool
        {
            $expected = 0;
            foreach ($value as $key => $_) {
                if ($key !== $expected) {
                    return false;
                }
                $expected++;
            }

            return true;
        }
    }
}

// Guarded so PHPUnit can require this file without triggering the
// side effect — tests instantiate SyntaxWP_Watchdog themselves instead.
if (!defined('SYNTAXWP_PLUGIN_TESTING')) {
    (new SyntaxWP_Watchdog())->register();
}
