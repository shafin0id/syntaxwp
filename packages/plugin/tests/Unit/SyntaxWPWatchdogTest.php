<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Core\Hmac;
use WP_Mock\Tools\TestCase;

require_once dirname(__DIR__, 2) . '/mu-watchdog/SyntaxWPWatchdog.php';

/**
 * SyntaxWP_Watchdog is a plain global class, not PSR-4 autoloaded (see the
 * source file's own docblock for why) — required directly here instead.
 * SYNTAXWP_PLUGIN_TESTING (tests/bootstrap.php) stops the file's own
 * bottom-of-file `(new SyntaxWP_Watchdog())->register()` from firing on
 * require, so every test below controls its own instance instead of
 * inheriting one that already registered hooks outside the test's setup.
 */
final class SyntaxWPWatchdogTest extends TestCase
{
    public function test_maybe_check_skips_within_the_5_minute_interval(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_watchdog_last_check', 0],
            'return' => time() - 60,
        ]);
        \WP_Mock::userFunction('update_option', ['times' => 0]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        (new \SyntaxWP_Watchdog())->maybeCheck();
        $this->assertConditionsMet();
    }

    public function test_maybe_check_does_nothing_once_elapsed_when_the_main_plugin_is_healthy(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_watchdog_last_check', 0],
            'return' => time() - 400,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_watchdog_last_check', \WP_Mock\Functions::type('int'), false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $watchdog = new \SyntaxWP_Watchdog(static fn () => true);
        $watchdog->maybeCheck();
        $this->assertConditionsMet();
    }

    public function test_maybe_check_reports_down_once_elapsed_when_the_main_plugin_is_unhealthy(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_watchdog_last_check', 0],
            'return' => time() - 400,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_watchdog_last_check', \WP_Mock\Functions::type('int'), false],
            'times' => 1,
        ]);
        // reportDown()'s own behavior is covered directly by the
        // test_report_down_* tests below — here it's exercised for real
        // (not stubbed) since "site not connected" makes it a clean no-op,
        // proving maybeCheck() actually calls it without duplicating those
        // other tests' assertions.
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_id'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret'],
            'return' => false,
        ]);
        \WP_Mock::userFunction('wp_remote_post', ['times' => 0]);

        $watchdog = new \SyntaxWP_Watchdog(static fn () => false);
        $watchdog->maybeCheck();
        $this->assertConditionsMet();
    }

    public function test_check_main_plugin_health_checks_both_class_and_active_state(): void
    {
        \WP_Mock::userFunction('is_plugin_active', [
            'args' => ['syntaxwp/syntaxwp.php'],
            'return' => true,
        ]);

        // class_exists('SyntaxWP') is false in this harness (the real main
        // plugin class lives in syntaxwp.php, which this suite never
        // loads — it has its own load-time side effects) — so the default
        // health check must report unhealthy here even though
        // is_plugin_active() alone says yes, proving both conditions are
        // actually checked, not just one.
        $this->assertFalse(\SyntaxWP_Watchdog::checkMainPluginHealth());
    }

    public function test_report_down_is_a_no_op_when_the_site_is_not_yet_connected(): void
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

        (new \SyntaxWP_Watchdog())->reportDown();
        $this->assertConditionsMet();
    }

    public function test_report_down_sends_a_signed_plugin_crashed_event(): void
    {
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
        \WP_Mock::userFunction('wp_generate_uuid4', ['return' => 'watchdog-nonce']);
        \WP_Mock::userFunction('wp_json_encode', ['return_arg' => 0]);

        $captured = null;
        \WP_Mock::userFunction('wp_remote_post', ['times' => 1])->andReturnUsing(
            function ($url, $args) use (&$captured) {
                $captured = [$url, $args];

                return [];
            }
        );

        (new \SyntaxWP_Watchdog())->reportDown();

        [$url, $args] = $captured;
        $this->assertSame('https://api.syntaxwp.com/api/sites/site-123/events', $url);
        $this->assertFalse($args['blocking']);

        $sentPayload = $args['body'];
        $hmac = $sentPayload['hmac'];
        unset($sentPayload['hmac']);

        // Verified against core/Hmac.php's implementation (the
        // authoritative canonicalization this class's own sign() is a
        // deliberately-duplicated copy of, per the module docblock) —
        // proves the watchdog's minimal duplicate is faithful to the real
        // one, not just internally consistent with itself.
        $this->assertTrue(Hmac::verify($sentPayload, 'test-secret', $hmac));
        $this->assertSame('plugin_crashed', $sentPayload['events'][0]['type']);
    }
}
