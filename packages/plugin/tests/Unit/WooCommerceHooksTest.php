<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Monitoring\WooCommerceHooks;
use WP_Mock\Tools\TestCase;

final class WooCommerceHooksTest extends TestCase
{
    public function test_registers_no_hooks_when_woocommerce_is_not_active(): void
    {
        // No `WooCommerce` class exists in this test environment, matching
        // a site with the plugin active but WooCommerce not installed.
        \WP_Mock::userFunction('add_action', ['times' => 0]);

        (new WooCommerceHooks())->registerHooks();
        $this->assertConditionsMet();
    }

    public function test_on_order_created_pushes_a_hashed_event_not_the_real_order_id(): void
    {
        $order = new class {
            public function get_id(): int
            {
                return 42;
            }
            public function get_payment_method(): string
            {
                return "stripe";
            }
        };

        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_pending_events', []],
            'return' => [],
        ]);

        $captured = null;
        \WP_Mock::userFunction('update_option', ['times' => 1])->andReturnUsing(
            function ($key, $value) use (&$captured) {
                $captured = $value;
                return true;
            }
        );

        (new WooCommerceHooks())->onOrderCreated($order);

        $this->assertCount(1, $captured);
        $event = $captured[0];
        $this->assertSame('checkout_created', $event['type']);
        $this->assertSame(hash('sha256', '42'), $event['order_id_hash']);
        $this->assertSame('stripe', $event['payment_method']);
        $this->assertArrayNotHasKey('order_id', $event);
    }

    public function test_on_order_failed_reports_immediately_when_connected(): void
    {
        \WP_Mock::userFunction('wc_get_order', [
            'args' => [7],
            'return' => new class {
                public function get_payment_method(): string
                {
                    return "paypal";
                }
            },
        ]);
        \WP_Mock::userFunction('get_option', ['args' => ['syntaxwp_site_id'], 'return' => 'site-123']);
        \WP_Mock::userFunction('get_option', ['args' => ['syntaxwp_site_secret'], 'return' => 'test-secret']);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_api_base_url', 'https://api.syntaxwp.com'],
            'return' => 'https://api.syntaxwp.com',
        ]);
        \WP_Mock::userFunction('wp_json_encode', ['return_arg' => 0]);

        $captured = null;
        \WP_Mock::userFunction('wp_remote_post', ['times' => 1])->andReturnUsing(
            function ($url, $args) use (&$captured) {
                $captured = [$url, $args];
                return ['response' => ['code' => 200]];
            }
        );

        (new WooCommerceHooks())->onOrderFailed(7);

        [$url, $args] = $captured;
        $this->assertSame('https://api.syntaxwp.com/api/sites/woocommerce/failed-checkout', $url);
        $this->assertSame('site-123', $args['body']['site_id']);
        $this->assertStringContainsString('paypal', $args['body']['error_message']);
        $this->assertStringContainsString(hash('sha256', '7'), $args['body']['error_message']);
        $this->assertSame('Bearer test-secret', $args['headers']['Authorization']);
        $this->assertFalse($args['blocking']);
    }

    public function test_on_order_failed_does_nothing_when_not_yet_connected(): void
    {
        \WP_Mock::userFunction('wc_get_order', ['return' => false]);
        \WP_Mock::userFunction('get_option', ['args' => ['syntaxwp_site_id'], 'return' => false]);
        \WP_Mock::userFunction('get_option', ['args' => ['syntaxwp_site_secret'], 'return' => false]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        (new WooCommerceHooks())->onOrderFailed(7);
        $this->assertConditionsMet();
    }
}
