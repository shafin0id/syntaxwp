<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Safety;

/**
 * The 12 permitted action types (§8.2/§9.3) — mirrors
 * packages/shared/src/actions.ts's WORK_ORDER_ACTIONS, minus
 * `run_arbitrary_command`. That action exists in the TS enum purely for
 * risk classification (ACTION_RISK_MAP marks it "blocked", so the policy
 * engine never issues a work order for it) — it's deliberately absent
 * here too, as defense in depth: even if a work order for it somehow got
 * signed and reached this plugin, the plugin's own local whitelist
 * independently refuses to execute it, matching §8.2's validation rule 3
 * ("action in local whitelist").
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class ActionWhitelist
{
    private const ALLOWED_ACTIONS = [
        'deactivate_plugin',
        'activate_plugin',
        'update_plugin',
        'flush_cache',
        'clear_transients',
        'disable_maintenance_mode',
        'toggle_debug',
        'repair_db',
        'switch_theme',
        'update_core',
        'delete_plugin',
        'update_option',
    ];

    public static function isAllowed(string $action): bool
    {
        return in_array($action, self::ALLOWED_ACTIONS, true);
    }

    /**
     * @return array<int, string>
     */
    public static function allowedActions(): array
    {
        return self::ALLOWED_ACTIONS;
    }
}
