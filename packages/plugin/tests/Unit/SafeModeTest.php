<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Safety\SafeMode;
use WP_Mock\Tools\TestCase;

final class SafeModeTest extends TestCase
{
    public function test_is_active_reflects_the_stored_option(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_safe_mode_active', false],
            'return' => true,
        ]);

        $this->assertTrue(SafeMode::isActive());
    }

    public function test_record_failure_increments_the_counter_without_activating_below_threshold(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', 0],
            'return' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', 2, false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_active', true, false],
            'times' => 0,
        ]);

        SafeMode::recordFailure();
        $this->assertConditionsMet();
    }

    public function test_record_failure_activates_safe_mode_once_the_threshold_is_reached(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', 0],
            'return' => 2,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_active', true, false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', 0, false],
            'times' => 1,
        ]);

        SafeMode::recordFailure();
        $this->assertConditionsMet();
    }

    public function test_record_success_resets_the_failure_counter(): void
    {
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', 0, false],
            'times' => 1,
        ]);

        SafeMode::recordSuccess();
        $this->assertConditionsMet();
    }

    public function test_reset_clears_both_active_flag_and_counter(): void
    {
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_active', false, false],
            'times' => 1,
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_safe_mode_failure_count', 0, false],
            'times' => 1,
        ]);

        SafeMode::reset();
        $this->assertConditionsMet();
    }
}
