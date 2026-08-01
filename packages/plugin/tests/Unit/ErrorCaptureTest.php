<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Core\ErrorCapture;
use WP_Mock\Tools\TestCase;

final class ErrorCaptureTest extends TestCase
{
    public function test_reports_a_captured_fatal_as_an_event(): void
    {
        \WP_Mock::userFunction('get_option', [
            'args' => ['syntaxwp_pending_events', []],
            'return' => [],
        ]);
        \WP_Mock::userFunction('update_option', [
            'args' => [
                'syntaxwp_pending_events',
                [[
                    'type' => 'fatal_error',
                    'summary' => 'test fatal message',
                    'file' => '/tmp/test.php',
                    'line' => 42,
                ]],
                false,
            ],
            'times' => 1,
        ]);

        $errorCapture = new ErrorCapture(static fn () => [
            'type' => E_ERROR,
            'message' => 'test fatal message',
            'file' => '/tmp/test.php',
            'line' => 42,
        ]);
        $errorCapture->captureFatal();
        $this->assertConditionsMet();
    }

    public function test_does_nothing_when_the_last_error_was_not_fatal(): void
    {
        \WP_Mock::userFunction('update_option', ['times' => 0]);

        $errorCapture = new ErrorCapture(static fn () => [
            'type' => E_NOTICE,
            'message' => 'just a notice',
            'file' => '',
            'line' => 0,
        ]);
        $errorCapture->captureFatal();
        $this->assertConditionsMet();
    }

    public function test_does_nothing_when_there_was_no_error_at_all(): void
    {
        \WP_Mock::userFunction('update_option', ['times' => 0]);

        $errorCapture = new ErrorCapture(static fn () => null);
        $errorCapture->captureFatal();
        $this->assertConditionsMet();
    }
}
