<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Safety;

/**
 * Remote disable from the SyntaxWP backend (§4.2) — the *remote*-triggered
 * counterpart to SafeMode's local, self-detected anomaly response.
 *
 * This class is deliberately just the local primitive: an option-backed
 * flag and the two calls to flip it. The actual "how does the backend
 * remotely set this on a site it can't be pushed to" mechanism — most
 * likely riding along in the heartbeat response, the one channel the
 * plugin already polls every 60s — needs its own DB column and API
 * response field that don't exist yet, and is out of scope for Task A6
 * (this plugin's job here is having a kill switch to flip, not building
 * the backend delivery path for it). WorkOrderPoller checks isActive()
 * before claiming, same as it checks SafeMode.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class KillSwitch
{
    private const ACTIVE_OPTION = 'syntaxwp_kill_switch_active';

    public static function isActive(): bool
    {
        return (bool) get_option(self::ACTIVE_OPTION, false);
    }

    public static function activate(): void
    {
        update_option(self::ACTIVE_OPTION, true, false);
    }

    public static function deactivate(): void
    {
        update_option(self::ACTIVE_OPTION, false, false);
    }
}
