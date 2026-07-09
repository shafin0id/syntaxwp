<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Core\EventQueue;
use SyntaxWP\Plugin\Core\Hmac;
use WP_Mock\Tools\TestCase;

final class EventQueueTest extends TestCase
{
    public function test_push_appends_to_the_pending_events_option_without_autoloading_it(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_pending_events', []],
            'return' => [['type' => 'existing_event']],
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => [
                'syntaxwp_pending_events',
                [['type' => 'existing_event'], ['type' => 'plugin_activated', 'slug' => 'yoast-seo']],
                false,
            ],
            'times' => 1,
        ]);

        EventQueue::push(['type' => 'plugin_activated', 'slug' => 'yoast-seo']);
        $this->assertConditionsMet();
    }

    public function test_flush_is_a_no_op_when_nothing_is_pending(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_pending_events', []],
            'return' => [],
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        (new EventQueue())->flush();
        $this->assertConditionsMet();
    }

    public function test_flush_sends_pending_events_signed_and_clears_the_option_on_success(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_pending_events', []],
            'return' => [['type' => 'plugin_activated', 'slug' => 'yoast-seo']],
        ]);
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
        \WP_Mock::userFunction('wp_generate_uuid4', ['return' => 'test-nonce']);
        \WP_Mock::userFunction('wp_json_encode', ['return_arg' => 0]);
        \WP_Mock::userFunction('is_wp_error', ['return' => false]);
        \WP_Mock::userFunction('wp_remote_retrieve_response_code', ['return' => 200]);
        \WP_Mock::userFunction('delete_option', [
            'args' => ['syntaxwp_pending_events'],
            'times' => 1,
        ]);

        $captured = null;
        \WP_Mock::userFunction('wp_remote_post', ['times' => 1])->andReturnUsing(
            function ($url, $args) use (&$captured) {
                $captured = [$url, $args];
                return ['response' => ['code' => 200]];
            }
        );

        (new EventQueue())->flush();

        [$url, $args] = $captured;
        $this->assertSame('https://api.syntaxwp.com/api/sites/site-123/events', $url);

        $sentPayload = $args['body'];
        $hmac = $sentPayload['hmac'];
        unset($sentPayload['hmac']);
        $this->assertTrue(Hmac::verify($sentPayload, 'test-secret', $hmac));
        $this->assertSame([['type' => 'plugin_activated', 'slug' => 'yoast-seo']], $sentPayload['events']);
    }

    public function test_flush_leaves_events_queued_when_the_request_fails(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_pending_events', []],
            'return' => [['type' => 'plugin_activated']],
        ]);
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
        \WP_Mock::userFunction('wp_generate_uuid4', ['return' => 'test-nonce']);
        \WP_Mock::userFunction('wp_json_encode', ['return_arg' => 0]);
        // is_wp_error() is stubbed directly below, so the exact shape
        // wp_remote_post() "fails" with doesn't matter — no real WP_Error
        // class exists in this WP_Mock harness to instantiate.
        \WP_Mock::userFunction('wp_remote_post', ['return' => 'network-error-placeholder']);
        \WP_Mock::userFunction('is_wp_error', ['return' => true]);
        \WP_Mock::userFunction('delete_option', ['times' => 0]);

        (new EventQueue())->flush();
        $this->assertConditionsMet();
    }
}
