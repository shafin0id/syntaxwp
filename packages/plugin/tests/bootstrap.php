<?php

declare(strict_types=1);

// WP_Mock over wp-env/a live WordPress install (locked decision, see
// atomic-noodling-quail.md's plan) — mocks the WP core functions this
// plugin calls (get_option, wp_remote_post, add_action, ...) without
// booting an actual WordPress instance, matching the plan's "no live
// WordPress site required" constraint for this test suite.

require_once dirname(__DIR__) . '/vendor/autoload.php';

WP_Mock::bootstrap();

// Real wp-config.php constants WP_Mock doesn't define on its own — needed
// by anything (Heartbeat's DB-size query) that reads them directly rather
// than through a mockable function call.
if (!defined('DB_NAME')) {
    define('DB_NAME', 'wordpress_test');
}

// Tells mu-watchdog/SyntaxWPWatchdog.php not to auto-register itself when
// this test suite requires that file directly (it's not PSR-4 autoloaded
// — see that file's own docblock for why) — tests instantiate
// SyntaxWP_Watchdog themselves instead of relying on the file's own
// bottom-of-file side effect.
define('SYNTAXWP_PLUGIN_TESTING', true);

// WP_Mock doesn't stub WP_Error itself — same minimal shape as
// tests/integration-bootstrap.php's own stub, for code (SettingsController)
// that returns a real WP_Error to signal a REST 4xx status.
if (!class_exists('WP_Error')) {
    final class WP_Error
    {
        public string $code;
        public string $message;

        public function __construct(string $code = '', string $message = '')
        {
            $this->code = $code;
            $this->message = $message;
        }
    }
}
