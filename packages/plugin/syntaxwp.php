<?php
/**
 * Plugin Name: SyntaxWP
 * Plugin URI:  https://syntaxwp.com
 * Description: Autonomous site health monitoring, signed remote fix execution, and safety controls.
 * Author:      SyntaxWP
 * Author URI:  https://syntaxwp.com
 * Version:     0.1.0
 * Text Domain: syntaxwp
 * Domain Path: languages
 *
 * Requires at least: 7
 * Tested up to:      7.0
 * Requires PHP:      7.4
 *
 * @package SyntaxWP\Plugin
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Composer's PSR-4 autoloader covers every class under core/, safety/,
// wp7/, mu-watchdog/ (SyntaxWP\Plugin\...) — no separate spl_autoload_register
// needed on top of it.
require_once __DIR__ . '/vendor/autoload.php';

use SyntaxWP\Plugin\Core\CapabilityRouter;
use SyntaxWP\Plugin\Core\ErrorCapture;
use SyntaxWP\Plugin\Core\EventQueue;
use SyntaxWP\Plugin\Core\Heartbeat;
use SyntaxWP\Plugin\Core\WorkOrderPoller;
use SyntaxWP\Plugin\Wp7\AbilitiesRegistrar;
use SyntaxWP\Plugin\Wp7\MCPEndpoints;

/**
 * Main plugin class — bootstraps the plugin as a singleton, the same
 * shape every module registration in this file goes through. Individual
 * core/safety modules register their own WordPress hooks (init, shutdown,
 * wp_ajax_*, ...) when constructed — this class's job is wiring
 * construction, one module at a time as A6/A7 land, not routing requests
 * itself.
 *
 * @since  0.1.0
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
#[\AllowDynamicProperties]
class SyntaxWP {

    /**
     * Holds the class instance.
     *
     * @since 0.1.0
     *
     * @var SyntaxWP|null
     */
    public static $instance;

    /**
     * Returns the singleton instance, creating it on first call.
     *
     * @since 0.1.0
     *
     * @return SyntaxWP
     */
    public static function instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    /**
     * Registers this plugin's hook callbacks. Private — always go through
     * instance() so there's only ever one of these per request. Does no
     * work itself beyond registering hooks: constants and module wiring
     * both happen later, when `plugins_loaded` actually fires, not here.
     *
     * @since 0.1.0
     */
    private function __construct() {
        add_action( 'plugins_loaded', [ $this, 'define_constants' ], 1 );
        add_action( 'plugins_loaded', [ $this, 'init_hooks' ] );
    }

    /**
     * Defines plugin-wide constants. Hooked to `plugins_loaded` at
     * priority 1 (ahead of init_hooks(), which may eventually depend on
     * them) rather than defined at file-load time — every constant this
     * plugin exposes goes through the same hook-registration path as
     * everything else it does, not a bare top-level define() floating
     * outside the class.
     *
     * @since 0.1.0
     */
    public function define_constants() {
        define( 'SYNTAXWP_PLUGIN_FILE', __FILE__ );
        define( 'SYNTAXWP_PLUGIN_DIR', __DIR__ );
        define( 'SYNTAXWP_PLUGIN_VERSION', '0.1.0' );
    }

    /**
     * Constructs each module, one at a time as A6.1/A6.2/A6.3 land — not
     * all at once. Each module registers its own WordPress hooks in its
     * own constructor/registerHooks() call; this method's only job is
     * wiring the construction graph (e.g. Heartbeat needs a
     * CapabilityRouter), not routing requests itself.
     *
     * @since 0.1.0
     */
    public function init_hooks() {
        $capability_router = CapabilityRouter::forCurrentEnvironment();

        ( new Heartbeat( $capability_router ) )->registerHooks();
        ( new ErrorCapture() )->registerHooks();
        ( new EventQueue() )->registerHooks();
        ( new WorkOrderPoller( $capability_router ) )->registerHooks();

        // MCP/Abilities only make sense on the WP7-native path — a legacy
        // site never gets an MCP surface registered for nothing.
        if ( CapabilityRouter::WP7_NATIVE === $capability_router->detectExecutionPath() ) {
            ( new AbilitiesRegistrar() )->registerHooks();
            ( new MCPEndpoints() )->registerHooks();
        }
    }
}

SyntaxWP::instance();

register_activation_hook( __FILE__, 'syntaxwp_activate' );
register_deactivation_hook( __FILE__, 'syntaxwp_deactivate' );

function syntaxwp_activate() {
    $mu_dir = defined('WPMU_PLUGIN_DIR') ? WPMU_PLUGIN_DIR : WP_CONTENT_DIR . '/mu-plugins';
    if ( ! is_dir( $mu_dir ) ) {
        wp_mkdir_p( $mu_dir );
    }
    $watchdog_src = __DIR__ . '/mu-watchdog/SyntaxWPWatchdog.php';
    $watchdog_dst = $mu_dir . '/SyntaxWPWatchdog.php';
    if ( file_exists( $watchdog_src ) ) {
        copy( $watchdog_src, $watchdog_dst );
    }
}

function syntaxwp_deactivate() {
    $mu_dir = defined('WPMU_PLUGIN_DIR') ? WPMU_PLUGIN_DIR : WP_CONTENT_DIR . '/mu-plugins';
    $watchdog_dst = $mu_dir . '/SyntaxWPWatchdog.php';
    if ( file_exists( $watchdog_dst ) ) {
        unlink( $watchdog_dst );
    }
}

add_action('admin_menu', 'syntaxwp_admin_menu');
add_action('admin_post_syntaxwp_save_settings', 'syntaxwp_save_settings');

function syntaxwp_admin_menu() {
    add_menu_page(
        'SyntaxWP Settings',
        'SyntaxWP',
        'manage_options',
        'syntaxwp',
        'syntaxwp_admin_page',
        'dashicons-shield-alt',
        80
    );
}

function syntaxwp_save_settings() {
    if ( ! current_user_can('manage_options') ) {
        wp_die('Unauthorized');
    }
    check_admin_referer('syntaxwp_settings_nonce');

    $api_base = trim(sanitize_text_field($_POST['syntaxwp_api_base_url'] ?? ''));
    $site_id  = trim(sanitize_text_field($_POST['syntaxwp_site_id'] ?? ''));
    $secret   = trim(sanitize_text_field($_POST['syntaxwp_site_secret'] ?? ''));

    if ($api_base) update_option('syntaxwp_api_base_url', rtrim($api_base, '/'));
    if ($site_id)  update_option('syntaxwp_site_id', $site_id);
    // Only update secret if provided (non-empty) to avoid overwriting with blank
    if ($secret)   update_option('syntaxwp_site_secret', $secret);

    wp_redirect(admin_url('admin.php?page=syntaxwp&saved=1'));
    exit;
}

function syntaxwp_admin_page() {
    if ( ! current_user_can('manage_options') ) {
        wp_die('Unauthorized');
    }

    $site_id  = get_option('syntaxwp_site_id', '');
    $secret   = get_option('syntaxwp_site_secret', '');
    $api_base = get_option('syntaxwp_api_base_url', 'https://api.syntaxwp.com');
    $connected = !empty($site_id) && !empty($secret);
    $saved     = isset($_GET['saved']);

    echo '<div class="wrap">';
    echo '<h1>SyntaxWP</h1>';

    if ($saved) {
        echo '<div class="notice notice-success is-dismissible"><p>Settings saved.</p></div>';
    }

    // Connection status banner
    if ($connected) {
        echo '<div class="notice notice-success inline" style="margin-left:0;max-width:600px;padding:15px;border-left-color:#46b450;background:#fff;">';
        echo '<h3 style="margin-top:0;color:#46b450;">&#9679; Connected to Dashboard</h3>';
        echo '<p><strong>Site ID:</strong> <code>' . esc_html($site_id) . '</code></p>';
        echo '<p><strong>API Endpoint:</strong> <code>' . esc_html($api_base) . '</code></p>';
        echo '</div>';
    } else {
        echo '<div class="notice notice-warning inline" style="margin-left:0;max-width:600px;padding:15px;border-left-color:#ffb900;background:#fff;">';
        echo '<h3 style="margin-top:0;color:#ffb900;">&#9679; Not Connected</h3>';
        echo '<p>Fill in the settings below to connect this site to your SyntaxWP dashboard.</p>';
        echo '</div>';
    }

    echo '<br/>';

    // Settings form
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="max-width:600px;">';
    echo '<input type="hidden" name="action" value="syntaxwp_save_settings">';
    wp_nonce_field('syntaxwp_settings_nonce');

    echo '<table class="form-table" role="presentation">';
    echo '<tr><th scope="row"><label for="syntaxwp_api_base_url">API Base URL</label></th>';
    echo '<td><input type="url" id="syntaxwp_api_base_url" name="syntaxwp_api_base_url" value="' . esc_attr($api_base) . '" class="regular-text" placeholder="http://localhost:4000"></td></tr>';

    echo '<tr><th scope="row"><label for="syntaxwp_site_id">Site ID</label></th>';
    echo '<td><input type="text" id="syntaxwp_site_id" name="syntaxwp_site_id" value="' . esc_attr($site_id) . '" class="regular-text" placeholder="UUID from dashboard"></td></tr>';

    echo '<tr><th scope="row"><label for="syntaxwp_site_secret">Site Secret</label></th>';
    echo '<td><input type="password" id="syntaxwp_site_secret" name="syntaxwp_site_secret" value="" class="regular-text" placeholder="Leave blank to keep existing secret">';
    if ($secret) echo '<p class="description">&#10003; Secret is set. Enter a new value only to change it.</p>';
    echo '</td></tr>';
    echo '</table>';

    submit_button('Save Settings');
    echo '</form>';
    echo '</div>';
}
