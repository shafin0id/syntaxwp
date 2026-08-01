<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Monitoring;

use SyntaxWP\Plugin\Core\EventQueue;

/**
 * WooCommerce checkout/order event hooks (§2, §11.2). This is the only real
 * customer-traffic failure signal in the system — the daily synthetic
 * Playwright checkout (apps/api/src/worker/tasks/synthetic-checkout.ts) only
 * catches a broken checkout page, not a real payment declining.
 *
 * Diverges from the architecture doc's own snippet in one place: the doc
 * wires failure detection through `woocommerce_payment_complete_order_status`,
 * but that's a *filter* WooCommerce calls to decide what status a
 * successfully-completed payment should be given — it's never invoked with
 * "failed". `woocommerce_order_status_failed` is WooCommerce's actual,
 * documented action hook for "an order just transitioned to failed", so
 * that's what this uses instead.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class WooCommerceHooks
{
    public function registerHooks(): void
    {
        if (!class_exists('WooCommerce')) {
            return;
        }

        add_action('woocommerce_checkout_order_created', [$this, 'onOrderCreated']);
        add_action('woocommerce_order_status_failed', [$this, 'onOrderFailed']);
    }

    /**
     * Informational status tracking only — batched with the next EventQueue
     * flush, not a failure alert, so no immediate outbound call here.
     *
     * @param mixed $order
     */
    public function onOrderCreated($order): void
    {
        if (!is_object($order) || !method_exists($order, 'get_id')) {
            return;
        }

        EventQueue::push([
            'type' => 'checkout_created',
            // Never the real order ID — only its hash, so this can't be used
            // to identify a specific customer/order (§11.2).
            'order_id_hash' => hash('sha256', (string) $order->get_id()),
            'payment_method' => method_exists($order, 'get_payment_method') ? $order->get_payment_method() : '',
            'timestamp' => time(),
        ]);
    }

    /**
     * @param int $orderId
     */
    public function onOrderFailed($orderId): void
    {
        $order = function_exists('wc_get_order') ? wc_get_order($orderId) : false;
        $paymentMethod = ($order && method_exists($order, 'get_payment_method')) ? $order->get_payment_method() : 'unknown';

        $this->reportFailure(sprintf(
            'Checkout failed via %s (order #%s).',
            $paymentMethod,
            hash('sha256', (string) $orderId)
        ));
    }

    private function reportFailure(string $errorMessage): void
    {
        $siteId = get_option('syntaxwp_site_id');
        $secret = get_option('syntaxwp_site_secret');
        if (!$siteId || !$secret) {
            return; // not yet connected
        }

        $base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');
        $url = rtrim((string) $base, '/') . '/api/sites/woocommerce/failed-checkout';

        // Fire-and-forget: the plugin's resource budget (§4.4) forbids
        // network calls on the request-critical path, so this can't
        // actually block for a response — this is as close to "immediate,
        // don't batch" (§11.2) as that constraint allows.
        wp_remote_post($url, [
            'body' => wp_json_encode(['site_id' => $siteId, 'error_message' => $errorMessage]),
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $secret,
            ],
            'timeout' => 3,
            'blocking' => false,
        ]);
    }
}
