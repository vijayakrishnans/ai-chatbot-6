-- The Comics tab's comics (apps/web/lib/db/schema.ts, `comic`), with
-- row-level security on and no policy, as every table here
-- (030_row_level_security). lib/db/migrations/0003_comics.sql is the same SQL
-- for drizzle-kit.

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

CREATE INDEX IF NOT EXISTS "Comic_userId_createdAt_idx" ON "Comic" ("userId", "createdAt");

ALTER TABLE "Comic" ENABLE ROW LEVEL SECURITY;
