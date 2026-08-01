<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Core;

use stdClass;

/**
 * PHP mirror of packages/shared/src/hmac.ts's canonicalization/signing
 * primitives (§15.1) — the plugin can't import that module, so this is a
 * manually-ported, carefully-tested cross-language contract, not shared
 * code. Both implementations are validated against the same golden fixture
 * vectors (packages/shared/test/fixtures/work-order-hmac-vectors.json,
 * consumed here by tests/Unit/HmacTest.php and on the TS side by
 * work-order-signing.test.ts) so a drift between them fails a test
 * immediately instead of producing a silently-mismatched signature at
 * runtime.
 *
 * Used both directions: Heartbeat/EventQueue (core/) sign outbound
 * requests to the API, WorkOrderValidator (safety/, Task A6.2) verifies
 * inbound signed work orders — one canonicalization implementation for
 * both, same reasoning as hmac.ts serving A5a.1 and A3.1 on the TS side.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class Hmac
{
    public static function canonicalize($payload): string
    {
        return (string) json_encode(
            self::sortKeysDeep($payload),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
    }

    public static function sign($payload, string $secret): string
    {
        return hash_hmac('sha256', self::canonicalize($payload), $secret);
    }

    // Argument order matters for readability, not safety — hash_equals()
    // is constant-time regardless of which side is "expected" vs
    // "actual", but $expected-first-then-$actual is the conventional
    // reading order.
    public static function verify($payload, string $secret, string $signature): bool
    {
        return hash_equals(self::sign($payload, $secret), $signature);
    }

    /**
     * Recursively sorts keys lexicographically (byte order — PHP's
     * `ksort($arr, SORT_STRING)` equivalent) at every nesting level,
     * preserving list order as-is — matches hmac.ts's `sortKeysDeep`
     * exactly, including how it handles the two input shapes this
     * codebase actually produces:
     *
     * - `stdClass` (what `json_decode($json)` — without forcing
     *   associative arrays — produces for a JSON object): sorted and
     *   rebuilt as a `stdClass`, so an empty object round-trips to `{}`
     *   rather than collapsing to `[]`. WorkOrderValidator decodes
     *   inbound work orders this way specifically so `parameters: {}`
     *   survives the round-trip.
     * - plain PHP array (what code building an outbound payload, e.g.
     *   Heartbeat, constructs directly): a sequential-keyed array is
     *   treated as a JSON list (order preserved, not sorted); anything
     *   else (including a genuinely empty array) is treated as an
     *   associative object and key-sorted. An empty PHP array has no way
     *   to record whether it was conceptually a `{}` or `[]` — it
     *   defaults to `[]`, matching `json_encode`'s own default. None of
     *   this plugin's outbound payloads have an empty-object field, so
     *   that default never actually applies here in practice.
     *
     * @param mixed $value
     * @return mixed
     */
    private static function sortKeysDeep($value)
    {
        if ($value instanceof stdClass) {
            $props = get_object_vars($value);
            ksort($props, SORT_STRING);
            $sorted = new stdClass();
            foreach ($props as $key => $val) {
                $sorted->$key = self::sortKeysDeep($val);
            }
            return $sorted;
        }

        if (is_array($value)) {
            if (self::isList($value)) {
                return array_map([self::class, 'sortKeysDeep'], $value);
            }
            ksort($value, SORT_STRING);
            $sorted = [];
            foreach ($value as $key => $val) {
                $sorted[$key] = self::sortKeysDeep($val);
            }
            return $sorted;
        }

        return $value;
    }

    private static function isList(array $value): bool
    {
        $expected = 0;
        foreach ($value as $key => $_) {
            if ($key !== $expected) {
                return false;
            }
            $expected++;
        }
        return true;
    }
}
