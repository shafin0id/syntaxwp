<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SyntaxWP\Plugin\Safety\ActionWhitelist;

final class ActionWhitelistTest extends TestCase
{
    public function test_allows_a_known_action(): void
    {
        $this->assertTrue(ActionWhitelist::isAllowed('flush_cache'));
    }

    public function test_never_allows_run_arbitrary_command_even_though_it_exists_in_the_ts_action_enum(): void
    {
        $this->assertFalse(ActionWhitelist::isAllowed('run_arbitrary_command'));
    }

    public function test_rejects_an_unknown_action(): void
    {
        $this->assertFalse(ActionWhitelist::isAllowed('reboot_server'));
    }

    public function test_exposes_exactly_twelve_allowed_actions(): void
    {
        $this->assertCount(12, ActionWhitelist::allowedActions());
    }
}
