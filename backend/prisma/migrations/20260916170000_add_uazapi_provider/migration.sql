ALTER TABLE "global_settings"
  ADD COLUMN IF NOT EXISTS "uazapi_host" TEXT NOT NULL DEFAULT '';

ALTER TABLE "whatsapp_sessions"
  ADD COLUMN IF NOT EXISTS "uazapi_host" TEXT,
  ADD COLUMN IF NOT EXISTS "uazapi_token" TEXT,
  ADD COLUMN IF NOT EXISTS "uazapi_instance_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_sessions_uazapi_instance_id_key"
  ON "whatsapp_sessions" ("uazapi_instance_id");

CREATE TABLE IF NOT EXISTS "uazapi_webhook_receipts" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "uazapi_webhook_receipts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tenants"
  ALTER COLUMN "allowed_providers" SET DEFAULT ARRAY['WAHA', 'EVOLUTION', 'QUEPASA', 'UAZAPI']::TEXT[];
