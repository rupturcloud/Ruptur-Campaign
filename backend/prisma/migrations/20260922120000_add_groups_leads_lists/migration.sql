ALTER TABLE "campaign_messages" ALTER COLUMN "contact_id" DROP NOT NULL;

CREATE TABLE "whatsapp_groups" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "jid" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "participant_count" INTEGER NOT NULL DEFAULT 0,
  "is_community" BOOLEAN NOT NULL DEFAULT false,
  "parent_community_jid" TEXT,
  "invite_link" TEXT,
  "raw" JSONB,
  "last_synced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_groups_tenant_id_session_id_jid_key" ON "whatsapp_groups"("tenant_id", "session_id", "jid");
CREATE INDEX "whatsapp_groups_tenant_id_idx" ON "whatsapp_groups"("tenant_id");
CREATE INDEX "whatsapp_groups_tenant_id_is_community_idx" ON "whatsapp_groups"("tenant_id", "is_community");

CREATE TABLE "leads" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "telefone" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "jid" TEXT,
  "lid" TEXT,
  "tags" TEXT[] NOT NULL,
  "contact_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leads_tenant_id_telefone_key" ON "leads"("tenant_id", "telefone");
CREATE INDEX "leads_tenant_id_idx" ON "leads"("tenant_id");

CREATE TABLE "lead_lists" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "motivo" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_lists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_lists_tenant_id_nome_key" ON "lead_lists"("tenant_id", "nome");
CREATE INDEX "lead_lists_tenant_id_idx" ON "lead_lists"("tenant_id");

CREATE TABLE "lead_list_members" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "list_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "source_type" TEXT,
  "source_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_list_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_list_members_list_id_lead_id_key" ON "lead_list_members"("list_id", "lead_id");
CREATE INDEX "lead_list_members_tenant_id_idx" ON "lead_list_members"("tenant_id");

CREATE TABLE "group_leads" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "group_leads_group_id_lead_id_key" ON "group_leads"("group_id", "lead_id");
CREATE INDEX "group_leads_tenant_id_idx" ON "group_leads"("tenant_id");

ALTER TABLE "whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_groups" ADD CONSTRAINT "whatsapp_groups_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "whatsapp_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_list_members" ADD CONSTRAINT "lead_list_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_list_members" ADD CONSTRAINT "lead_list_members_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lead_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_list_members" ADD CONSTRAINT "lead_list_members_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_leads" ADD CONSTRAINT "group_leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_leads" ADD CONSTRAINT "group_leads_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "whatsapp_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_leads" ADD CONSTRAINT "group_leads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
