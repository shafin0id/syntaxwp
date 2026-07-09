<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

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

    // Actual per-action execution behavior (flush_cache, clear_transients,
    // activate/deactivate_plugin, plugin_not_found, not_implemented) is
    // exhaustively covered in ActionExecutorTest.php now that A7.1
    // extracted that logic out — these two just prove poll() actually
    // delegates to it and reacts correctly to success/failure, not
    // re-testing the underlying WP calls a second time.
    public function test_poll_delegates_to_the_action_executor_and_records_a_safe_mode_success(): void
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

    public function test_poll_records_a_safe_mode_failure_when_the_executor_reports_failure(): void
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
