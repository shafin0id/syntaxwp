<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Core\Hmac;
use SyntaxWP\Plugin\Safety\WorkOrderValidator;
use WP_Mock\Tools\TestCase;

final class WorkOrderValidatorTest extends TestCase
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

    public function test_accepts_a_correctly_signed_unexpired_whitelisted_unreplayed_order(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);

        $order = $this->makeOrder();
        $order->hmac = Hmac::sign($order, 'secret');

        $this->assertTrue((new WorkOrderValidator())->validate($order, 'secret'));
    }

    public function test_rejects_when_hmac_is_missing(): void
    {
        $order = $this->makeOrder();

        $this->assertFalse((new WorkOrderValidator())->validate($order, 'secret'));
    }

    public function test_rejects_a_tampered_field_even_though_the_signature_is_present(): void
    {
        $order = $this->makeOrder();
        $order->hmac = Hmac::sign($order, 'secret');
        $order->action = 'delete_plugin'; // tampered after signing

        $this->assertFalse((new WorkOrderValidator())->validate($order, 'secret'));
    }

    public function test_rejects_the_wrong_secret(): void
    {
        $order = $this->makeOrder();
        $order->hmac = Hmac::sign($order, 'secret');

        $this->assertFalse((new WorkOrderValidator())->validate($order, 'wrong-secret'));
    }

    public function test_rejects_an_expired_order(): void
    {
        $order = $this->makeOrder(['expires_at' => time() - 10]);
        $order->hmac = Hmac::sign($order, 'secret');

        $this->assertFalse((new WorkOrderValidator())->validate($order, 'secret'));
    }

    public function test_rejects_a_replayed_nonce(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => 1]);

        $order = $this->makeOrder();
        $order->hmac = Hmac::sign($order, 'secret');

        $this->assertFalse((new WorkOrderValidator())->validate($order, 'secret'));
    }

    public function test_rejects_a_non_whitelisted_action_even_when_correctly_signed(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);

        $order = $this->makeOrder(['action' => 'run_arbitrary_command']);
        $order->hmac = Hmac::sign($order, 'secret');

        $this->assertFalse((new WorkOrderValidator())->validate($order, 'secret'));
    }

    public function test_accepts_an_order_whose_parameters_is_an_empty_object(): void
    {
        \WP_Mock::userFunction('get_transient', ['return' => false]);
        \WP_Mock::userFunction('set_transient', ['times' => 1]);

        // Regression guard for the {} vs [] round-trip Hmac.php's docblock
        // describes — parameters is explicitly an empty stdClass, not a
        // plain array, matching what json_decode($json) (no assoc flag)
        // produces for `"parameters": {}` on the wire.
        $order = $this->makeOrder(['parameters' => new \stdClass()]);
        $order->hmac = Hmac::sign($order, 'secret');

        $this->assertTrue((new WorkOrderValidator())->validate($order, 'secret'));
    }
}
