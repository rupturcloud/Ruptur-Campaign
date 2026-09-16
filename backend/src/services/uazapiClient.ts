import { buildUazapiComposition } from './uazapiComposition';
import crypto from 'crypto';

export function normalizeUazapiHost(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Informe uma URL válida para o servidor Uazapi'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('URL do servidor Uazapi inválida');
  }
  return url.toString().replace(/\/+$/, '');
}
function encryptionKey() {
  if (!process.env.JWT_SECRET) throw new Error('Chave de proteção de credenciais indisponível');
  return crypto.createHash('sha256').update('ruptur-uazapi-v1:' + process.env.JWT_SECRET).digest();
}
export function encryptUazapiToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}
export function decryptUazapiToken(value: string): string {
  const [version, iv, tag, body] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Credencial Uazapi inválida');
  const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(body, 'base64')), cipher.final()]).toString('utf8');
}
export class UazapiClient {
  readonly host: string;
  constructor(host: string, private readonly token: string, private readonly timeoutMs = 20000) {
    this.host = normalizeUazapiHost(host);
    if (!token || /[\r\n]/.test(token)) throw new Error('Informe o token da instância Uazapi');
  }
  async request(endpoint: string, method = 'GET', payload?: unknown): Promise<any> {
    const allowed = ['GET /instance/status', 'POST /instance/connect', 'POST /instance/disconnect',
      'POST /send/text', 'POST /send/media', 'POST /send/menu', 'POST /send/carousel',
      'POST /send/location-button', 'POST /send/contact', 'POST /send/location',
      'POST /send/request-payment', 'POST /send/pix-button', 'POST /send/status',
      'POST /chat/check', 'GET /webhook', 'POST /webhook'];
    if (!allowed.includes(`${method} ${endpoint}`)) throw new Error('Operação Uazapi não suportada');
    let response: globalThis.Response;
    try {
      response = await fetch(this.host + endpoint, {
        method, headers: { 'Content-Type': 'application/json', token: this.token },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error'
      });
    } catch {
      throw new Error(method === 'POST' && endpoint.startsWith('/send/')
        ? 'Sem confirmação do Uazapi. Verifique a instância antes de reenviar para evitar duplicidade.'
        : 'Não foi possível acessar o servidor Uazapi');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Token Uazapi inválido ou sem permissão');
      throw new Error(`Uazapi retornou HTTP ${response.status}`);
    }
    const data: any = await response.json().catch(() => { throw new Error('Resposta Uazapi inválida'); });
    if (data?.error || data?.success === false) throw new Error('Operação recusada pelo Uazapi');
    return data;
  }
  async checkContact(phone: string) {
    const number = normalizeUazapiNumber(phone);
    const data = await this.request('/chat/check', 'POST', { numbers: [number] });
    if (!Array.isArray(data) || typeof data[0]?.isInWhatsapp !== 'boolean') throw new Error('Resposta de verificação Uazapi inválida');
    return { exists: data[0].isInWhatsapp, validPhone: data[0].jid || number };
  }
  async send(phone: string, message: any) {
    const number = normalizeUazapiNumber(phone);
    let endpoint = '/send/text';
    let body: any = { number, text: message.text, async: false, track_source: 'ruptur-campaign' };
    // Campaign internals use { image: { url }, caption }, while callers that
    // already speak Uazapi use { type, file, text }. Normalize both forms to
    // the exact /send/media contract from the Uazapi specification.
    const type = ['image', 'video', 'videoplay', 'audio', 'document', 'myaudio', 'ptt', 'ptv', 'sticker'].find(t => message[t]) ||
      (['image', 'video', 'videoplay', 'audio', 'document', 'myaudio', 'ptt', 'ptv', 'sticker'].includes(message.type) ? message.type : null);
    if (type) {
      const media = message[type];
      const file = typeof media === 'string' ? media : media?.url || media?.file || message.file;
      if (typeof file !== 'string' || !file) throw new Error('Arquivo de mídia obrigatório');
      endpoint = '/send/media';
      const fileUrl = file.startsWith('/')
        ? (process.env.APP_URL ? new URL(file, process.env.APP_URL).toString() : file)
        : file;
      const caption = message.caption ?? (typeof media === 'object' ? media.caption : undefined) ?? message.text ?? '';
      body = { number, type, file: fileUrl, text: caption,
        ...(type === 'document' ? { docName: message.fileName || media?.fileName || 'documento.pdf' } : {}),
        ...(message.mimetype ? { mimetype: message.mimetype } : {}),
        ...(message.viewOnce !== undefined ? { viewOnce: !!message.viewOnce } : {}),
        async: false, track_source: 'ruptur-campaign' };
    } else if (typeof message.text !== 'string' || !message.text.trim()) throw new Error('Texto da mensagem obrigatório');
    const data = await this.request(endpoint, 'POST', body);
    const id = data.messageid || data.id || data.message?.id || data.key?.id;
    if (!id || data.response?.status === 'error') throw new Error('Uazapi não confirmou o envio com um identificador de mensagem');
    return { id: String(id) };
  }
  async sendComposition(phone: string, composition: any) {
    const number = normalizeUazapiNumber(phone);
    if (!composition || typeof composition !== 'object') throw new Error('Composição Uazapi inválida');
    const { endpoint, payload } = buildUazapiComposition(number, composition);
    const data = await this.request(endpoint, 'POST', payload);
    const id = data.messageid || data.id || data.message?.id || data.key?.id;
    if (!id || data.response?.status === 'error') throw new Error('Uazapi não confirmou a composição enviada com um identificador');
    return { id: String(id), raw: data };
  }
}
export function normalizeUazapiNumber(phone: string): string {
  if (/^\d+(?:-\d+)?@(?:g\.us|s\.whatsapp\.net|lid)$/.test(phone)) return phone;
  const number = phone.replace(/\D/g, '');
  if (number.length < 8 || number.length > 15 || /[a-z@]/i.test(phone)) throw new Error('Número WhatsApp inválido');
  return number;
}
export function normalizeUazapiStatus(data: any) {
  const instance = data.instance || data;
  const connected = data.status?.connected === true || data.connected === true || instance.status === 'connected';
  const connecting = instance.status === 'connecting';
  const rawQr = !connected && connecting ? instance.qrcode || data.qrcode : null;
  const qr = typeof rawQr === 'string' && rawQr ? (rawQr.startsWith('data:image/') ? rawQr : `data:image/png;base64,${rawQr}`) : null;
  const jid = data.status?.jid || data.jid;
  const owner = instance.owner || (typeof jid === 'object' && jid?.user ? `${jid.user}@${jid.server || 's.whatsapp.net'}` : typeof jid === 'string' ? jid : null);
  return { status: connected ? 'WORKING' : connecting ? 'SCAN_QR_CODE' : 'STOPPED', qr,
    qrExpiresAt: qr ? new Date(Date.now() + 120000) : null,
    meId: connected ? owner : null, meJid: connected ? owner : null,
    mePushName: connected ? instance.profileName || instance.name || '' : null };
}
export function extractUazapiMessage(payload: any) {
  const event = payload.EventType || payload.event;
  if (!['messages', 'message'].includes(event)) return null;
  const message = payload.message || payload.data?.message || payload.data;
  if (!message || message.fromMe || message.wasSentByApi || message.isGroup || message.chatid?.endsWith('@g.us')) return null;
  const id = message.messageid || message.id;
  const sender = message.sender_pn || message.sender || message.chatid;
  // A LID is not a phone number; wait for a resolved PN instead of guessing.
  if (!id || typeof sender !== 'string' || sender.includes('@lid')) return null;
  const fromNumber = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
  const content = message.text || (typeof message.content === 'string' ? message.content : message.content?.text || '');
  if (!fromNumber || typeof content !== 'string' || !content) return null;
  return { messageId: String(id), fromNumber, content, isFromMe: false };
}
