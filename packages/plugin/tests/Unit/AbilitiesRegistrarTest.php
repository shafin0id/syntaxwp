<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Wp7\AbilitiesRegistrar;
use SyntaxWP\Plugin\Wp7\ActionExecutor;
use WP_Mock\Tools\TestCase;

final class AbilitiesRegistrarTest extends TestCase
{
    // Declared first deliberately: WP_Mock only defines a function once
    // something calls WP_Mock::userFunction() for it, so
    // function_exists('wp_register_ability') genuinely reflects
    // "unavailable" here, matching a pre-Abilities-API install — but only
    // as long as no earlier test in this process has already mocked it
    // (PHP can't un-define a function once declared). PHPUnit runs a
    // class's tests in declaration order by default, so putting this one
    // first is what makes it meaningful rather than a guaranteed skip.
    public function test_does_nothing_when_the_abilities_api_is_unavailable(): void
    {
        if (function_exists('wp_register_ability')) {
            $this->markTestSkipped('wp_register_ability was already defined by an earlier test in this process.');
        }

        (new AbilitiesRegistrar())->registerAbilities();
        $this->addToAssertionCount(1); // reaching here without a fatal is the assertion
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function captureRegisteredAbilities(?ActionExecutor $executor = null): array
    {
        $registered = [];
        \WP_Mock::userFunction('wp_register_ability', ['times' => 4])->andReturnUsing(
            function (string $name, array $args) use (&$registered) {
                $registered[$name] = $args;

                return true;
            }
        );

        (new AbilitiesRegistrar($executor))->registerAbilities();

        return $registered;
    }

    public function test_registers_one_ability_per_implemented_action(): void
    {
        $registered = $this->captureRegisteredAbilities();

        $this->assertSame(
            ['syntaxwp/flush-cache', 'syntaxwp/clear-transients', 'syntaxwp/activate-plugin', 'syntaxwp/deactivate-plugin'],
            array_keys($registered)
        );
    }

    public function test_every_registered_ability_has_a_permission_callback_that_returns_true(): void
    {
        $registered = $this->captureRegisteredAbilities();

        foreach ($registered as $name => $args) {
            $this->assertTrue(($args['permission_callback'])(), "permission_callback for {$name} should always allow");
        }
    }

    public function test_execute_callback_delegates_to_the_injected_action_executor(): void
    {
        $executor = new ActionExecutor();
        $registered = $this->captureRegisteredAbilities($executor);

        \WP_Mock::userFunction('get_plugins', [
            'return' => ['yoast-seo/wp-seo.php' => ['Version' => '23.2']],
        ]);
        \WP_Mock::userFunction('deactivate_plugins', [
            'args' => ['yoast-seo/wp-seo.php'],
            'times' => 1,
        ]);

        $result = ($registered['syntaxwp/deactivate-plugin']['execute_callback'])(['target' => 'yoast-seo']);

        $this->assertSame(
            ['success' => true, 'action' => 'deactivate_plugin', 'target' => 'yoast-seo'],
            $result
        );
    }
}
