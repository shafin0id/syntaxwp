<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SyntaxWP\Plugin\Core\CapabilityRouter;

final class CapabilityRouterTest extends TestCase
{
    public function test_routes_to_wp7_native_when_wp7_and_mcp_available(): void
    {
        $router = new CapabilityRouter('7.0.1', true);
        $this->assertSame(CapabilityRouter::WP7_NATIVE, $router->detectExecutionPath());
    }

    public function test_routes_to_legacy_when_mcp_unavailable_even_on_wp7(): void
    {
        $router = new CapabilityRouter('7.2.0', false);
        $this->assertSame(CapabilityRouter::LEGACY_OUTBOUND, $router->detectExecutionPath());
    }

    public function test_routes_to_legacy_on_a_pre_wp7_version_even_if_mcp_reports_available(): void
    {
        $router = new CapabilityRouter('6.8.0', true);
        $this->assertSame(CapabilityRouter::LEGACY_OUTBOUND, $router->detectExecutionPath());
    }

    public function test_routes_to_legacy_when_neither_condition_holds(): void
    {
        $router = new CapabilityRouter('6.8.0', false);
        $this->assertSame(CapabilityRouter::LEGACY_OUTBOUND, $router->detectExecutionPath());
    }
}
