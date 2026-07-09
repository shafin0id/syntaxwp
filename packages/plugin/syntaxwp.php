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
 * Requires at least: 5.0
 * Requires PHP:      7.0
 *
 * @package SyntaxWP\Plugin
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Store base file/dir locations before anything else needs them.
define( 'SYNTAXWP_PLUGIN_FILE', __FILE__ );
define( 'SYNTAXWP_PLUGIN_DIR', __DIR__ );
define( 'SYNTAXWP_PLUGIN_VERSION', '0.1.0' );

// Composer's PSR-4 autoloader covers every class under core/, safety/,
// wp7/, mu-watchdog/ (SyntaxWP\Plugin\...) — no separate spl_autoload_register
// needed on top of it.
require_once __DIR__ . '/vendor/autoload.php';

/**
 * Main plugin class — bootstraps the plugin as a singleton, the same
 * shape every module registration in this file goes through. Individual
 * core/safety modules register their own WordPress hooks (init, shutdown,
 * wp_ajax_*, ...) when constructed — this class's job is wiring
 * construction, one module at a time as A6/A7 land, not routing requests
 * itself.
 *
 * @since 0.1.0
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
     * Constructs the plugin, wiring up its modules. Private — always go
     * through instance() so there's only ever one of these per request.
     *
     * @since 0.1.0
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Constructs each module. Empty for now — modules are added here one
     * at a time as A6.1/A6.2/A6.3 land, not all at once.
     *
     * @since 0.1.0
     */
    private function init_hooks() {
    }
}

SyntaxWP::instance();
