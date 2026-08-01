<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

/**
 * Detects which execution path (§4.1) this request should use: WP7's
 * native Abilities/MCP path, or the legacy outbound-polling fallback.
 *
 * The plugin's own "Requires at least: 7" header means WordPress itself
 * refuses to activate this plugin on a pre-7.0 install — so unlike the
 * architecture doc's "pre-7.0 OR WP7 MCP unavailable" framing, the version
 * check here is just a defensive belt-and-suspenders check (in case this
 * class is ever exercised outside WP's own activation gate, e.g. a unit
 * test, or a future multisite/must-use edge case). The condition that
 * actually matters day to day is MCP availability: an install can be WP7+
 * and still have the Abilities API disabled or unavailable (a conflicting
 * mu-plugin, a host that strips it, WP7 loaded without the feature), which
 * is exactly why this class exists instead of a bare version_compare call
 * at the plugin's call sites.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class CapabilityRouter
{
    public const WP7_NATIVE = 'wp7_native';
    public const LEGACY_OUTBOUND = 'legacy_outbound';

    private string $wpVersion;
    private bool $mcpAvailable;

    // Takes both signals as constructor arguments rather than reading WP
    // globals/functions directly, so detectExecutionPath() is testable
    // with plain values instead of needing WP_Mock stubs for every case —
    // forCurrentEnvironment() below is the only place that touches real
    // WordPress state.
    public function __construct(string $wpVersion, bool $mcpAvailable)
    {
        $this->wpVersion = $wpVersion;
        $this->mcpAvailable = $mcpAvailable;
    }

    public static function forCurrentEnvironment(): self
    {
        return new self(
            get_bloginfo('version'),
            // wp_register_ability is WP7's Abilities API entry point —
            // A7.1 registers SyntaxWP's own abilities through it. Its mere
            // existence is what "MCP available" means here; A7's
            // MCPEndpoints.php is what actually exposes it over MCP.
            function_exists('wp_register_ability')
        );
    }

    public function detectExecutionPath(): string
    {
        if ($this->isWp7OrNewer() && $this->mcpAvailable) {
            return self::WP7_NATIVE;
        }

        return self::LEGACY_OUTBOUND;
    }

    private function isWp7OrNewer(): bool
    {
        return version_compare($this->wpVersion, '7.0', '>=');
    }
}
