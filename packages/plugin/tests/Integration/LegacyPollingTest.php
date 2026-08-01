<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Integration;

use PDO;
use PHPUnit\Framework\TestCase;
use SyntaxWP\Plugin\Core\CapabilityRouter;
use SyntaxWP\Plugin\Core\Hmac;
use SyntaxWP\Plugin\Core\WorkOrderPoller;

/**
 * A7.2's integration test: claim -> validate -> dry-run execute
 * (flush_cache) -> report-result, against a *real* running `pnpm dev` API
 * instance and a *real* local Postgres — not WP_Mock, not a fixture
 * server. Self-skips (not fails) if either isn't reachable, so it's
 * runnable locally without being a hard CI dependency yet.
 *
 * Provisions its own org/site/work_order rows directly via PDO rather than
 * depending on a manually-seeded fixture or a dashboard session token
 * (neither of which this PHPUnit process has easy access to) — it reads
 * the exact same DATABASE_URL / SITE_SECRET_ENCRYPTION_KEY the running API
 * instance uses (falling back to apps/api/.env, since a separately
 * invoked PHP CLI process doesn't inherit a Node process's dotenv-loaded
 * vars — see tests/integration-bootstrap.php's syntaxwp_test_env()), so
 * this closes the loop deterministically instead of requiring a human to
 * seed something first.
 */
final class LegacyPollingTest extends TestCase
{
    private const API_BASE_URL = 'http://localhost:4000';
    private const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

    private ?PDO $pdo = null;

    protected function setUp(): void
    {
        if (!$this->apiIsReachable()) {
            $this->markTestSkipped(
                self::API_BASE_URL . '/healthz is unreachable — run `pnpm dev` first to exercise this test.'
            );
        }

        try {
            $this->pdo = $this->connectToTestDatabase();
        } catch (\Throwable $e) {
            $this->markTestSkipped('Could not connect to the local Postgres database: ' . $e->getMessage());
        }
    }

    public function test_claim_validate_execute_and_report_round_trip_for_a_flush_cache_order(): void
    {
        $secret = bin2hex(random_bytes(32));
        $siteId = $this->insertTestSite($secret);
        $workOrderId = $this->insertPendingFlushCacheWorkOrder($siteId, $secret);

        update_option('syntaxwp_site_id', $siteId);
        update_option('syntaxwp_site_secret', $secret);
        update_option('syntaxwp_api_base_url', self::API_BASE_URL);

        // Forces the legacy outbound-polling path regardless of what this
        // machine's real WP version detection would say — there's no real
        // WordPress install here at all, and this test's whole point is
        // the legacy path specifically.
        $poller = new WorkOrderPoller(new CapabilityRouter('6.8.0', false));
        $result = $poller->poll();

        $this->assertNotNull($result, 'expected poll() to claim and execute the pending work order');
        $this->assertSame(['success' => true, 'action' => 'flush_cache'], $result);

        $row = $this->fetchWorkOrder($workOrderId);
        $this->assertSame('executed', $row['status']);
        $this->assertNotNull($row['executed_at']);

        $dmsJob = $this->fetchScheduledDeadMansSwitchJob($workOrderId);
        $this->assertNotNull($dmsJob, 'expected the execution report to have armed the dead man\'s switch');
    }

    private function apiIsReachable(): bool
    {
        $ch = curl_init(self::API_BASE_URL . '/healthz');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $body !== false && $code === 200;
    }

    private function connectToTestDatabase(): PDO
    {
        $url = syntaxwp_test_env('DATABASE_URL', 'postgresql://postgres:postgres@localhost:54322/postgres');
        $parts = parse_url((string) $url);
        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s',
            $parts['host'] ?? 'localhost',
            $parts['port'] ?? 5432,
            ltrim($parts['path'] ?? '/postgres', '/')
        );

        return new PDO($dsn, $parts['user'] ?? null, $parts['pass'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    }

    private function insertTestSite(string $secret): string
    {
        $orgStmt = $this->pdo->prepare('INSERT INTO orgs (name) VALUES (:name) RETURNING id');
        $orgStmt->execute(['name' => 'legacy-polling-integration-test-org']);
        $orgId = $orgStmt->fetchColumn();

        $siteStmt = $this->pdo->prepare(
            'INSERT INTO sites (org_id, url, execution_path, site_secret_ciphertext)
             VALUES (:org_id, :url, :execution_path, :ciphertext) RETURNING id'
        );
        $siteStmt->execute([
            'org_id' => $orgId,
            'url' => 'http://legacy-polling-integration-test.example',
            'execution_path' => 'legacy_outbound',
            'ciphertext' => $this->encryptSiteSecret($secret),
        ]);

        return (string) $siteStmt->fetchColumn();
    }

    private function insertPendingFlushCacheWorkOrder(string $siteId, string $secret): string
    {
        $id = wp_generate_uuid4();
        $issuedAt = time();
        $expiresAt = $issuedAt + 300;

        $unsigned = [
            'id' => $id,
            'site_id' => $siteId,
            'action' => 'flush_cache',
            'target' => '',
            'parameters' => new \stdClass(),
            'issued_at' => $issuedAt,
            'expires_at' => $expiresAt,
            'dead_mans_switch_ms' => 30000,
        ];
        $hmac = Hmac::sign($unsigned, $secret);

        $stmt = $this->pdo->prepare(
            "INSERT INTO work_orders
                (id, site_id, action, target, parameters, status, risk, hmac, dead_mans_switch_ms, issued_at, expires_at)
             VALUES
                (:id, :site_id, 'flush_cache', '', '{}'::jsonb, 'pending', 'low', :hmac, 30000, to_timestamp(:issued_at), to_timestamp(:expires_at))"
        );
        $stmt->execute([
            'id' => $id,
            'site_id' => $siteId,
            'hmac' => $hmac,
            'issued_at' => $issuedAt,
            'expires_at' => $expiresAt,
        ]);

        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchWorkOrder(string $workOrderId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM work_orders WHERE id = :id');
        $stmt->execute(['id' => $workOrderId]);

        return (array) $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchScheduledDeadMansSwitchJob(string $workOrderId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM graphile_worker.jobs WHERE key = :key');
        $stmt->execute(['key' => "dms_{$workOrderId}"]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row === false ? null : $row;
    }

    // Mirrors packages/shared/src/site-secret.ts's exact envelope format
    // ("v1:" + base64(iv[12] + authTag[16] + ciphertext)) — the API must be
    // able to decrypt this the same way it decrypts a secret encrypted by
    // the real TS implementation, or the claim endpoint's signature check
    // fails for a reason that has nothing to do with this test's actual
    // subject.
    private function encryptSiteSecret(string $plaintext): string
    {
        $keyBase64 = syntaxwp_test_env('SITE_SECRET_ENCRYPTION_KEY');
        if ($keyBase64 === null) {
            $this->markTestSkipped(
                'SITE_SECRET_ENCRYPTION_KEY is not set (checked real env and apps/api/.env) — cannot encrypt a test site secret.'
            );
        }

        $key = base64_decode($keyBase64, true);
        if ($key === false || strlen($key) !== 32) {
            $this->markTestSkipped('SITE_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes.');
        }

        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($plaintext, self::ENCRYPTION_ALGORITHM, $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($ciphertext === false) {
            $this->fail('failed to encrypt the test site secret');
        }

        return 'v1:' . base64_encode($iv . $tag . $ciphertext);
    }
}
