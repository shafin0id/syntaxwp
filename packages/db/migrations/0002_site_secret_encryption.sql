-- Site secrets are HMAC keys, not passwords, so they must stay reversible --
-- encrypted at rest (AES-256-GCM, see packages/shared/src/site-secret.ts),
-- not hashed. Column renamed rather than added-alongside since only
-- disposable local dev/seed data exists today (no production rows to
-- migrate in place); reset via `supabase db reset` + reseed after applying.
--> statement-breakpoint
ALTER TABLE "sites" RENAME COLUMN "site_secret" TO "site_secret_ciphertext";
