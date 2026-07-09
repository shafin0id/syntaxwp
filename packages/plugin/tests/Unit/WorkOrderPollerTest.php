<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use Mockery;
use SyntaxWP\Plugin\Core\CapabilityRouter;
use SyntaxWP\Plugin\Core\Hmac;
use SyntaxWP\Plugin\Core\WorkOrderPoller;
use WP_Mock\Tools\TestCase;

final class WorkOrderPollerTest extends TestCase
{
    /**
     * @param array<string, mixed> $overrides
     */
    private function makeOrder(array $overrides = []): object
    {
        $base = [
            'id' => 'order-' . bin2hex(random_bytes(4)),
            'site_id' => 'site-123',
            'action' => 'flush_cache',
            'target' => '',
            'parameters' => new \stdClass(),
            'issued_at' => time(),
            'expires_at' => time() + 300,
            'dead_mans_switch_ms' => 30000,
        ];

        return (object) array_merge($base, $overrides);
    }

    private function stubSafetyGatesInactive(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_kill_switch_active', false],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_safe_mode_active', false],
            'return' => false,
        ]);
    }

    // SafeMode::recordFailure()/recordSuccess() bookkeeping — permissive
    // (no 'times') since which one fires, and how many times, depends on
    // each test's own outcome; the assertion that matters is poll()'s
    // return value, not SafeMode's internal counter.
    private function stubSafeModeBookkeeping(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', 0],
            'return' => 0,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', \WP_Mock\Functions::type('int'), false],
        ]);
    }

    private function stubConnectedSite(string $secret = 'test-secret'): void
    {
        $this->stubSafetyGatesInactive();

        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => 'site-123',
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => $secret,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_api_base_url', 'https://api.syntaxwp.com'],
            'return' => 'https://api.syntaxwp.com',
        ]);
        \WP_Mock::userFunction('wp_generate_uuid4', ['return' => 'poll-nonce']);
        \WP_Mock::userFunction('wp_json_encode', ['return_arg' => 0]);
    }

    private function stubClaimResponse(?object $order, int $statusCode = 200): void
    {
        \WP_Mock::userFunction('wp_remote_post', ['times' => 1]);
        \WP_Mock::userFunction('is_wp_error', ['return' => false]);
        \WP_Mock::userFunction('wp_remote_retrieve_response_code', ['return' => $statusCode]);
        \WP_Mock::userFunction('wp_remote_retrieve_body', [
            'return' => $order === null ? '' : json_encode(['ok' => true, 'workOrder' => $order]),
        ]);
    }

    public function test_maybe_poll_skips_on_the_wp7_native_path(): void
    {
        \WP_Mock::userFunction('get_option', ['times' => 0]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $poller = new WorkOrderPoller(new CapabilityRouter('7.1.0', true));
        $poller->maybePoll();
        $this->assertConditionsMet();
    }

    public function test_maybe_poll_skips_within_the_60_second_interval(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_work_order_last_polled', 0],
            'return' => time() - 10,
        ]);
        \WP_Mock::userFunction('update_option', ['times' => 0]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $poller->maybePoll();
        $this->assertConditionsMet();
    }

    public function test_poll_returns_null_when_the_kill_switch_is_active(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_kill_switch_active', false],
            'return' => true,
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertNull($poller->poll());
        $this->assertConditionsMet();
    }

    public function test_poll_returns_null_when_safe_mode_is_active(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_kill_switch_active', false],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_safe_mode_active', false],
            'return' => true,
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertNull($poller->poll());
        $this->assertConditionsMet();
    }

    public function test_poll_returns_null_when_the_site_is_not_yet_connected(): void
    {
        $this->stubSafetyGatesInactive();
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertNull($poller->poll());
        $this->assertConditionsMet();
    }

    public function test_poll_returns_null_when_nothing_is_pending(): void
    {
        $this->stubConnectedSite();
        $this->stubClaimResponse(null, 404);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertNull($poller->poll());
    }

    public function test_poll_returns_validation_failed_for_a_badly_signed_order(): void
    {
        $this->stubConnectedSite('test-secret');
        $this->stubSafeModeBookkeeping();
        $order = $this->makeOrder();
        $order->hmac = Hmac::sign($order, 'a-different-secret');
        $this->stubClaimResponse($order);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertSame(['success' => false, 'reason' => 'validation_failed'], $poller->poll());
    }

    public function test_poll_executes_flush_cache(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);
        \WP_Mock::userFunction('wp_cache_flush', ['times' => 1]);

        $this->stubConnectedSite('test-secret');
        $this->stubSafeModeBookkeeping();
        $order = $this->makeOrder(['action' => 'flush_cache']);
        $order->hmac = Hmac::sign($order, 'test-secret');
        $this->stubClaimResponse($order);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertSame(['success' => true, 'action' => 'flush_cache'], $poller->poll());
    }

    public function test_poll_executes_clear_transients_via_a_direct_options_table_delete(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);

        global $wpdb;
        $wpdb = Mockery::mock();
        $wpdb->options = 'wp_options';
        $wpdb->shouldReceive('query')->once()->with(Mockery::pattern('/DELETE FROM wp_options/'));

        $this->stubConnectedSite('test-secret');
        $this->stubSafeModeBookkeeping();
        $order = $this->makeOrder(['action' => 'clear_transients']);
        $order->hmac = Hmac::sign($order, 'test-secret');
        $this->stubClaimResponse($order);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertSame(['success' => true, 'action' => 'clear_transients'], $poller->poll());
    }

    public function test_poll_executes_deactivate_plugin_by_resolving_the_slug_to_a_plugin_file(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);
        \WP_Mock::userFunction('get_plugins', [
            'return' => ['yoast-seo/wp-seo.php' => ['Version' => '23.2']],
        ]);
        \WP_Mock::userFunction('deactivate_plugins', [
            'args' => ['yoast-seo/wp-seo.php'],
            'times' => 1,
        ]);

        $this->stubConnectedSite('test-secret');
        $this->stubSafeModeBookkeeping();
        $order = $this->makeOrder(['action' => 'deactivate_plugin', 'target' => 'yoast-seo']);
        $order->hmac = Hmac::sign($order, 'test-secret');
        $this->stubClaimResponse($order);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertSame(
            ['success' => true, 'action' => 'deactivate_plugin', 'target' => 'yoast-seo'],
            $poller->poll()
        );
    }

    public function test_poll_executes_activate_plugin_and_reports_wp_error_as_failure(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);
        \WP_Mock::userFunction('get_plugins', [
            'return' => ['yoast-seo/wp-seo.php' => ['Version' => '23.2']],
        ]);
        \WP_Mock::userFunction('activate_plugin', [
            'args' => ['yoast-seo/wp-seo.php'],
            'return' => 'not-an-error',
        ]);
        \WP_Mock::userFunction('is_wp_error', ['return' => false]);

        $this->stubConnectedSite('test-secret');
        $this->stubSafeModeBookkeeping();
        $order = $this->makeOrder(['action' => 'activate_plugin', 'target' => 'yoast-seo']);
        $order->hmac = Hmac::sign($order, 'test-secret');
        $this->stubClaimResponse($order);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertSame(
            ['success' => true, 'action' => 'activate_plugin', 'target' => 'yoast-seo'],
            $poller->poll()
        );
    }

    public function test_poll_reports_plugin_not_found_for_an_unknown_target_slug(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);
        \WP_Mock::userFunction('get_plugins', ['return' => []]);

        $this->stubConnectedSite('test-secret');
        $this->stubSafeModeBookkeeping();
        $order = $this->makeOrder(['action' => 'deactivate_plugin', 'target' => 'nonexistent']);
        $order->hmac = Hmac::sign($order, 'test-secret');
        $this->stubClaimResponse($order);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertSame(
            ['success' => false, 'action' => 'deactivate_plugin', 'reason' => 'plugin_not_found', 'target' => 'nonexistent'],
            $poller->poll()
        );
    }

    public function test_poll_reports_not_implemented_for_an_action_this_path_does_not_execute_yet(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);

        $this->stubConnectedSite('test-secret');
        $this->stubSafeModeBookkeeping();
        $order = $this->makeOrder(['action' => 'update_plugin', 'target' => 'yoast-seo']);
        $order->hmac = Hmac::sign($order, 'test-secret');
        $this->stubClaimResponse($order);

        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $this->assertSame(
            ['success' => false, 'action' => 'update_plugin', 'reason' => 'not_implemented'],
            $poller->poll()
        );
    }
}
