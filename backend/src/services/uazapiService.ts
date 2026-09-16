import { PrismaClient, WhatsAppSession } from '@prisma/client';
import crypto from 'crypto';
import { UazapiClient, encryptUazapiToken, decryptUazapiToken, normalizeUazapiStatus, normalizeUazapiHost } from './uazapiClient';
import { settingsService } from './settingsService';
const prisma = new PrismaClient();
export function publicUazapiSession(s: WhatsAppSession) {
  return { name: s.name, displayName: s.displayName, status: s.status, provider: s.provider,
    qr: s.qr, qrExpiresAt: s.qrExpiresAt, tenantId: s.tenantId,
    me: s.meId ? { id: s.meId, pushName: s.mePushName || '' } : undefined,
    interactiveCampaignEnabled: s.interactiveCampaignEnabled };
}
export const uazapiService = {
  client(session: WhatsAppSession) {
    if (!session.uazapiToken || !session.uazapiHost) throw new Error('Credenciais Uazapi não configuradas');
    return new UazapiClient(session.uazapiHost, decryptUazapiToken(session.uazapiToken));
  },
  async session(name: string, tenantId?: string) {
    const session = await prisma.whatsAppSession.findFirst({ where: { name, provider: 'UAZAPI', ...(tenantId ? { tenantId } : {}) } });
    if (!session) throw new Error('Conexão Uazapi não encontrada');
    return session;
  },
  async create(input: { name: string; displayName: string; tenantId: string; host?: string; token: string; interactiveCampaignEnabled?: boolean }) {
    const host = normalizeUazapiHost(input.host || (await settingsService.getSettings()).uazapiHost || process.env.DEFAULT_UAZAPI_HOST || '');
    const client = new UazapiClient(host, input.token);
    const data = await client.request('/instance/status');
    if (!data.instance?.id) throw new Error('A API não retornou uma instância Uazapi válida');
    const identity = crypto.createHash('sha256').update(host + ':' + data.instance.id).digest('hex');
    if (await prisma.whatsAppSession.findUnique({ where: { uazapiInstanceId: identity } })) throw new Error('Esta instância Uazapi já está vinculada ao Campaign');
    const session = await prisma.whatsAppSession.create({ data: {
      name: input.name, displayName: input.displayName, tenantId: input.tenantId, provider: 'UAZAPI',
      ...normalizeUazapiStatus(data), uazapiHost: host, uazapiToken: encryptUazapiToken(input.token),
      uazapiInstanceId: identity, interactiveCampaignEnabled: !!input.interactiveCampaignEnabled,
      webhookSecret: input.interactiveCampaignEnabled ? crypto.randomBytes(32).toString('hex') : null
    } });
    try {
      if (session.interactiveCampaignEnabled) await this.configureWebhook(session);
    } catch (error) {
      await prisma.whatsAppSession.delete({ where: { id: session.id } });
      throw error;
    }
    return publicUazapiSession(session);
  },
  async refresh(session: WhatsAppSession, connect = false) {
    const data = await this.client(session).request(connect ? '/instance/connect' : '/instance/status', connect ? 'POST' : 'GET', connect ? { browser: 'auto' } : undefined);
    const updated = await prisma.whatsAppSession.update({ where: { id: session.id }, data: normalizeUazapiStatus(data) });
    return publicUazapiSession(updated);
  },
  async configureWebhook(session: WhatsAppSession, remove = false) {
    const url = `${process.env.APP_URL}/api/webhooks/incoming/${session.id}/${session.webhookSecret}`;
    const client = this.client(session);
    const hooks = await client.request('/webhook');
    if (!Array.isArray(hooks)) throw new Error('Resposta de webhooks Uazapi inválida');
    const current = hooks.find(h => h.url === url);
    if (remove) { if (current) await client.request('/webhook', 'POST', { action: 'delete', id: current.id }); return; }
    await client.request('/webhook', 'POST', { action: current ? 'update' : 'add', ...(current ? { id: current.id } : {}),
      enabled: true, url, events: ['messages'], excludeMessages: ['wasSentByApi', 'isGroupYes'], addUrlEvents: false, addUrlTypesMessages: false });
  },
  async send(name: string, phone: string, message: any, tenantId?: string) {
    const session = await this.session(name, tenantId);
    const result = await this.client(session).send(phone, message);
    return result;
  },
  async checkContact(name: string, phone: string, tenantId?: string) {
    return this.client(await this.session(name, tenantId)).checkContact(phone);
  }
};
