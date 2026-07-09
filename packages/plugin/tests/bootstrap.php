<?php

declare(strict_types=1);

// WP_Mock over wp-env/a live WordPress install (locked decision, see
// atomic-noodling-quail.md's plan) — mocks the WP core functions this
// plugin calls (get_option, wp_remote_post, add_action, ...) without
// booting an actual WordPress instance, matching the plan's "no live
// WordPress site required" constraint for this test suite.

require_once dirname(__DIR__) . '/vendor/autoload.php';

WP_Mock::bootstrap();
