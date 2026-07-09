<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

/**
 * Native fatal handler → reported as an audit_log event (§4.2).
 *
 * `set_error_handler()`/`set_exception_handler()` don't catch fatals
 * (E_ERROR, E_PARSE, out-of-memory, ...) — the only reliable way to
 * observe one is `register_shutdown_function()` + `error_get_last()`,
 * which is exactly what WordPress's own `shutdown` action is built on
 * (`shutdown_action_hook()` in wp-includes/load.php registers it via
 * `register_shutdown_function()` very early in WP's bootstrap), so a
 * fatal during the request still lets `shutdown` fire normally here.
 *
 * Reports via EventQueue::push() rather than its own separate HTTP call —
 * one outbound-reporting mechanism (with its own retry/persistence
 * already solved), not two.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class ErrorCapture
{
    // Registered ahead of EventQueue::flush()'s default priority (10) so a
    // fatal captured on this request is queued in time to go out with
    // *this* request's flush, not stranded until the next one.
    private const HOOK_PRIORITY = 5;

    private const FATAL_ERROR_TYPES = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];

    /**
     * @var callable(): (array{type: int, message: string, file: string, line: int}|null)
     */
    private $lastErrorSupplier;

    // Defaults to the real error_get_last() — WP_Mock can't mock internal
    // PHP functions directly (it explicitly refuses to), so tests inject a
    // fake supplier here instead, the same "take the thing under test as a
    // constructor argument" pattern CapabilityRouter uses for testability.
    public function __construct(?callable $lastErrorSupplier = null)
    {
        $this->lastErrorSupplier = $lastErrorSupplier ?? '\error_get_last';
    }

    public function registerHooks(): void
    {
        add_action('shutdown', [$this, 'captureFatal'], self::HOOK_PRIORITY);
    }

    public function captureFatal(): void
    {
        $error = ($this->lastErrorSupplier)();
        if ($error === null || !in_array($error['type'], self::FATAL_ERROR_TYPES, true)) {
            return;
        }

        EventQueue::push([
            'type' => 'fatal_error',
            'summary' => $error['message'],
            'file' => $error['file'],
            'line' => $error['line'],
        ]);
    }
}
