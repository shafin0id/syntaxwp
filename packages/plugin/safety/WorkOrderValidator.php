<?php

declare(strict_types=1);

namespace SyntaxWP\Plugin\Safety;

use SyntaxWP\Plugin\Core\Hmac;

/**
 * Validates a claimed work order before execution (§15.1): HMAC match,
 * expiry, replay, whitelist — in that order, matching the architecture
 * doc's own illustrative `validate_work_order()` exactly.
 *
 * Takes the decoded order as an `object` (i.e. the caller must
 * `json_decode($json)` — without forcing associative arrays — not
 * `json_decode($json, true)`), not an array: only that decode mode
 * preserves the difference between an empty JSON object (`{}`, e.g. a
 * `parameters` field with no keys) and an empty JSON array (`[]`) through
 * to Hmac::canonicalize()'s re-encode — see Hmac::sortKeysDeep()'s
 * docblock. Passing a plain array here would make an empty `parameters`
 * silently fail HMAC verification for every such work order.
 *
 * Replay protection uses the order's own `id` as its nonce, not a
 * separate `nonce` field — the wire schema has no such field (see
 * packages/shared/src/work-order-signing.ts's own comment on this) — kept
 * in a WP transient (§15.1's own 600s TTL) rather than a custom option/DB
 * table, since transients are exactly WP's built-in mechanism for
 * short-lived, self-expiring key-value state like this.
 *
 * @author Tanmay Kirtania <jktanmay@gmail.com>
 */
final class WorkOrderValidator
{
    private const NONCE_TTL_SECONDS = 600;

    public function validate(object $order, string $secret): bool
    {
        if (!isset($order->hmac) || !is_string($order->hmac)) {
            return false;
        }

        $receivedHmac = $order->hmac;
        $payload = clone $order;
        unset($payload->hmac);

        if (!Hmac::verify($payload, $secret, $receivedHmac)) {
            return false;
        }

        if (!isset($payload->expires_at) || time() > (int) $payload->expires_at) {
            return false;
        }

        $nonce = isset($payload->id) ? (string) $payload->id : '';
        if ($nonce === '' || get_transient('syntaxwp_nonce_' . $nonce)) {
            return false;
        }
        set_transient('syntaxwp_nonce_' . $nonce, 1, self::NONCE_TTL_SECONDS);

        if (!isset($payload->action) || !ActionWhitelist::isAllowed((string) $payload->action)) {
            return false;
        }

        return true;
    }
}
