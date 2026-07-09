<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use Mockery;
use SyntaxWP\Plugin\Core\CapabilityRouter;
use SyntaxWP\Plugin\Core\Heartbeat;
use SyntaxWP\Plugin\Core\Hmac;
use WP_Mock\Tools\TestCase;

final class HeartbeatTest extends TestCase
{
    private function stubInventory(): void
    {
        \WP_Mock::userFunction('get_plugins', [
            'return' => [
                'yoast-seo/wp-seo.php' => ['Version' => '23.2'],
                'hello.php' => ['Version' => '1.7'],
            ],
        ]);
        \WP_Mock::userFunction('is_plugin_active', [
            'args' => ['yoast-seo/wp-seo.php'],
            'return' => true,
        ]);
        \WP_Mock::userFunction('is_plugin_active', [
            'args' => ['hello.php'],
            'return' => false,
        ]);

        $theme = Mockery::mock();
        $theme->shouldReceive('get_stylesheet')->andReturn('astra');
        $theme->shouldReceive('get')->with('Version')->andReturn('4.6.2');
        \WP_Mock::userFunction('wp_get_theme', ['return' => $theme]);
    }

    private function stubDbSizeQueries(): void
    {
        global $wpdb;
        $wpdb = Mockery::mock();
        $wpdb->options = 'wp_options';
        $wpdb->shouldReceive('prepare')->andReturnUsing(
            static fn (string $query, ...$args) => vsprintf(str_replace('%s', "'%s'", $query), $args)
        );
        $wpdb->shouldReceive('get_var')->andReturn('1048576', '2048');
    }

    public function test_build_payload_reports_inventory_theme_and_php_version(): void
    {
        \WP_Mock::userFunction('get_bloginfo', ['args' => ['version'], 'return' => '7.1.0']);
        \WP_Mock::userFunction('wp_generate_uuid4', ['return' => 'test-nonce']);
        $this->stubInventory();
        $this->stubDbSizeQueries();

        $heartbeat = new Heartbeat(new CapabilityRouter('7.1.0', true));
        $payload = $heartbeat->buildPayload('site-123');

        $this->assertSame('site-123', $payload['site_id']);
        $this->assertSame('test-nonce', $payload['nonce']);
        $this->assertSame('7.1.0', $payload['wp_version']);
        $this->assertSame(CapabilityRouter::WP7_NATIVE, $payload['execution_path']);
        $this->assertSame(PHP_VERSION, $payload['php_version']);
        $this->assertSame(
            [
                ['slug' => 'yoast-seo', 'version' => '23.2', 'active' => true],
                ['slug' => 'hello', 'version' => '1.7', 'active' => false],
            ],
            $payload['plugins']
        );
        $this->assertSame(['slug' => 'astra', 'version' => '4.6.2'], $payload['theme']);
    }

    public function test_send_signs_the_payload_with_the_stored_site_secret(): void
    {
        \WP_Mock::userFunction('get_bloginfo', ['args' => ['version'], 'return' => '7.1.0']);
        \WP_Mock::userFunction('wp_generate_uuid4', ['return' => 'test-nonce']);
        $this->stubInventory();
        $this->stubDbSizeQueries();

        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => 'site-123',
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => 'test-secret',
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_api_base_url', 'https://api.syntaxwp.com'],
            'return' => 'https://api.syntaxwp.com',
        ]);
        \WP_Mock::userFunction('wp_json_encode', [
            'return_arg' => 0,
        ]);

        $captured = null;
        \WP_Mock::userFunction('wp_remote_post', [
            'times' => 1,
        ])->andReturnUsing(function ($url, $args) use (&$captured) {
            $captured = [$url, $args];
            return [];
        });

        $heartbeat = new Heartbeat(new CapabilityRouter('7.1.0', true));
        $heartbeat->send();

        [$url, $args] = $captured;
        $this->assertSame('https://api.syntaxwp.com/api/sites/site-123/heartbeat', $url);
        $this->assertFalse($args['blocking']);

        $sentPayload = $args['body'];
        $hmac = $sentPayload['hmac'];
        unset($sentPayload['hmac']);
        $this->assertTrue(Hmac::verify($sentPayload, 'test-secret', $hmac));
    }

    public function test_send_is_a_no_op_when_the_site_is_not_yet_connected(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $heartbeat = new Heartbeat(new CapabilityRouter('7.1.0', true));
        $heartbeat->send();
        $this->assertConditionsMet(); // verifies wp_remote_post's times=>0 expectation
    }

    public function test_maybe_send_skips_within_the_60_second_interval(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_heartbeat_last_sent', 0],
            'return' => time() - 10,
        ]);
        \WP_Mock::userFunction('update_option', ['times' => 0]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $heartbeat = new Heartbeat(new CapabilityRouter('7.1.0', true));
        $heartbeat->maybeSend();
        $this->assertConditionsMet(); // verifies update_option/wp_remote_post's times=>0 expectations
    }

    public function test_maybe_send_fires_once_the_interval_has_elapsed(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_heartbeat_last_sent', 0],
            'return' => time() - 61,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_heartbeat_last_sent', \WP_Mock\Functions::type('int'), false],
            'times' => 1,
        ]);
        // send() itself is exercised by the tests above — here we only
        // care that maybeSend() decided to call it, so let get_option for
        // the connection check short-circuit send() immediately.
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $heartbeat = new Heartbeat(new CapabilityRouter('7.1.0', true));
        $heartbeat->maybeSend();
        $this->assertConditionsMet(); // verifies update_option ran and wp_remote_post's times=>0
    }
}
