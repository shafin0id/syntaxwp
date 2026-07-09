<?php

declare(strict_types=1);

/**
 * Bootstrap for tests/Integration/*.php — deliberately separate from
 * tests/bootstrap.php (WP_Mock). WP_Mock intercepts WP core function
 * calls; an integration test's whole point is exercising real HTTP calls
 * against a real running `pnpm dev` API instance, which needs the
 * *opposite* — real (if minimal) implementations of the handful of WP
 * functions this plugin's classes call, backed by an in-memory store and
 * curl instead of a mocked one. WP_Mock also pre-declares these same
 * function names process-wide at bootstrap, so the two approaches can't
 * coexist in one PHPUnit run — hence the separate phpunit-integration.xml.dist
 * config pointing here instead of tests/bootstrap.php.
 */

require_once dirname(__DIR__) . '/vendor/autoload.php';

$GLOBALS['__syntaxwp_test_options'] = [];
$GLOBALS['__syntaxwp_test_transients'] = [];

function get_option(string $key, $default = false)
{
    return $GLOBALS['__syntaxwp_test_options'][$key] ?? $default;
}

function update_option(string $key, $value, bool $autoload = true): bool
{
    $GLOBALS['__syntaxwp_test_options'][$key] = $value;

    return true;
}

function delete_option(string $key): bool
{
    unset($GLOBALS['__syntaxwp_test_options'][$key]);

    return true;
}

function get_transient(string $key)
{
    return $GLOBALS['__syntaxwp_test_transients'][$key] ?? false;
}

function set_transient(string $key, $value, int $expiration = 0): bool
{
    $GLOBALS['__syntaxwp_test_transients'][$key] = $value;

    return true;
}

function wp_generate_uuid4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function wp_json_encode($data)
{
    return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

// flush_cache is the only action this test exercises (§ plan's own "dry-run
// execute (flush_cache)") — a real WP install's object cache doesn't exist
// here, so this is a genuine no-op, not a mock expecting a specific call.
function wp_cache_flush(): bool
{
    return true;
}

if (!class_exists('WP_Error')) {
    final class WP_Error
    {
        public string $code;
        public string $message;

        public function __construct(string $code = '', string $message = '')
        {
            $this->code = $code;
            $this->message = $message;
        }
    }
}

function is_wp_error($thing): bool
{
    return $thing instanceof WP_Error;
}

/**
 * @param array<string, mixed> $args
 * @return array<string, mixed>|WP_Error
 */
function wp_remote_post(string $url, array $args = [])
{
    return syntaxwp_test_http_request('POST', $url, $args);
}

/**
 * @param mixed $response
 */
function wp_remote_retrieve_response_code($response): int
{
    return is_array($response) ? (int) ($response['response']['code'] ?? 0) : 0;
}

/**
 * @param mixed $response
 */
function wp_remote_retrieve_body($response): string
{
    return is_array($response) ? (string) ($response['body'] ?? '') : '';
}

/**
 * Real curl request — the actual "integration" part of this test suite.
 * Mirrors the shape wp_remote_post()'s real WordPress implementation
 * returns (`['response' => ['code' => int], 'body' => string]` on success,
 * a WP_Error on failure) closely enough for WorkOrderPoller/WorkOrderValidator
 * to work against it unmodified.
 *
 * @param array<string, mixed> $args
 * @return array<string, mixed>|WP_Error
 */
function syntaxwp_test_http_request(string $method, string $url, array $args)
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, (int) ($args['timeout'] ?? 5));

    if (isset($args['body'])) {
        $body = is_array($args['body']) ? wp_json_encode($args['body']) : $args['body'];
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    if (isset($args['headers']) && is_array($args['headers'])) {
        $headers = [];
        foreach ($args['headers'] as $name => $value) {
            $headers[] = "{$name}: {$value}";
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    $body = curl_exec($ch);
    $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        return new WP_Error('http_request_failed', $error);
    }

    return ['response' => ['code' => $statusCode], 'body' => (string) $body];
}

/**
 * Loads a var from the real environment first, falling back to
 * apps/api/.env (a dotenv file, not real env vars — a separately-invoked
 * PHP CLI process doesn't inherit it the way apps/api's own Node process
 * does) so this test reads the *same* SITE_SECRET_ENCRYPTION_KEY/
 * DATABASE_URL the actually-running `pnpm dev` API instance is using,
 * without requiring the developer to re-export them manually.
 */
function syntaxwp_test_env(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    static $dotenv = null;
    if ($dotenv === null) {
        $dotenv = [];
        $path = dirname(__DIR__, 3) . '/apps/api/.env';
        if (is_readable($path)) {
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $line, 2);
                $dotenv[trim($k)] = trim($v);
            }
        }
    }

    return $dotenv[$key] ?? $default;
}
