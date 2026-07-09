<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

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
}
