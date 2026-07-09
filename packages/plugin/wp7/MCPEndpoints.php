<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Wp7;

/**
 * Exposes MCP endpoints, localhost only — not public (§4.1, §4.2). WP has
 * no built-in binding restriction that keeps a REST route request-local;
 * the `REMOTE_ADDR` check in isLoopbackRequest() is the actual enforcement
 * point.
 *
 * NOTE: the route shape here (a single POST /syntaxwp/v1/mcp/execute
 * endpoint taking `{ability, input}` and returning ActionExecutor's result
 * directly) is a best-effort JSON-RPC-ish surface, not a confirmed match
 * to whatever transport WP7's real MCP integration expects abilities to
 * be called through — verify against the actual MCP adapter's conventions
 * before this ships. What's actually confirmed: the loopback enforcement
 * itself, and the ability-name -> whitelisted-action mapping (strip the
 * `syntaxwp/` prefix, hyphens to underscores — the exact inverse of
 * AbilitiesRegistrar's own slug naming).
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class MCPEndpoints
{
    private const REST_NAMESPACE = 'syntaxwp/v1';
    private const ABILITY_PREFIX = 'syntaxwp/';

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
            'permission_callback' => [$this, 'isLoopbackRequest'],
        ]);
    }

    public function isLoopbackRequest(): bool
    {
        $remoteAddr = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';

        return in_array($remoteAddr, ['127.0.0.1', '::1'], true);
    }

    /**
     * Thin REST-facing wrapper — extracts plain params and hands off to
     * executeAbility() immediately, so the actual dispatch logic is
     * testable with plain arrays instead of needing a real WP_REST_Request
     * instance.
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

        $input = isset($params['input']) && is_array($params['input']) ? $params['input'] : [];
        $target = isset($input['target']) ? (string) $input['target'] : '';

        return $this->executor->execute($action, $target);
    }

    private function actionFromAbility(string $ability): ?string
    {
        if (strpos($ability, self::ABILITY_PREFIX) !== 0) {
            return null;
        }

        return str_replace('-', '_', substr($ability, strlen(self::ABILITY_PREFIX)));
    }
}
