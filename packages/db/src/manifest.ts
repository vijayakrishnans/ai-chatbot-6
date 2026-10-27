import type { MigrationManifest } from "./types.js";

// Every migration the runner applies, in order, with the sha256 of its file.
// `pnpm --filter @saas/db run manifest:check` verifies the checksums;
// `manifest:fix` rewrites them after a migration file changes (only ever
// before that migration has been applied anywhere — an applied migration's
// checksum is immutable).
export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "2a5d7f30684c99e3ff441ca8a2c38038dedd1bab4db4a40e92cd36bb22be297f",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
    {
      id: "010_initial",
      context: "app",
      path: "010_initial/up.sql",
      checksum:
        "e4fae1018fc8f510c293e7d1ea0bc9006f7d4f95f6715a7f015c121bd0051825",
      description:
        "The chatbot's schema, verbatim from upstream lib/db/migrations/0000_initial.sql: User, Chat, Message_v2, Vote_v2, Document, Suggestion, Stream",
    },
    {
      id: "020_app_secrets",
      context: "app",
      path: "020_app_secrets/up.sql",
      checksum:
        "49fcb09dccfd4679a63a94fe9c975ee03167880ea2e9d6231e4195b59751ff02",
      description:
        "app_private.secrets, and the session key a fresh environment starts with (apps/web/lib/auth-secret.ts); lib/db/migrations/0001_app_secrets.sql is the same SQL for drizzle-kit",
    },
    {
      id: "030_row_level_security",
      context: "app",
      path: "030_row_level_security/up.sql",
      checksum:
        "7dfc6398290084f8e383ce0bed7b235716ffd745357d91012c5f5ea448b55096",
      description:
        "Row-level security, with no policies, on every table in public — closed to Supabase's Data API (anon, authenticated), open to the app, which owns them; refuses to run if the app's role would be locked out. lib/db/migrations/0002_row_level_security.sql is the same SQL for drizzle-kit",
    },
  ],
};
