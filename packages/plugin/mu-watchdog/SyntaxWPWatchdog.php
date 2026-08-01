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
            $this->maybeInterceptMcp();
            add_action('shutdown', [$this, 'maybeCheck']);
            add_action('shutdown', [$this, 'captureFatal'], 5);
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

            $this->reportEvent('plugin_crashed', 'SyntaxWP main plugin appears inactive or crashed — reported by the mu-plugin watchdog');
        }

        public static function checkMainPluginHealth(): bool
        {
            if (!function_exists('is_plugin_active')) {
                require_once ABSPATH . 'wp-admin/includes/plugin.php';
            }

            return class_exists('SyntaxWP') && is_plugin_active('syntaxwp/syntaxwp.php');
        }

        public function captureFatal(): void
        {
            $error = \error_get_last();
            if ($error === null || !in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
                return;
            }

            $this->reportEvent('fatal_error', $error['message'], [
                'file' => $error['file'],
                'line' => $error['line'],
            ]);
        }

        public function reportEvent(string $type, string $summary, array $evidence = []): void
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
            $payload['hmac'] = self::sign($payload, (string) $secret);

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

        private function maybeInterceptMcp(): void
        {
            if (
                $_SERVER['REQUEST_METHOD'] !== 'POST'
                || strpos($_SERVER['REQUEST_URI'] ?? '', '/wp-json/syntaxwp/v1/mcp/execute') === false
            ) {
                return;
            }

            $body = file_get_contents('php://input');
            $params = json_decode($body, true);
            if (!is_array($params)) {
                return;
            }

            $secret = get_option('syntaxwp_site_secret');
            if (!$secret) {
                return;
            }

            if (
                !isset($params['hmac'], $params['timestamp'], $params['nonce'])
                || !is_string($params['hmac'])
            ) {
                return;
            }

            $timestamp = (int) $params['timestamp'];
            if (abs(time() - $timestamp) > 300) {
                return;
            }

            $signedPayload = $params;
            $receivedHmac = $signedPayload['hmac'];
            unset($signedPayload['hmac']);

            $canonical = json_encode(
                self::sortKeysDeep($signedPayload),
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
            $expectedHmac = hash_hmac('sha256', (string) $canonical, (string) $secret);

            if (!hash_equals($expectedHmac, $receivedHmac)) {
                return;
            }

            $ability = $params['ability'] ?? '';
            if ($ability === 'syntaxwp/deactivate-plugin') {
                $input = $params['input'] ?? [];
                $target = $input['target'] ?? '';
                if ($target) {
                    $success = $this->earlyDeactivatePlugin($target);
                    header('Content-Type: application/json');
                    echo json_encode(['success' => $success, 'action' => 'deactivate_plugin', 'target' => $target]);
                    exit;
                }
            }
        }

        private function earlyDeactivatePlugin(string $slug): bool
        {
            $active = get_option('active_plugins', []);
            if (!is_array($active)) {
                return false;
            }

            $updated = [];
            $found = false;
            foreach ($active as $pluginFile) {
                if (
                    $pluginFile === $slug 
                    || strpos($pluginFile, $slug . '/') === 0 
                    || dirname($pluginFile) === $slug
                ) {
                    $found = true;
                    continue;
                }
                $updated[] = $pluginFile;
            }

            if ($found) {
                update_option('active_plugins', $updated);
                return true;
            }
            return false;
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
