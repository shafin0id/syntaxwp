<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Admin;

/**
 * Registers the wp-admin "SyntaxWP" menu page and enqueues the React
 * bundle that renders it. `is_admin()`-gated construction in syntaxwp.php
 * means this class only ever exists on admin requests — no reason to wire
 * an admin_menu/admin_enqueue_scripts hook on the front end.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class AdminMenu
{
    private const MENU_SLUG = 'syntaxwp';
    private const HOOK_SUFFIX = 'toplevel_page_' . self::MENU_SLUG;

    public function registerHooks(): void
    {
        add_action('admin_menu', [$this, 'registerMenuPage']);
        add_action('admin_enqueue_scripts', [$this, 'maybeEnqueueAssets']);
    }

    public function registerMenuPage(): void
    {
        add_menu_page(
            'SyntaxWP',
            'SyntaxWP',
            'manage_options',
            self::MENU_SLUG,
            [$this, 'renderPage'],
            $this->menuIcon()
        );
    }

    public function renderPage(): void
    {
        echo '<div id="syntaxwp-admin-root"></div>';
    }

    public function maybeEnqueueAssets(string $hookSuffix): void
    {
        if ($hookSuffix !== self::HOOK_SUFFIX) {
            return;
        }

        $assetFile = SYNTAXWP_PLUGIN_DIR . '/build/index.asset.php';
        if (!file_exists($assetFile)) {
            return; // `pnpm build` hasn't been run yet — nothing to enqueue
        }

        /** @var array{dependencies: array<int, string>, version: string} $asset */
        $asset = require $assetFile;

        wp_enqueue_script(
            'syntaxwp-admin',
            SYNTAXWP_PLUGIN_URL . '/build/index.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );
        wp_enqueue_style(
            // @wordpress/scripts names its extracted CSS "style-<entry>.css",
            // not "<entry>.css" — confirmed against this plugin's own build
            // output, not assumed.
            'syntaxwp-admin',
            SYNTAXWP_PLUGIN_URL . '/build/style-index.css',
            [],
            $asset['version']
        );

        wp_add_inline_script(
            'syntaxwp-admin',
            'window.syntaxwpAdmin = ' . wp_json_encode($this->bootstrapData()) . ';',
            'before'
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function bootstrapData(): array
    {
        $siteId = get_option('syntaxwp_site_id');

        return [
            'connected' => (bool) $siteId,
            'siteId' => $siteId ? (string) $siteId : '',
            'apiBaseUrl' => (string) get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com'),
            // No restUrl/restNonce here: WordPress core already wires the
            // 'wp-api-fetch' script's root-URL + nonce middleware
            // automatically on every admin page (see src/api.js).
            'marketingUrl' => SYNTAXWP_MARKETING_URL,
        ];
    }

    // A base64-inlined copy of apps/dashboard/public/icon.svg (brand mark:
    // rounded #0055ff square, white shield-check glyph) — small enough to
    // ship inline rather than as a separate enqueued asset for one menu icon.
    private function menuIcon(): string
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36" fill="none">'
            . '<rect width="36" height="36" rx="10" fill="#0055ff" />'
            . '<g transform="translate(6, 6) scale(1)" stroke="#ffffff" stroke-width="2.2" '
            . 'stroke-linecap="round" stroke-linejoin="round">'
            . '<path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 '
            . '.76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z" />'
            . '<path d="m9 12 2 2 4-4" />'
            . '</g></svg>';

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }
}
