<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use Mockery;
use SyntaxWP\Plugin\Wp7\ActionExecutor;
use WP_Mock\Tools\TestCase;

final class ActionExecutorTest extends TestCase
{
    public function test_flush_cache(): void
    {
        \WP_Mock::userFunction('wp_cache_flush', ['times' => 1]);

        $this->assertSame(
            ['success' => true, 'action' => 'flush_cache'],
            (new ActionExecutor())->execute('flush_cache')
        );
    }

    public function test_clear_transients_via_a_direct_options_table_delete(): void
    {
        global $wpdb;
        $wpdb = Mockery::mock();
        $wpdb->options = 'wp_options';
        $wpdb->shouldReceive('query')->once()->with(Mockery::pattern('/DELETE FROM wp_options/'));

        $this->assertSame(
            ['success' => true, 'action' => 'clear_transients'],
            (new ActionExecutor())->execute('clear_transients')
        );
    }

    public function test_deactivate_plugin_by_resolving_the_slug_to_a_plugin_file(): void
    {
        \WP_Mock::userFunction('get_plugins', [
            'return' => ['yoast-seo/wp-seo.php' => ['Version' => '23.2']],
        ]);
        \WP_Mock::userFunction('deactivate_plugins', [
            'args' => ['yoast-seo/wp-seo.php'],
            'times' => 1,
        ]);

        $this->assertSame(
            ['success' => true, 'action' => 'deactivate_plugin', 'target' => 'yoast-seo'],
            (new ActionExecutor())->execute('deactivate_plugin', 'yoast-seo')
        );
    }

    public function test_activate_plugin_reports_a_wp_error_result_as_failure(): void
    {
        \WP_Mock::userFunction('get_plugins', [
            'return' => ['yoast-seo/wp-seo.php' => ['Version' => '23.2']],
        ]);
        \WP_Mock::userFunction('activate_plugin', [
            'args' => ['yoast-seo/wp-seo.php'],
            'return' => 'not-an-error',
        ]);
        \WP_Mock::userFunction('is_wp_error', ['return' => false]);

        $this->assertSame(
            ['success' => true, 'action' => 'activate_plugin', 'target' => 'yoast-seo'],
            (new ActionExecutor())->execute('activate_plugin', 'yoast-seo')
        );
    }

    public function test_reports_plugin_not_found_for_an_unknown_target_slug(): void
    {
        \WP_Mock::userFunction('get_plugins', ['return' => []]);

        $this->assertSame(
            ['success' => false, 'action' => 'deactivate_plugin', 'reason' => 'plugin_not_found', 'target' => 'nonexistent'],
            (new ActionExecutor())->execute('deactivate_plugin', 'nonexistent')
        );
    }

    public function test_reports_not_implemented_for_an_action_this_executor_does_not_handle_yet(): void
    {
        $this->assertSame(
            ['success' => false, 'action' => 'update_plugin', 'reason' => 'not_implemented'],
            (new ActionExecutor())->execute('update_plugin', 'yoast-seo')
        );
    }
}
