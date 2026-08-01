<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Core\Hmac;
use SyntaxWP\Plugin\Wp7\ActionExecutor;
use SyntaxWP\Plugin\Wp7\MCPEndpoints;
use WP_Mock\Tools\TestCase;

final class MCPEndpointsTest extends TestCase
{
    public function tearDown(): void
    {
        unset($_SERVER['REMOTE_ADDR']);
        parent::tearDown();
    }

    public function test_is_loopback_request_accepts_ipv4_localhost(): void
    {
        $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
        $this->assertTrue((new MCPEndpoints())->isLoopbackRequest());
    }

    public function test_is_loopback_request_accepts_ipv6_localhost(): void
    {
        $_SERVER['REMOTE_ADDR'] = '::1';
        $this->assertTrue((new MCPEndpoints())->isLoopbackRequest());
    }

    public function test_is_loopback_request_rejects_a_remote_address(): void
    {
        $_SERVER['REMOTE_ADDR'] = '203.0.113.5';
        $this->assertFalse((new MCPEndpoints())->isLoopbackRequest());
    }

    public function test_is_loopback_request_rejects_a_missing_remote_addr(): void
    {
        unset($_SERVER['REMOTE_ADDR']);
        $this->assertFalse((new MCPEndpoints())->isLoopbackRequest());
    }

    public function test_execute_ability_delegates_to_the_injected_action_executor(): void
    {
        \WP_Mock::userFunction('wp_cache_flush', ['times' => 1]);

        $endpoints = new MCPEndpoints(new ActionExecutor());
        $result = $endpoints->executeAbility(['ability' => 'syntaxwp/flush-cache', 'input' => []]);

        $this->assertSame(['success' => true, 'action' => 'flush_cache'], $result);
    }

    public function test_execute_ability_passes_the_input_target_through(): void
    {
        \WP_Mock::userFunction('get_plugins', [
            'return' => ['yoast-seo/wp-seo.php' => ['Version' => '23.2']],
        ]);
        \WP_Mock::userFunction('deactivate_plugins', [
            'args' => ['yoast-seo/wp-seo.php'],
            'times' => 1,
        ]);

        $endpoints = new MCPEndpoints(new ActionExecutor());
        $result = $endpoints->executeAbility([
            'ability' => 'syntaxwp/deactivate-plugin',
            'input' => ['target' => 'yoast-seo'],
        ]);

        $this->assertSame(
            ['success' => true, 'action' => 'deactivate_plugin', 'target' => 'yoast-seo'],
            $result
        );
    }

    public function test_execute_ability_rejects_an_ability_outside_the_syntaxwp_namespace(): void
    {
        $endpoints = new MCPEndpoints();
        $result = $endpoints->executeAbility(['ability' => 'other-plugin/do-something']);

        $this->assertSame(
            ['success' => false, 'reason' => 'unknown_ability', 'ability' => 'other-plugin/do-something'],
            $result
        );
    }

    public function test_execute_ability_rejects_a_missing_ability_param(): void
    {
        $endpoints = new MCPEndpoints();
        $result = $endpoints->executeAbility([]);

        $this->assertSame(['success' => false, 'reason' => 'unknown_ability', 'ability' => ''], $result);
    }

    public function test_handle_execute_extracts_json_params_from_the_request_object(): void
    {
        \WP_Mock::userFunction('wp_cache_flush', ['times' => 1]);

        $request = new class {
            public function get_json_params(): array
            {
                return ['ability' => 'syntaxwp/flush-cache', 'input' => []];
            }
        };

        $endpoints = new MCPEndpoints(new ActionExecutor());
        $this->assertSame(
            ['success' => true, 'action' => 'flush_cache'],
            $endpoints->handleExecute($request)
        );
    }

    // verifySignedRequest() is the real security boundary here (see the
    // class docblock — REMOTE_ADDR alone is not sufficient authentication,
    // caught by a background security review before this shipped). These
    // tests exist specifically to prove a request can't get through
    // without a valid, fresh, correctly-secret-signed payload.

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function signedParams(string $secret, array $overrides = []): array
    {
        $payload = array_merge(
            ['ability' => 'syntaxwp/flush-cache', 'input' => [], 'timestamp' => time(), 'nonce' => 'mcp-nonce'],
            $overrides
        );
        $payload['hmac'] = Hmac::sign($payload, $secret);

        return $payload;
    }

    public function test_verify_signed_request_accepts_a_correctly_signed_fresh_unreplayed_request(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);

        $endpoints = new MCPEndpoints();
        $this->assertTrue($endpoints->verifySignedRequest($this->signedParams('test-secret')));
    }

    public function test_verify_signed_request_rejects_when_the_site_is_not_yet_connected(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => false,
        ]);

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->verifySignedRequest($this->signedParams('test-secret')));
    }

    public function test_verify_signed_request_rejects_a_missing_hmac(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);

        $params = $this->signedParams('test-secret');
        unset($params['hmac']);

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->verifySignedRequest($params));
    }

    public function test_verify_signed_request_rejects_the_wrong_secret(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->verifySignedRequest($this->signedParams('wrong-secret')));
    }

    public function test_verify_signed_request_rejects_a_tampered_field(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);

        $params = $this->signedParams('test-secret');
        $params['ability'] = 'syntaxwp/deactivate-plugin'; // tampered after signing

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->verifySignedRequest($params));
    }

    public function test_verify_signed_request_rejects_a_stale_timestamp(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);

        $params = $this->signedParams('test-secret', ['timestamp' => time() - 301]);

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->verifySignedRequest($params));
    }

    public function test_verify_signed_request_rejects_a_replayed_nonce(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);
        \WP_Mock::userFunction('get_transient', ['return' => 1]);

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->verifySignedRequest($this->signedParams('test-secret')));
    }

    public function test_authorize_request_rejects_a_valid_signature_from_a_non_loopback_address(): void
    {
        $_SERVER['REMOTE_ADDR'] = '203.0.113.5';

        $request = new class {
            public function get_json_params(): array
            {
                return [];
            }
        };

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->authorizeRequest($request));
    }

    public function test_authorize_request_rejects_loopback_without_a_valid_signature(): void
    {
        $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);

        // No hmac/timestamp/nonce at all — the exact "loopback happened to
        // be true for the wrong reason (reverse proxy), attacker has no
        // secret" scenario this class exists to close off.
        $request = new class {
            public function get_json_params(): array
            {
                return ['ability' => 'syntaxwp/flush-cache'];
            }
        };

        $endpoints = new MCPEndpoints();
        $this->assertFalse($endpoints->authorizeRequest($request));
    }
}
