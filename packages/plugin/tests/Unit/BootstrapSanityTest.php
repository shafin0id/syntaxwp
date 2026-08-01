<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use PHPUnit\Framework\TestCase;
use WP_Mock\Tools\TestCase as WPMockTestCase;

// Proves the harness itself works — WP_Mock intercepts a core WP function
// call without a live WordPress install. Every other Unit test in this
// suite extends WP_Mock's TestCase the same way; this one exists purely so
// a broken harness fails here first, not inside a real feature test.
final class BootstrapSanityTest extends WPMockTestCase
{
    public function test_wp_mock_intercepts_a_core_function(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_site_secret', null],
            'return' => 'mocked-secret',
        ]);

        $this->assertSame('mocked-secret', get_option('syntaxwp_site_secret', null));
    }
}
