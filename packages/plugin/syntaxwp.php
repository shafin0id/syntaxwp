<?php

/**
 * Plugin Name: SyntaxWP
 * Description: Autonomous site health monitoring, signed remote fix execution, and safety controls.
 * Version: 0.1.0
 * Requires PHP: 7.4
 *
 * @package SyntaxWP\Plugin
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit; // Direct access disallowed.
}

define('SYNTAXWP_PLUGIN_VERSION', '0.1.0');
define('SYNTAXWP_PLUGIN_DIR', __DIR__);

require_once __DIR__ . '/vendor/autoload.php';

// Individual core/safety modules register their own WordPress hooks (init,
// shutdown, wp_ajax_*, ...) when instantiated — this file's only job is
// wiring construction, one module at a time as A6/A7 land, not routing
// requests itself.
