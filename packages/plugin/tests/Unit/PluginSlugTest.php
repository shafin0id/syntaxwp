<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Core\PluginSlug;
use WP_Mock\Tools\TestCase;

final class PluginSlugTest extends TestCase
{
    public function test_from_file_derives_slug_from_the_containing_directory(): void
    {
        $this->assertSame('woocommerce', PluginSlug::fromFile('woocommerce/woocommerce.php'));
    }

    public function test_from_file_falls_back_to_the_filename_for_a_single_file_plugin(): void
    {
        $this->assertSame('hello', PluginSlug::fromFile('hello.php'));
    }

    public function test_to_file_finds_the_matching_installed_plugin(): void
    {
        \WP_Mock::userFunction('get_plugins', [
            'return' => [
                'woocommerce/woocommerce.php' => ['Version' => '9.1.0'],
                'hello.php' => ['Version' => '1.7'],
            ],
        ]);

        $this->assertSame('woocommerce/woocommerce.php', PluginSlug::toFile('woocommerce'));
        $this->assertSame('hello.php', PluginSlug::toFile('hello'));
    }

    public function test_to_file_returns_null_when_no_installed_plugin_matches(): void
    {
        \WP_Mock::userFunction('get_plugins', [
            'return' => ['woocommerce/woocommerce.php' => ['Version' => '9.1.0']],
        ]);

        $this->assertNull(PluginSlug::toFile('yoast-seo'));
    }
}
