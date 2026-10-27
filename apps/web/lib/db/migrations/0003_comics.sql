-- The same SQL as packages/db/src/migrations/040_comics/up.sql, for
-- drizzle-kit (`pnpm db:migrate`) against a local database.
CREATE TABLE IF NOT EXISTS "Comic" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "title" text NOT NULL,
  "idea" text NOT NULL,
  "style" varchar(32) NOT NULL,
  "panelCount" integer NOT NULL,
  "panels" json NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Comic_userId_createdAt_idx" ON "Comic" ("userId", "createdAt");
--> statement-breakpoint
ALTER TABLE "Comic" ENABLE ROW LEVEL SECURITY;
