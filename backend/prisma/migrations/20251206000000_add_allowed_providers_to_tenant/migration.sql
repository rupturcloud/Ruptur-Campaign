-- AlterTable
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "allowed_providers" TEXT[] DEFAULT ARRAY['WAHA', 'EVOLUTION', 'QUEPASA', 'UAZAPI']::TEXT[];

-- Tenants created by the original migration must receive the current default too.
UPDATE "tenants"
SET "allowed_providers" = ARRAY['WAHA', 'EVOLUTION', 'QUEPASA', 'UAZAPI']::TEXT[]
WHERE "allowed_providers" IS NULL
   OR "allowed_providers" = ARRAY['WAHA', 'EVOLUTION', 'QUEPASA']::TEXT[];
