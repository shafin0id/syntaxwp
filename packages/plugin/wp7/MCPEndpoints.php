<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Wp7;

use SyntaxWP\Plugin\Core\Hmac;

/**
 * Exposes MCP endpoints, localhost only — not public (§4.1, §4.2).
 *
 * Loopback-checking `REMOTE_ADDR` alone is NOT sufficient authentication
 * and must never be the only gate on this endpoint: on the extremely
 * common deployment shape of nginx reverse-proxying to PHP-FPM on the
 * *same* host, PHP sees `REMOTE_ADDR = 127.0.0.1` for every single
 * external request — "loopback" carries no trust in that topology at all.
 * (Caught by a background security review before this shipped.) The real
 * authentication is the same site-secret HMAC signature every other
 * plugin-originated request in this system already uses (Hmac.php,
 * WorkOrderValidator's own hmac/expiry/nonce checks) — the loopback check
 * is kept as defense-in-depth on top of that, not instead of it.
 *
 * NOTE: the route shape here (a single POST /syntaxwp/v1/mcp/execute
 * endpoint taking `{ability, input, timestamp, nonce, hmac}` and returning
 * ActionExecutor's result directly) is a best-effort JSON-RPC-ish surface,
 * not a confirmed match to whatever transport WP7's real MCP integration
 * expects abilities to be called through — verify against the actual MCP
 * adapter's conventions before this ships. What's actually confirmed: the
 * HMAC/replay verification itself, and the ability-name ->
 * whitelisted-action mapping (strip the `syntaxwp/` prefix, hyphens to
 * underscores — the exact inverse of AbilitiesRegistrar's own slug
 * naming).
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class MCPEndpoints
{
    private const REST_NAMESPACE = 'syntaxwp/v1';
    private const ABILITY_PREFIX = 'syntaxwp/';
    // Same replay window as A5a.1's site-auth (apps/api/src/auth/site-auth.ts)
    // — one convention for "how stale can a signed request be" everywhere
    // this plugin signs something.
    private const REPLAY_WINDOW_SECONDS = 300;

    private ActionExecutor $executor;

    public function __construct(?ActionExecutor $executor = null)
    {
        $this->executor = $executor ?? new ActionExecutor();
    }

    public function registerHooks(): void
    {
        add_action('rest_api_init', [$this, 'registerRoutes']);
    }

    public function registerRoutes(): void
    {
        register_rest_route(self::REST_NAMESPACE, '/mcp/execute', [
            'methods' => 'POST',
            'callback' => [$this, 'handleExecute'],
            'permission_callback' => [$this, 'authorizeRequest'],
        ]);
    }

    /**
     * @param mixed $request
     */
    public function authorizeRequest($request): bool
    {
        if (!$this->isLoopbackRequest()) {
            return false;
        }

        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];

        return $this->verifySignedRequest($params);
    }

    public function isLoopbackRequest(): bool
    {
        $remoteAddr = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';

        return in_array($remoteAddr, ['127.0.0.1', '::1'], true);
    }

    /**
     * @param array<string, mixed> $params
     */
    public function verifySignedRequest(array $params): bool
    {
        $secret = get_option('syntaxwp_site_secret');
        if (!$secret) {
            return false; // not yet connected — nothing to verify against
        }

        if (
            !isset($params['hmac'], $params['timestamp'], $params['nonce'])
            || !is_string($params['hmac'])
        ) {
            return false;
        }

        $timestamp = (int) $params['timestamp'];
        if (abs(time() - $timestamp) > self::REPLAY_WINDOW_SECONDS) {
            return false;
        }

        if (isset($params['input']) && is_array($params['input']) && empty($params['input'])) {
            $params['input'] = new \stdClass();
        }

        $nonce = (string) $params['nonce'];
        if (get_transient('syntaxwp_mcp_nonce_' . $nonce)) {
            return false;
        }

        $signedPayload = $params;
        $receivedHmac = $signedPayload['hmac'];
        unset($signedPayload['hmac']);

        if (!Hmac::verify($signedPayload, (string) $secret, $receivedHmac)) {
            return false;
        }

        set_transient('syntaxwp_mcp_nonce_' . $nonce, 1, self::REPLAY_WINDOW_SECONDS);

        return true;
    }

    /**
     * Thin REST-facing wrapper — extracts plain params and hands off to
     * executeAbility() immediately, so the actual dispatch logic is
     * testable with plain arrays instead of needing a real WP_REST_Request
     * instance. Authentication has already happened in authorizeRequest()
     * (WP calls permission_callback before the route's own callback) —
     * this method only ever runs for an already-verified request.
     *
     * @param mixed $request
     * @return array<string, mixed>
     */
    public function handleExecute($request): array
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];

        return $this->executeAbility($params);
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function executeAbility(array $params): array
    {
        $ability = isset($params['ability']) ? (string) $params['ability'] : '';
        $action = $this->actionFromAbility($ability);
        if ($action === null) {
            return ['success' => false, 'reason' => 'unknown_ability', 'ability' => $ability];
        }

        $input = isset($params['input']) ? (array) $params['input'] : [];
        $target = isset($input['target']) ? (string) $input['target'] : '';
        $reason = isset($input['reason']) ? (string) $input['reason'] : '';

        return $this->executor->execute($action, $target, $reason);
    }

    private function actionFromAbility(string $ability): ?string
    {
        if (strpos($ability, self::ABILITY_PREFIX) !== 0) {
            return null;
        }

        return str_replace('-', '_', substr($ability, strlen(self::ABILITY_PREFIX)));
    }
}
