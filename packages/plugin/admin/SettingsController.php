<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Admin;

/**
 * REST routes backing the wp-admin SyntaxWP settings screen. Gated by
 * `current_user_can('manage_options')` — WordPress's standard cookie +
 * `X-WP-Nonce` REST auth for a logged-in browser session. This is a
 * deliberately different trust boundary from wp7/MCPEndpoints.php's
 * HMAC-signed machine-to-machine route: that one authenticates a *site*
 * calling *SyntaxWP*, this one authenticates a *human* configuring their
 * *own* site, so it reuses WordPress's own auth instead of the plugin's
 * HMAC signing.
 *
 * "Connecting" a site is nothing more than persisting the id + one-time
 * secret that SyntaxWP's dashboard already issued via POST /api/sites —
 * there is no license-key/activation call-home here, by design.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class SettingsController
{
    private const REST_NAMESPACE = 'syntaxwp/v1';

    public function registerHooks(): void
    {
        add_action('rest_api_init', [$this, 'registerRoutes']);
    }

    public function registerRoutes(): void
    {
        register_rest_route(self::REST_NAMESPACE, '/settings', [
            'methods' => 'GET',
            'callback' => [$this, 'handleGet'],
            'permission_callback' => [$this, 'authorize'],
        ]);

        register_rest_route(self::REST_NAMESPACE, '/settings', [
            'methods' => 'POST',
            'callback' => [$this, 'handlePost'],
            'permission_callback' => [$this, 'authorize'],
        ]);

        register_rest_route(self::REST_NAMESPACE, '/settings/disconnect', [
            'methods' => 'POST',
            'callback' => [$this, 'handleDisconnect'],
            'permission_callback' => [$this, 'authorize'],
        ]);
    }

    public function authorize(): bool
    {
        return current_user_can('manage_options');
    }

    /**
     * @return array<string, mixed>
     */
    public function handleGet(): array
    {
        $siteId = get_option('syntaxwp_site_id');

        return [
            'connected' => (bool) $siteId,
            'site_id' => $siteId ? (string) $siteId : '',
            'api_base_url' => (string) get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com'),
        ];
    }

    /**
     * @param mixed $request
     * @return array<string, mixed>|\WP_Error
     */
    public function handlePost($request)
    {
        $params = method_exists($request, 'get_json_params') ? (array) $request->get_json_params() : [];

        $siteId = isset($params['site_id']) ? trim((string) $params['site_id']) : '';
        $siteSecret = isset($params['site_secret']) ? trim((string) $params['site_secret']) : '';
        $apiBaseUrl = isset($params['api_base_url']) ? trim((string) $params['api_base_url']) : '';

        // GET /settings never echoes the secret back out, so the "already
        // connected, only changing the API base URL" form in the admin UI
        // can't resend it — fall back to what's already stored rather than
        // forcing every URL-only edit to re-paste the secret.
        if ($siteId === '') {
            $siteId = (string) get_option('syntaxwp_site_id');
        }
        if ($siteSecret === '') {
            $siteSecret = (string) get_option('syntaxwp_site_secret');
        }

        if ($siteId === '' || $siteSecret === '') {
            return new \WP_Error('syntaxwp_missing_fields', 'Site ID and site secret are both required.', ['status' => 400]);
        }

        if ($apiBaseUrl !== '' && wp_http_validate_url($apiBaseUrl) === false) {
            return new \WP_Error('syntaxwp_invalid_url', 'API base URL is not a valid URL.', ['status' => 400]);
        }

        update_option('syntaxwp_site_id', $siteId, false);
        update_option('syntaxwp_site_secret', $siteSecret, false);
        if ($apiBaseUrl !== '') {
            update_option('syntaxwp_api_base_url', $apiBaseUrl, false);
        }

        return ['connected' => true];
    }

    /**
     * @return array<string, mixed>
     */
    public function handleDisconnect(): array
    {
        delete_option('syntaxwp_site_id');
        delete_option('syntaxwp_site_secret');
        delete_option('syntaxwp_api_base_url');

        // Otherwise reconnecting to a different site inherits the old
        // site's queued events and failure/backoff state.
        delete_option('syntaxwp_pending_events');
        delete_option('syntaxwp_safe_mode_active');
        delete_option('syntaxwp_safe_mode_failure_count');

        return ['connected' => false];
    }
}
