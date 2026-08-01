<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit\Admin;

use SyntaxWP\Plugin\Admin\SettingsController;
use WP_Mock\Tools\TestCase;

final class SettingsControllerTest extends TestCase
{
    /**
     * @param array<string, mixed> $params
     */
    private function requestWith(array $params): object
    {
        return new class ($params) {
            /** @var array<string, mixed> */
            private array $params;

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            public function get_json_params(): array
            {
                return $this->params;
            }
        };
    }

    public function test_authorize_rejects_a_user_without_manage_options(): void
    {
        \WP_Mock::userFunction('current_user_can', [
            'args' => ['manage_options'],
            'return' => false,
        ]);

        $this->assertFalse((new SettingsController())->authorize());
    }

    public function test_authorize_accepts_a_user_with_manage_options(): void
    {
        \WP_Mock::userFunction('current_user_can', [
            'args' => ['manage_options'],
            'return' => true,
        ]);

        $this->assertTrue((new SettingsController())->authorize());
    }

    public function test_handle_get_reports_disconnected_when_no_site_id_is_stored(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_api_base_url', 'https://api.syntaxwp.com'],
            'return' => 'https://api.syntaxwp.com',
        ]);

        $result = (new SettingsController())->handleGet();

        $this->assertSame(
            ['connected' => false, 'site_id' => '', 'api_base_url' => 'https://api.syntaxwp.com'],
            $result
        );
    }

    public function test_handle_get_never_returns_the_secret(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => 'site-123',
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_api_base_url', 'https://api.syntaxwp.com'],
            'return' => 'https://api.syntaxwp.com',
        ]);

        $result = (new SettingsController())->handleGet();

        $this->assertArrayNotHasKey('site_secret', $result);
        $this->assertSame('site-123', $result['site_id']);
        $this->assertTrue($result['connected']);
    }

    public function test_handle_post_persists_all_three_options_without_autoload(): void
    {
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_site_id', 'site-123', false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_site_secret', 'shh-secret', false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_api_base_url', 'https://staging.syntaxwp.com', false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('wp_http_validate_url', [
            'return' => 'https://staging.syntaxwp.com',
        ]);

        $request = $this->requestWith([
            'site_id' => 'site-123',
            'site_secret' => 'shh-secret',
            'api_base_url' => 'https://staging.syntaxwp.com',
        ]);

        $result = (new SettingsController())->handlePost($request);

        $this->assertSame(['connected' => true], $result);
    }

    public function test_handle_post_trims_whitespace_from_a_pasted_secret(): void
    {
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_site_id', 'site-123', false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_site_secret', 'shh-secret', false],
            'times' => 1,
        ]);

        $request = $this->requestWith([
            'site_id' => " site-123\n",
            'site_secret' => " shh-secret\n",
        ]);

        $result = (new SettingsController())->handlePost($request);

        $this->assertSame(['connected' => true], $result);
    }

    public function test_handle_post_rejects_a_missing_site_id_with_no_existing_connection(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => false,
        ]);

        $request = $this->requestWith(['site_secret' => 'shh-secret']);

        $result = (new SettingsController())->handlePost($request);

        $this->assertInstanceOf(\WP_Error::class, $result);
    }

    public function test_handle_post_rejects_an_invalid_api_base_url(): void
    {
        \WP_Mock::userFunction('wp_http_validate_url', ['return' => false]);

        $request = $this->requestWith([
            'site_id' => 'site-123',
            'site_secret' => 'shh-secret',
            'api_base_url' => 'not-a-url',
        ]);

        $result = (new SettingsController())->handlePost($request);

        $this->assertInstanceOf(\WP_Error::class, $result);
    }

    // A URL-only update from the already-connected admin panel omits
    // site_id/site_secret entirely (GET /settings never echoes the secret
    // back out) — the controller must fall back to what's already stored
    // rather than rejecting it as "missing fields".
    public function test_handle_post_falls_back_to_the_stored_id_and_secret_for_a_url_only_update(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => 'existing-site',
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'existing-secret',
        ]);
        \WP_Mock::userFunction('wp_http_validate_url', ['return' => 'https://staging.syntaxwp.com']);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_site_id', 'existing-site', false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_site_secret', 'existing-secret', false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_api_base_url', 'https://staging.syntaxwp.com', false],
            'times' => 1,
        ]);

        $request = $this->requestWith(['api_base_url' => 'https://staging.syntaxwp.com']);

        $result = (new SettingsController())->handlePost($request);

        $this->assertSame(['connected' => true], $result);
    }

    public function test_handle_disconnect_clears_connection_and_stale_state(): void
    {
        foreach (
            [
                'syntaxwp_site_id',
                'syntaxwp_site_secret',
                'syntaxwp_api_base_url',
                'syntaxwp_pending_events',
                'syntaxwp_safe_mode_active',
                'syntaxwp_safe_mode_failure_count',
            ] as $option
        ) {
            \WP_Mock::userFunction('delete_option', ['args' => [$option], 'times' => 1]);
        }

        $result = (new SettingsController())->handleDisconnect();

        $this->assertSame(['connected' => false], $result);
    }
}
