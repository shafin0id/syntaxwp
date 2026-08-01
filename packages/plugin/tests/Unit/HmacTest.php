<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SyntaxWP\Plugin\Core\Hmac;

/**
 * Proves Hmac.php matches packages/shared/src/hmac.ts byte-for-byte against
 * the same golden fixture vectors the TS suite consumes
 * (work-order-signing.test.ts) — the single highest-risk cross-language
 * contract in this system (plan §"Canonicalization"). Reads the fixture
 * file directly rather than a copy, so there's exactly one file to keep in
 * sync, not two that can silently drift.
 */
final class HmacTest extends TestCase
{
    /**
     * @return array<string, array{0: object}>
     */
    public static function vectorsProvider(): array
    {
        $path = dirname(__DIR__, 3) . '/shared/test/fixtures/work-order-hmac-vectors.json';
        // Decoded WITHOUT forcing associative arrays — see Hmac::sortKeysDeep's
        // docblock for why this matters: it's what lets the empty
        // `"parameters": {}` vector round-trip as `{}` instead of `[]`.
        $vectors = json_decode((string) file_get_contents($path));

        $cases = [];
        foreach ($vectors as $vector) {
            $cases[$vector->description] = [$vector];
        }
        return $cases;
    }

    /**
     * @dataProvider vectorsProvider
     */
    public function test_canonicalization_and_signature_match_the_ts_implementation(object $vector): void
    {
        $this->assertSame(
            $vector->expectedCanonicalJson,
            Hmac::canonicalize($vector->payload),
            'canonical JSON must byte-for-byte match the TS implementation\'s output'
        );
        $this->assertSame($vector->expectedHmac, Hmac::sign($vector->payload, $vector->secret));
        $this->assertTrue(Hmac::verify($vector->payload, $vector->secret, $vector->expectedHmac));
    }

    public function test_verify_rejects_a_tampered_signature(): void
    {
        $payload = (object) ['a' => 1, 'b' => 2];
        $signature = Hmac::sign($payload, 'secret');
        $this->assertFalse(Hmac::verify($payload, 'secret', substr($signature, 0, -1) . '0'));
    }

    public function test_verify_rejects_the_wrong_secret(): void
    {
        $payload = (object) ['a' => 1, 'b' => 2];
        $signature = Hmac::sign($payload, 'correct-secret');
        $this->assertFalse(Hmac::verify($payload, 'wrong-secret', $signature));
    }
}
