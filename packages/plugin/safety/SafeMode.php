<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Safety;

/**
 * Local safe mode — the plugin disabling its own risky behavior after
 * repeated anomalies, without waiting on a round-trip to the backend
 * (that's KillSwitch's job, the *remote*-triggered counterpart).
 *
 * Consecutive-failure counter rather than a time window: a burst of
 * failures close together is exactly the "something is actually wrong"
 * signal this exists to catch; a slow trickle of occasional failures over
 * days is normal operating noise, not an anomaly, and recordSuccess()
 * resets the counter so an isolated failure doesn't linger toward the
 * threshold indefinitely.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class SafeMode
{
    private const ACTIVE_OPTION = 'syntaxwp_safe_mode_active';
    private const FAILURE_COUNT_OPTION = 'syntaxwp_safe_mode_failure_count';
    private const FAILURE_THRESHOLD = 3;

    public static function isActive(): bool
    {
        return (bool) get_option(self::ACTIVE_OPTION, false);
    }

    public static function recordFailure(): void
    {
        $count = (int) get_option(self::FAILURE_COUNT_OPTION, 0) + 1;

        if ($count >= self::FAILURE_THRESHOLD) {
            update_option(self::ACTIVE_OPTION, true, false);
            update_option(self::FAILURE_COUNT_OPTION, 0, false);

            return;
        }

        update_option(self::FAILURE_COUNT_OPTION, $count, false);
    }

    public static function recordSuccess(): void
    {
        update_option(self::FAILURE_COUNT_OPTION, 0, false);
    }

    // Manual escape hatch — a site admin (or a future dashboard action)
    // clearing safe mode once whatever caused it has actually been fixed.
    public static function reset(): void
    {
        update_option(self::ACTIVE_OPTION, false, false);
        update_option(self::FAILURE_COUNT_OPTION, 0, false);
    }
}
