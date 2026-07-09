<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Safety\KillSwitch;
use WP_Mock\Tools\TestCase;

final class KillSwitchTest extends TestCase
{
    public function test_is_active_reflects_the_stored_option(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_kill_switch_active', false],
            'return' => true,
        ]);

        $this->assertTrue(KillSwitch::isActive());
    }

    public function test_defaults_to_inactive(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_kill_switch_active', false],
            'return' => false,
        ]);

        $this->assertFalse(KillSwitch::isActive());
    }

    public function test_activate_stores_true(): void
    {
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_kill_switch_active', true, false],
            'times' => 1,
        ]);

        KillSwitch::activate();
        $this->assertConditionsMet();
    }

    public function test_deactivate_stores_false(): void
    {
        \WP_Mock::userFunction('update_option', [
            'args' => ['syntaxwp_kill_switch_active', false, false],
            'times' => 1,
        ]);

        KillSwitch::deactivate();
        $this->assertConditionsMet();
    }
}
