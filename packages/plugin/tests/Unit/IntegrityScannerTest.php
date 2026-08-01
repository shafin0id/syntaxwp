<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use SyntaxWP\Plugin\Safety\IntegrityScanner;
use WP_Mock\Tools\TestCase;

final class IntegrityScannerTest extends TestCase
{
    private string $siteDir;

    public function setUp(): void
    {
        parent::setUp();
        $this->siteDir = sys_get_temp_dir() . '/syntaxwp-integrity-test-' . uniqid('', true) . '/';
        mkdir($this->siteDir, 0777, true);
    }

    public function tearDown(): void
    {
        foreach (glob($this->siteDir . '*') ?: [] as $file) {
            unlink($file);
        }
        rmdir($this->siteDir);
        parent::tearDown();
    }

    public function test_flags_and_repairs_a_modified_file(): void
    {
        file_put_contents($this->siteDir . 'wp-login.php', 'tampered content');
        $officialHash = md5('official content');

        \WP_Mock::userFunction('wp_remote_get', [
            'times' => 2, // checksums fetch, then the repair fetch
        ])->andReturnUsing(function ($url) use ($officialHash) {
            if (str_contains($url, 'api.wordpress.org')) {
                return ['body' => json_encode(['checksums' => ['wp-login.php' => $officialHash]])];
            }
            return ['body' => 'official content'];
        });
        \WP_Mock::userFunction('is_wp_error', ['return' => false]);
        \WP_Mock::userFunction('wp_remote_retrieve_response_code', ['return' => 200]);
        \WP_Mock::userFunction('wp_remote_retrieve_body', [
            'return' => function ($response) {
                return $response['body'];
            },
        ]);

        $result = IntegrityScanner::verifyCoreFiles($this->siteDir);

        $this->assertTrue($result['success']);
        $this->assertSame(['wp-login.php'], $result['modified']);
        $this->assertSame([], $result['missing']);
        $this->assertSame(['wp-login.php'], $result['repaired']);
        $this->assertSame([], $result['repair_failed']);
        $this->assertSame('official content', file_get_contents($this->siteDir . 'wp-login.php'));
    }

    public function test_leaves_matching_files_alone(): void
    {
        file_put_contents($this->siteDir . 'wp-login.php', 'clean content');
        $matchingHash = md5('clean content');

        \WP_Mock::userFunction('wp_remote_get', ['times' => 1])->andReturn([
            'body' => json_encode(['checksums' => ['wp-login.php' => $matchingHash]]),
        ]);
        \WP_Mock::userFunction('is_wp_error', ['return' => false]);
        \WP_Mock::userFunction('wp_remote_retrieve_response_code', ['return' => 200]);
        \WP_Mock::userFunction('wp_remote_retrieve_body', [
            'return' => function ($response) {
                return $response['body'];
            },
        ]);

        $result = IntegrityScanner::verifyCoreFiles($this->siteDir);

        $this->assertTrue($result['success']);
        $this->assertSame([], $result['modified']);
        $this->assertSame([], $result['missing']);
    }

    public function test_reports_failure_when_the_checksum_api_is_unreachable(): void
    {
        \WP_Mock::userFunction('wp_remote_get', ['times' => 1])->andReturn(['body' => '']);
        \WP_Mock::userFunction('is_wp_error', ['return' => true]);

        $result = IntegrityScanner::verifyCoreFiles($this->siteDir);

        $this->assertFalse($result['success']);
        $this->assertSame('checksum_fetch_failed', $result['reason']);
    }
}
