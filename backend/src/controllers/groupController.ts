import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AuthenticatedRequest } from '../middleware/auth';
import { uazapiService } from '../services/uazapiService';

const prisma = new PrismaClient();
const MIN_GROUP_INFO_INTERVAL_MS = 1200;
const activeExtractions = new Set<string>();
const lastGroupInfoAt = new Map<string, number>();
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const phoneOf = (value: any) => {
  const raw = typeof value === 'string' ? value : value?.phone || value?.Phone || value?.id || value?.ID || value?.jid || value?.JID || value?.user || value?.User;
  if (!raw) return null;
  const jid = String(raw);
  const digits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? { phone: digits, jid } : null;
};
const rows = (data: any): any[] => Array.isArray(data) ? data : data?.groups || data?.data || data?.response || [];
const participants = (data: any): any[] => data?.participants || data?.Participants || data?.group?.participants || data?.group?.Participants || data?.data?.participants || data?.data?.Participants || [];

function tenant(req: AuthenticatedRequest) { return req.tenantId || null; }
function sessionWhere(req: AuthenticatedRequest, id?: string) {
  return { ...(id ? { id } : {}), tenantId: tenant(req), provider: 'UAZAPI' } as any;
}

export async function listGroups(req: AuthenticatedRequest, res: Response) {
  const tenantId = tenant(req); if (!tenantId) return res.status(400).json({ error: 'Tenant não selecionado' });
  const groups = await prisma.whatsAppGroup.findMany({ where: { tenantId }, include: { session: { select: { name: true, displayName: true, status: true } }, _count: { select: { members: true } } }, orderBy: { nome: 'asc' } });
  res.json(groups);
}

export async function syncGroups(req: AuthenticatedRequest, res: Response) {
  const tenantId = tenant(req); if (!tenantId) return res.status(400).json({ error: 'Tenant não selecionado' });
  const sessions = await prisma.whatsAppSession.findMany({ where: sessionWhere(req, req.body?.sessionId), select: { id: true, name: true, displayName: true } });
  if (!sessions.length) return res.status(400).json({ error: 'Nenhuma conexão UAZAPI encontrada' });
  let count = 0;
  for (const session of sessions) {
    const full = await prisma.whatsAppSession.findUnique({ where: { id: session.id } }); if (!full) continue;
    const client = uazapiService.client(full);
    const allItems: any[] = [];
    for (let offset = 0; offset < 10000; offset += 50) {
      const page = await client.listGroups(50, offset);
      const pageItems = rows(page);
      allItems.push(...pageItems);
      if (pageItems.length < 50) break;
    }
    for (const item of allItems) {
      const jid = String(item.jid || item.JID || item.id || item.groupjid || item.groupJid || ''); if (!jid.includes('@g.us')) continue;
      const name = item.subject || item.Subject || item.name || item.Name || jid;
      const description = item.description || item.Description || item.Topic || null;
      const participantCount = Number(item.size || item.participantsCount || item.participantCount || item.ParticipantCount || item.participants?.length || item.Participants?.length || 0);
      const parentCommunityJid = item.parentCommunityJid || item.ParentCommunityJID || item.LinkedParentJID || null;
      const isCommunity = !!(item.isCommunity || item.IsCommunity || item.IsParent || parentCommunityJid);
      await prisma.whatsAppGroup.upsert({ where: { tenantId_sessionId_jid: { tenantId, sessionId: session.id, jid } }, create: { tenantId, sessionId: session.id, jid, nome: name, descricao: description, participantCount, isCommunity, parentCommunityJid, raw: item, lastSyncedAt: new Date() }, update: { nome: name, descricao: description, participantCount, isCommunity, parentCommunityJid, raw: item, lastSyncedAt: new Date() } });
      count++;
    }
  }
  res.json({ count, groups: await prisma.whatsAppGroup.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } }) });
}

export async function extractGroupLeads(req: AuthenticatedRequest, res: Response) {
  const tenantId = tenant(req); if (!tenantId) return res.status(400).json({ error: 'Tenant não selecionado' });
  const ids: string[] = Array.isArray(req.body?.groupIds) ? [...new Set(req.body.groupIds as string[])] : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecione pelo menos um grupo ou comunidade' });
  const groups = await prisma.whatsAppGroup.findMany({ where: { tenantId, id: { in: ids } }, include: { session: true } });
  const sessionIds = [...new Set(groups.map(group => group.sessionId))].sort();
  if (sessionIds.some(sessionId => activeExtractions.has(sessionId))) return res.status(409).json({ error: 'Já existe uma extração em andamento para uma das instâncias selecionadas. Aguarde a conclusão antes de iniciar outra.' });
  sessionIds.forEach(sessionId => activeExtractions.add(sessionId));
  const result = new Map<string, any>();
  try {
  // Consultas externas ficam fora da transação: a UAZAPI pode levar vários
  // segundos por grupo e não devemos manter uma transação Prisma aberta.
  const extracted: Array<{ group: typeof groups[number]; item: any; parsed: { phone: string; jid: string } }> = [];
  // Uma instância é consultada de forma sequencial e espaçada, como uma
  // operação normal de leitura. Não fazemos rajadas paralelas na UAZAPI.
  for (const group of groups) {
    const previous = lastGroupInfoAt.get(group.sessionId) || 0;
    const remaining = MIN_GROUP_INFO_INTERVAL_MS - (Date.now() - previous);
    if (remaining > 0) await wait(remaining);
    const data = await uazapiService.client(group.session).groupInfo(group.jid);
    lastGroupInfoAt.set(group.sessionId, Date.now());
    for (const item of participants(data)) {
      const parsed = phoneOf(item);
      if (parsed) extracted.push({ group, item, parsed });
    }
  }

  const uniqueLeads = new Map<string, { telefone: string; nome: string; jid: string }>();
  for (const { item, parsed } of extracted) {
    if (!parsed || uniqueLeads.has(parsed.phone)) continue;
    uniqueLeads.set(parsed.phone, { telefone: parsed.phone, jid: parsed.jid, nome: item.name || item.Name || item.pushName || item.PushName || item.notify || item.Notify || `Lead ${parsed.phone}` });
  }

  await prisma.$transaction(async tx => {
    await tx.lead.createMany({ data: [...uniqueLeads.values()].map(lead => ({ tenantId, ...lead, tags: [] })), skipDuplicates: true });
    const leads = await tx.lead.findMany({ where: { tenantId, telefone: { in: [...uniqueLeads.keys()] } }, select: { id: true, nome: true, telefone: true } });
    const leadsByPhone = new Map(leads.map(lead => [lead.telefone, lead]));
    await tx.groupLead.createMany({ data: extracted.flatMap(({ group, parsed }) => { const lead = parsed && leadsByPhone.get(parsed.phone); return lead ? [{ tenantId, groupId: group.id, leadId: lead.id }] : []; }), skipDuplicates: true });
    for (const { group, parsed } of extracted) { const lead = parsed && leadsByPhone.get(parsed.phone); if (lead) result.set(parsed.phone, { id: lead.id, nome: lead.nome, telefone: lead.telefone, groupId: group.id, groupName: group.nome }); }
  });
  res.json({ leads: [...result.values()], total: result.size });
  } finally {
    sessionIds.forEach(sessionId => activeExtractions.delete(sessionId));
  }
}

export async function listLeadLists(req: AuthenticatedRequest, res: Response) { res.json(await prisma.leadList.findMany({ where: { tenantId: tenant(req)! }, include: { _count: { select: { members: true } } }, orderBy: { updatedAt: 'desc' } })); }
export async function createLeadList(req: AuthenticatedRequest, res: Response) {
  const tenantId = tenant(req)!; const { nome, descricao, motivo, leadIds } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da lista é obrigatório' });
  const list = await prisma.$transaction(async tx => { const created = await tx.leadList.create({ data: { tenantId, nome, descricao, motivo, createdBy: req.user?.id } }); if (Array.isArray(leadIds) && leadIds.length) await tx.leadListMember.createMany({ data: leadIds.map((leadId: string) => ({ tenantId, listId: created.id, leadId, sourceType: 'group' })), skipDuplicates: true }); return created; });
  res.status(201).json(list);
}
export async function getLeadList(req: AuthenticatedRequest, res: Response) { const list = await prisma.leadList.findFirst({ where: { id: req.params.id, tenantId: tenant(req)! }, include: { members: { include: { lead: true } } } }); if (!list) return res.status(404).json({ error: 'Lista não encontrada' }); res.json(list); }
export async function addListMembers(req: AuthenticatedRequest, res: Response) { const list = await prisma.leadList.findFirst({ where: { id: req.params.id, tenantId: tenant(req)! } }); if (!list) return res.status(404).json({ error: 'Lista não encontrada' }); const ids = Array.isArray(req.body?.leadIds) ? req.body.leadIds : []; await prisma.leadListMember.createMany({ data: ids.map((leadId: string) => ({ tenantId: list.tenantId, listId: list.id, leadId })), skipDuplicates: true }); res.json({ added: ids.length }); }
export async function promoteLeads(req: AuthenticatedRequest, res: Response) { const tenantId = tenant(req)!; const ids = Array.isArray(req.body?.leadIds) ? req.body.leadIds : []; const tag = String(req.body?.tag || '').trim(); const leads = await prisma.lead.findMany({ where: { tenantId, id: { in: ids } } }); const contacts = await prisma.$transaction(async tx => Promise.all(leads.map(async lead => { const current = await tx.contact.findFirst({ where: { tenantId, telefone: lead.telefone } }); const tags = [...new Set([...(current?.tags || []), ...(lead.tags || []), ...(tag ? [tag] : [])])]; return current ? tx.contact.update({ where: { id: current.id }, data: { nome: lead.nome || current.nome, tags } }) : tx.contact.create({ data: { tenantId, nome: lead.nome, telefone: lead.telefone, tags } }); }))); res.json({ count: contacts.length, contacts }); }
export async function exportLeadList(req: AuthenticatedRequest, res: Response) { const list = await prisma.leadList.findFirst({ where: { id: req.params.id, tenantId: tenant(req)! }, include: { members: { include: { lead: true } } } }); if (!list) return res.status(404).json({ error: 'Lista não encontrada' }); const data = list.members.map(m => ({ nome: m.lead.nome, telefone: m.lead.telefone, tags: m.lead.tags.join(',') })); const format = String(req.query.format || 'csv'); if (format === 'txt') { res.type('text/plain').send(data.map(x => x.telefone).join('\n')); return; } if (format === 'xlsx') { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Leads'); const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer); return; } res.type('text/csv').send(['nome,telefone,tags', ...data.map(x => `${JSON.stringify(x.nome)},${x.telefone},${JSON.stringify(x.tags)}`)].join('\n')); }
