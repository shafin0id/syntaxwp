<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Wp7;

/**
 * Registers SyntaxWP's supported actions with WP 7's Abilities API (§4.1,
 * §4.2), so the control plane can invoke them directly via MCP instead of
 * this plugin having to be polled (core/WorkOrderPoller.php's job on the
 * legacy path).
 *
 * NOTE: the hook name (`wp_abilities_api_init`) and wp_register_ability()'s
 * exact argument shape below are built from the architecture doc's
 * description ("register via Abilities API"), not a confirmed reference
 * against WP7's real, still-evolving Abilities API — verify both against
 * the actual core API before this ships to a real WP7 site. The structure
 * around them (dependency injection, one ability per action, delegating
 * to the shared ActionExecutor) is the part this class is actually
 * confident about.
 *
 * Only registers abilities for the 4 actions ActionExecutor currently
 * implements — no ability for anything ActionExecutor would answer
 * `not_implemented` to; there's nothing useful to expose for those yet.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class AbilitiesRegistrar
{
    private const ABILITY_PREFIX = 'syntaxwp/';

    /**
     * action => [ability slug, label, description]
     *
     * @var array<string, array{0: string, 1: string, 2: string}>
     */
    private const ABILITIES = [
        'flush_cache' => ['flush-cache', 'Flush Cache', 'Flushes the WordPress object cache.'],
        'clear_transients' => ['clear-transients', 'Clear Transients', 'Deletes all transient options.'],
        'activate_plugin' => ['activate-plugin', 'Activate Plugin', 'Activates an installed plugin by slug.'],
        'deactivate_plugin' => ['deactivate-plugin', 'Deactivate Plugin', 'Deactivates an active plugin by slug.'],
    ];

    private ActionExecutor $executor;

    public function __construct(?ActionExecutor $executor = null)
    {
        $this->executor = $executor ?? new ActionExecutor();
    }

    public function registerHooks(): void
    {
        add_action('wp_abilities_api_init', [$this, 'registerAbilities']);
    }

    public function registerAbilities(): void
    {
        // Guards against a WP7 install where the Abilities API feature
        // itself isn't actually loaded — CapabilityRouter already
        // wouldn't have routed here in that case, but this is the actual
        // enforcement point if it's ever reached anyway (e.g. the feature
        // was available at boot and disabled afterward).
        if (!function_exists('wp_register_ability')) {
            return;
        }

        foreach (self::ABILITIES as $action => [$slug, $label, $description]) {
            $this->registerAbility($action, $slug, $label, $description);
        }
    }

    private function registerAbility(string $action, string $slug, string $label, string $description): void
    {
        wp_register_ability(self::ABILITY_PREFIX . $slug, [
            'label' => $label,
            'description' => $description,
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'target' => ['type' => 'string'],
                ],
            ],
            'output_schema' => [
                'type' => 'object',
            ],
            'execute_callback' => function (array $input) use ($action) {
                $target = isset($input['target']) ? (string) $input['target'] : '';

                return $this->executor->execute($action, $target);
            },
            // Access control already happened before this is ever reached:
            // MCPEndpoints.php's loopback check gates who can call into the
            // MCP transport at all, and there's no WP user session in this
            // automated control-plane flow for a capability check to mean
            // anything against. Always-true here reflects that
            // deliberately, not an oversight.
            'permission_callback' => static function () {
                return true;
            },
        ]);
    }
}
