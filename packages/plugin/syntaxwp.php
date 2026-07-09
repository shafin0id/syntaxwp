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
 * Requires PHP:      8.1
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
use SyntaxWP\Plugin\Core\EventQueue;
use SyntaxWP\Plugin\Core\Heartbeat;

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
        ( new EventQueue() )->registerHooks();
    }
}

SyntaxWP::instance();
