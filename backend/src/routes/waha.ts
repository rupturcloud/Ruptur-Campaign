import { uazapiService, publicUazapiSession } from '../services/uazapiService';
import { Router } from 'express';
import { WahaSyncService } from '../services/wahaSyncService';
import { WhatsAppSessionService } from '../services/whatsappSessionService';
import { evolutionApiService } from '../services/evolutionApiService';
import { settingsService } from '../services/settingsService';
import { configureQuepasaWebhook } from '../services/quepasaMessageService';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { Response } from 'express';
import { checkConnectionQuota } from '../middleware/quotaMiddleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const fetch = require('node-fetch');
const crypto = require('crypto');

// Função para gerar token aleatório para sessões Quepasa
function generateQuepasaToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Função para gerar webhook secret para campanhas interativas
function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

const wahaRequest = async (endpoint: string, options: any = {}) => {
  // Buscar configurações dinâmicas do banco usando o método específico
  const config = await settingsService.getWahaConfig();
  const WAHA_BASE_URL = config.host || process.env.WAHA_BASE_URL || process.env.DEFAULT_WAHA_HOST || '';
  const WAHA_API_KEY = config.apiKey || process.env.WAHA_API_KEY || process.env.DEFAULT_WAHA_API_KEY || '';

  console.log('🔍 WAHA Config Debug (routes):', {
    host: config.host,
    apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : 'undefined',
    finalUrl: WAHA_BASE_URL,
    finalKey: WAHA_API_KEY ? `${WAHA_API_KEY.substring(0, 8)}...` : 'undefined'
  });

  if (!WAHA_BASE_URL || !WAHA_API_KEY) {
    throw new Error('Configurações WAHA não encontradas. Configure o Host e API Key nas configurações do sistema.');
  }

  const url = `${WAHA_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': WAHA_API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`WAHA API Error: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
};

const router = Router();

// Handle Uazapi lifecycle before legacy provider fallbacks.
router.use('/sessions/:sessionName', authMiddleware, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const session = await prisma.whatsAppSession.findUnique({ where: { name: req.params.sessionName } });
    if (session?.provider !== 'UAZAPI') return next();
    if (!req.tenantId || session.tenantId !== req.tenantId) return res.status(404).json({ error: 'Conexão não encontrada nesta empresa' });
    if (req.method === 'GET' && ['/', '/status', '/me', '/auth/qr'].includes(req.path)) {
      const result = await uazapiService.refresh(session);
      if (req.path === '/auth/qr') return res.json({ qr: result.qr, expiresAt: result.qrExpiresAt, status: result.status });
      if (req.path === '/me') return res.json(result.me || {});
      return res.json(result);
    }
    if (req.method === 'POST' && ['/start', '/restart'].includes(req.path)) {
      // Reconnect without logging out an already paired phone.
      return res.json(await uazapiService.refresh(session, true));
    }
    if (req.method === 'POST' && req.path === '/stop') {
      await uazapiService.client(session).request('/instance/disconnect', 'POST', {});
      const updated = await prisma.whatsAppSession.update({ where: { id: session.id }, data: { status: 'STOPPED', qr: null, qrExpiresAt: null, meId: null, meJid: null, mePushName: null } });
      return res.json(publicUazapiSession(updated));
    }
    if (req.method === 'DELETE' && req.path === '/') {
      if (session.interactiveCampaignEnabled) await uazapiService.configureWebhook(session, true);
      await prisma.whatsAppSession.delete({ where: { id: session.id } });
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Operação não disponível para conexões Uazapi' });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Falha na conexão Uazapi' });
  }
});


// Listar todas as sessões sincronizadas com WAHA API
router.get('/sessions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const headerTenantId = req.header('X-Tenant-Id');
    console.log('📋 GET /sessions - user:', req.user?.email, 'role:', req.user?.role, 'tenantId:', req.tenantId, 'X-Tenant-Id header:', headerTenantId);

    // Sempre usar o tenantId do token (mesmo para SUPERADMIN quando tem empresa selecionada)
    const tenantId = req.tenantId;

    const uazapiSessions = await prisma.whatsAppSession.findMany({ where: { provider: 'UAZAPI', ...(tenantId ? { tenantId } : {}) } });
    await Promise.all(uazapiSessions.map(async session => {
      try { await uazapiService.refresh(session); }
      catch { await prisma.whatsAppSession.update({ where: { id: session.id }, data: { status: 'FAILED' } }); }
    }));

    // Sincronizar apenas sessões WAHA que já existem no banco DESTE tenant
    // NÃO buscar sessões externas - sistema SaaS multi-tenant
    try {
      const wahaSessions = await WhatsAppSessionService.getAllSessions(tenantId);
      const wahaSessionsFiltered = wahaSessions.filter(s => s.provider === 'WAHA');

      if (wahaSessionsFiltered.length > 0) {
        console.log(`🔄 Atualizando status de ${wahaSessionsFiltered.length} sessões WAHA do tenant...`);
        for (const session of wahaSessionsFiltered) {
          try {
            await WahaSyncService.syncSession(session.name);
          } catch (err) {
            console.warn(`⚠️ Erro ao sincronizar sessão WAHA ${session.name}:`, err);
          }
        }
      }
    } catch (wahaError) {
      console.warn('⚠️ Erro ao sincronizar WAHA, mas continuando com dados do banco:', wahaError);
    }

    // Sincronizar sessões Quepasa
    try {
      console.log('🔄 Sincronizando status das sessões Quepasa...');
      const quepasaSessions = await WhatsAppSessionService.getAllSessions(tenantId);
      const quepasaConfig = await settingsService.getQuepasaConfig();

      console.log(`📊 Total de sessões: ${quepasaSessions.length}`);
      const quepasaSessionsFiltered = quepasaSessions.filter(s => s.provider === 'QUEPASA');
      console.log(`📊 Sessões Quepasa encontradas: ${quepasaSessionsFiltered.length}`, quepasaSessionsFiltered.map(s => s.name));
      console.log(`📊 Config Quepasa - URL: ${quepasaConfig.url ? 'configurada' : 'não configurada'}, Login: ${quepasaConfig.login}, Token: ${quepasaConfig.password ? 'configurado' : 'não configurado'}`);

      if (quepasaConfig.url && quepasaConfig.login) {
        for (const session of quepasaSessionsFiltered) {
          try {
            console.log(`🔍 Verificando status Quepasa para ${session.name}...`);

            // Usar APENAS o token da sessão (não usar token global)
            const sessionToken = (session as any).quepasaToken;

            // Se não tiver token, a sessão ainda não foi iniciada - manter status atual
            if (!sessionToken) {
              console.log(`⏭️ Sessão ${session.name} não tem token - ainda não foi iniciada, mantendo status: ${(session as any).status}`);
              continue;
            }

            console.log(`🔑 Usando token da sessão para ${session.name}: ${sessionToken.substring(0, 16)}...`);

            // Primeiro tentar /health com o token da sessão
            const statusResponse = await fetch(`${quepasaConfig.url}/health`, {
              headers: {
                'Accept': 'application/json',
                'X-QUEPASA-TOKEN': sessionToken
              }
            });

            console.log(`📡 Response status: ${statusResponse.status} ${statusResponse.statusText}`);

            // Erro 400 = token não encontrado na Quepasa
            // Se a sessão está em SCAN_QR_CODE, verificar se o usuário já escaneou o QR
            // (a QuePasa gera um token próprio quando o QR é escaneado)
            if (statusResponse.status === 400) {
              console.log(`⏳ Token ${sessionToken.substring(0, 16)}... não encontrado na Quepasa`);

              // Se a sessão está aguardando QR, verificar se há servidor ready
              if ((session as any).status === 'SCAN_QR_CODE') {
                console.log(`🔍 Sessão ${session.name} aguardando QR, verificando servidores ready...`);

                try {
                  // Listar todos os servidores do usuário
                  const listResponse = await fetch(`${quepasaConfig.url}/health`, {
                    headers: {
                      'Accept': 'application/json',
                      'X-QUEPASA-USER': quepasaConfig.login,
                      'X-QUEPASA-PASSWORD': quepasaConfig.password || ''
                    }
                  });

                  if (listResponse.ok) {
                    const listData = await listResponse.json();

                    if (listData.success && listData.items && Array.isArray(listData.items)) {
                      // Procurar servidor ready que não está associado a nenhuma sessão
                      for (const server of listData.items) {
                        const serverStatus = String(server.status || '').toLowerCase();
                        const isReady = serverStatus.includes('ready') || server.health === true;

                        if (server.token && isReady) {
                          // Verificar se este token já está sendo usado por outra sessão
                          const existingWithToken = await prisma.whatsAppSession.findFirst({
                            where: {
                              quepasaToken: server.token,
                              name: { not: session.name }
                            }
                          });

                          if (!existingWithToken) {
                            console.log(`✅ Servidor ready encontrado para ${session.name}! Token: ${server.token.substring(0, 16)}...`);

                            // Atualizar sessão com o token real da QuePasa
                            await WhatsAppSessionService.createOrUpdateSession({
                              name: session.name,
                              status: 'WORKING',
                              provider: 'QUEPASA',
                              tenantId: (session as any).tenantId,
                              displayName: (session as any).displayName,
                              quepasaToken: server.token,
                              me: {
                                id: server.wid || server.number || 'unknown',
                                pushName: server.name || 'Quepasa'
                              }
                            });

                            console.log(`💾 Sessão ${session.name} atualizada para WORKING com token real`);

                            // Configurar webhook se campanha interativa estiver habilitada
                            const fullSession = await prisma.whatsAppSession.findUnique({
                              where: { name: session.name }
                            });

                            if (fullSession?.interactiveCampaignEnabled && fullSession?.webhookSecret) {
                              const baseUrl = process.env.APP_URL || 'https://work.trecofantastico.com.br';
                              const webhookUrlForQuepasa = `${baseUrl}/api/webhooks/incoming/${fullSession.id}/${fullSession.webhookSecret}`;
                              console.log(`🔗 Configurando webhook QuePasa para campanhas interativas: ${webhookUrlForQuepasa}`);

                              const webhookResult = await configureQuepasaWebhook(server.token, webhookUrlForQuepasa);
                              if (webhookResult.success) {
                                console.log(`✅ Webhook QuePasa configurado com sucesso para ${session.name}`);
                              } else {
                                console.error(`❌ Erro ao configurar webhook QuePasa: ${webhookResult.error}`);
                              }
                            }

                            break;
                          }
                        }
                      }
                    }
                  }
                } catch (listError) {
                  console.warn(`⚠️ Erro ao listar servidores QuePasa:`, listError);
                }
              }

              continue;
            }

            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              console.log(`📱 Status Quepasa completo (JSON):`, JSON.stringify(statusData, null, 2));

              // Endpoint /health retorna: { success: true/false, status: "server status is ready"/"server status is disconnected"/etc }
              let mappedStatus: 'WORKING' | 'SCAN_QR_CODE' | 'STOPPED' | 'FAILED' = 'STOPPED';
              const statusLower = String(statusData.status).toLowerCase();

              console.log(`🔍 Debug - success: ${statusData.success}, status original: "${statusData.status}", statusLower: "${statusLower}"`);

              // /health retorna "server status is ready" quando conectado
              if (statusData.success === true && statusLower.includes('ready')) {
                mappedStatus = 'WORKING';
                console.log('✅ Mapeado para WORKING');
              } else if (statusLower.includes('starting') || statusLower.includes('qrcode')) {
                mappedStatus = 'SCAN_QR_CODE';
                console.log('⏳ Mapeado para SCAN_QR_CODE');
              } else if (statusLower.includes('disconnected') || statusLower.includes('stopped')) {
                mappedStatus = 'STOPPED';
                console.log('⏹️ Mapeado para STOPPED');
              } else {
                mappedStatus = 'FAILED';
                console.log('❌ Mapeado para FAILED');
              }

              console.log(`📱 Status mapeado para ${session.name}: ${mappedStatus}`);

              // Extrair informações do número conectado se disponível
              let meData: any = undefined;
              if (statusData.number || statusData.wid || statusData.id) {
                const phoneNumber = statusData.number || statusData.wid || statusData.id;
                meData = {
                  id: phoneNumber,
                  pushName: statusData.pushName || statusData.name || 'Quepasa',
                };
                console.log(`📞 Número Quepasa detectado:`, meData);
              }

              // Verificar se estava em outro status e agora está WORKING (primeira vez conectando)
              const previousStatus = (session as any).status;
              const isNewlyConnected = mappedStatus === 'WORKING' && previousStatus !== 'WORKING';

              // Atualizar status no banco (manter o token que já foi salvo/descoberto)
              await WhatsAppSessionService.createOrUpdateSession({
                name: session.name,
                status: mappedStatus,
                provider: 'QUEPASA',
                tenantId: session.tenantId || undefined,
                quepasaToken: sessionToken, // IMPORTANTE: preservar o token
                me: meData
              });

              // Se acabou de conectar (WORKING), configurar webhook se campanha interativa estiver habilitada
              if (isNewlyConnected) {
                const fullSession = await prisma.whatsAppSession.findUnique({
                  where: { name: session.name }
                });

                if (fullSession?.interactiveCampaignEnabled && fullSession?.webhookSecret) {
                  const baseUrl = process.env.APP_URL || 'https://work.trecofantastico.com.br';
                  const webhookUrlForQuepasa = `${baseUrl}/api/webhooks/incoming/${fullSession.id}/${fullSession.webhookSecret}`;
                  console.log(`🔗 Configurando webhook QuePasa para campanhas interativas (status sync): ${webhookUrlForQuepasa}`);

                  const webhookResult = await configureQuepasaWebhook(sessionToken, webhookUrlForQuepasa);
                  if (webhookResult.success) {
                    console.log(`✅ Webhook QuePasa configurado com sucesso para ${session.name}`);
                  } else {
                    console.error(`❌ Erro ao configurar webhook QuePasa: ${webhookResult.error}`);
                  }
                }
              }
            }
          } catch (quepasaError) {
            console.warn(`⚠️ Erro ao sincronizar status Quepasa para ${session.name}:`, quepasaError);
          }
        }
      }
    } catch (quepasaError) {
      console.warn('⚠️ Erro ao sincronizar Quepasa, mas continuando com dados do banco:', quepasaError);
    }

    // Sincronizar apenas sessões Evolution que já existem no banco DESTE tenant
    // NÃO buscar sessões externas - sistema SaaS multi-tenant
    try {
      const allSessions = await WhatsAppSessionService.getAllSessions(tenantId);
      const evolutionSessions = allSessions.filter(s => s.provider === 'EVOLUTION');

      if (evolutionSessions.length > 0) {
        console.log(`🔄 Atualizando status de ${evolutionSessions.length} sessões Evolution do tenant...`);

        for (const session of evolutionSessions) {
          try {
            // Obter status atualizado da Evolution API
            const status = await evolutionApiService.getInstanceStatus(session.name);
            console.log(`🔍 Status Evolution para ${session.name}:`, status);

            // Obter informações detalhadas da instância
            const instanceInfo = await evolutionApiService.getInstanceInfo(session.name);

            // Montar dados do 'me' quando conectado
            let meData = undefined;
            const evolutionData = instanceInfo as any;
            if (status === 'WORKING' && (evolutionData.ownerJid || evolutionData.owner)) {
              const jid = evolutionData.ownerJid || evolutionData.owner;
              meData = {
                id: jid,
                pushName: evolutionData.profileName || instanceInfo.profileName || 'Usuário WhatsApp',
                jid: jid
              };
            }

            // Atualizar sessão no banco (já existe, só atualiza status)
            if (status && ['WORKING', 'SCAN_QR_CODE', 'STOPPED', 'FAILED'].includes(status)) {
              await WhatsAppSessionService.createOrUpdateSession({
                name: session.name,
                displayName: session.displayName,
                status: status as 'WORKING' | 'SCAN_QR_CODE' | 'STOPPED' | 'FAILED',
                provider: 'EVOLUTION',
                me: meData,
                qr: session.qr || undefined,
                qrExpiresAt: session.qrExpiresAt || undefined,
                tenantId: session.tenantId || undefined // Manter o tenantId original
              });
              console.log(`✅ Sessão Evolution "${session.name}" atualizada com status ${status}`);
            }
          } catch (instanceError) {
            console.warn(`⚠️ Erro ao atualizar sessão Evolution ${session.name}:`, instanceError);
          }
        }
      }
    } catch (evolutionError) {
      console.warn('⚠️ Erro ao sincronizar Evolution, mas continuando com dados do banco:', evolutionError);
    }

    // Retornar todas as sessões atualizadas do banco
    const updatedSessions = await WhatsAppSessionService.getAllSessions(tenantId);
    res.json(updatedSessions);
  } catch (error) {
    console.error('Erro ao listar sessões:', error);
    res.status(500).json({ error: 'Erro ao listar sessões WhatsApp' });
  }
});

// Obter informações de uma sessão específica
router.get('/sessions/:sessionName', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    console.log('🔍 GET /sessions/:sessionName - sessionName:', sessionName, 'user:', req.user?.email, 'tenantId:', req.tenantId);

    // SUPERADMIN pode ver qualquer sessão, outros usuários só do seu tenant
    const tenantId = req.user?.role === 'SUPERADMIN' ? undefined : req.tenantId;

    // Primeiro tentar buscar a sessão no banco com tenant isolation
    try {
      const session = await WhatsAppSessionService.getSession(sessionName, tenantId);
      console.log('✅ Sessão encontrada no banco:', session.name);
      return res.json(session);
    } catch (dbError) {
      console.log('⚠️ Sessão não encontrada no banco, tentando sincronizar com WAHA...');
    }

    // Se não encontrar no banco, tentar sincronizar com WAHA
    const session = await WahaSyncService.syncSession(sessionName);
    res.json(session);
  } catch (error) {
    console.error('Erro ao obter sessão:', error);
    res.status(500).json({ error: 'Erro ao obter informações da sessão' });
  }
});

// Criar nova sessão
router.post('/sessions', authMiddleware, checkConnectionQuota, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, provider = 'WAHA', interactiveCampaignEnabled = false } = req.body;
    console.log('➕ POST /sessions - name:', name, 'provider:', provider, 'interactiveCampaign:', interactiveCampaignEnabled, 'user:', req.user?.email, 'tenantId:', req.tenantId);

    if (!name) {
      return res.status(400).json({ error: 'Nome da sessão é obrigatório' });
    }

    if (!['WAHA', 'EVOLUTION', 'QUEPASA', 'UAZAPI'].includes(provider)) {
      return res.status(400).json({ error: 'Provedor deve ser WAHA, EVOLUTION, QUEPASA ou UAZAPI' });
    }

    // Usar tenantId do usuário autenticado (SUPERADMIN pode especificar tenant no body se necessário)
    const tenantId = req.user?.role === 'SUPERADMIN' ? req.body.tenantId || req.tenantId : req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: 'TenantId é obrigatório' });
    }

    // Gerar nome real: displayName_primeiros8CharsTenantId
    // Ex: vendas_c52982e8
    const displayName = name.trim();
    const tenantPrefix = tenantId.substring(0, 8);
    const realName = `${displayName}_${tenantPrefix}`;

    console.log('📝 Criando sessão - displayName:', displayName, 'realName:', realName);

    // Verificar se já existe uma sessão com este realName
    const existingSession = await prisma.whatsAppSession.findUnique({
      where: { name: realName }
    });

    if (existingSession) {
      console.log('⚠️ Sessão já existe:', realName);
      return res.status(409).json({ error: 'Já existe uma conexão com este nome' });
    }

    if (provider === 'UAZAPI') {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant?.active || !(tenant.allowedProviders || []).includes('UAZAPI') && !(tenant.allowedProviders || []).every((p: string) => ['WAHA', 'EVOLUTION', 'QUEPASA'].includes(p))) return res.status(403).json({ error: 'Uazapi não está habilitado para esta empresa' });
      if (!/^[\p{L}\p{N} _-]{1,64}$/u.test(displayName)) return res.status(400).json({ error: 'Use um nome de até 64 letras, números, espaços, hífens ou sublinhados' });
      if (typeof req.body.uazapiToken !== 'string' || !req.body.uazapiToken.trim()) return res.status(400).json({ error: 'Token da instância Uazapi obrigatório' });
      return res.json(await uazapiService.create({ name: realName, displayName, tenantId,
        host: req.body.uazapiHost, token: req.body.uazapiToken.trim(), interactiveCampaignEnabled }));
    }

    let result;
    let webhookSecret: string | undefined;
    let webhookUrl: string | undefined;

    // Se campanha interativa habilitada, gerar webhook secret e URL
    if (interactiveCampaignEnabled) {
      webhookSecret = generateWebhookSecret();
      console.log(`🔑 Webhook secret gerado para sessão ${realName}: ${webhookSecret.substring(0, 16)}...`);
    }

    if (provider === 'EVOLUTION') {
      const { evolutionApiService } = await import('../services/evolutionApiService');

      // Se campanha interativa habilitada, construir URL do webhook
      // Nota: sessionId será gerado após criar a sessão no banco
      const tempSession = await prisma.whatsAppSession.create({
        data: {
          name: realName,
          displayName,
          status: 'SCAN_QR_CODE',
          provider: 'EVOLUTION',
          tenantId,
          interactiveCampaignEnabled,
          webhookSecret
        }
      });

      if (interactiveCampaignEnabled && webhookSecret) {
        const baseUrl = process.env.APP_URL || 'https://work.trecofantastico.com.br';
        webhookUrl = `${baseUrl}/api/webhooks/incoming/${tempSession.id}/${webhookSecret}`;
        console.log(`🔗 Webhook URL para Evolution: ${webhookUrl}`);
      }

      result = await evolutionApiService.createInstance(realName, webhookUrl);

      // Extrair QR code da resposta da criação (se disponível)
      let qrCode: string | undefined;
      let qrExpiresAt: Date | undefined;

      if (result.qrcode?.base64) {
        // QR code veio na resposta
        qrCode = result.qrcode.base64.startsWith('data:image/')
          ? result.qrcode.base64
          : `data:image/png;base64,${result.qrcode.base64}`;
        qrExpiresAt = new Date(Date.now() + 300000); // 5 minutos
        console.log(`✅ QR Code Evolution recebido na criação para ${realName}`);
      }

      // Atualizar sessão com QR code
      await WhatsAppSessionService.createOrUpdateSession({
        name: realName,
        displayName,
        status: 'SCAN_QR_CODE',
        provider: 'EVOLUTION',
        tenantId,
        qr: qrCode,
        qrExpiresAt: qrExpiresAt,
        interactiveCampaignEnabled,
        webhookSecret
      });
    } else if (provider === 'QUEPASA') {
      // Quepasa - criar sessão e gerar token único
      // O QR code será gerado quando o usuário clicar para conectar
      const quepasaToken = generateQuepasaToken();
      console.log(`🔑 Token único gerado para sessão QuePasa ${realName}: ${quepasaToken.substring(0, 16)}...`);

      // Primeiro criar sessão no banco para obter o ID
      const tempSession = await prisma.whatsAppSession.create({
        data: {
          name: realName,
          displayName,
          status: 'STOPPED',
          provider: 'QUEPASA',
          tenantId,
          quepasaToken,
          interactiveCampaignEnabled,
          webhookSecret
        }
      });

      // Se campanha interativa habilitada, gerar webhook URL
      if (interactiveCampaignEnabled && webhookSecret) {
        const baseUrl = process.env.APP_URL || 'https://work.trecofantastico.com.br';
        webhookUrl = `${baseUrl}/api/webhooks/incoming/${tempSession.id}/${webhookSecret}`;
        console.log(`🔗 Webhook URL para QuePasa: ${webhookUrl}`);

        // Nota: O webhook será configurado na API QuePasa quando a sessão conectar (status WORKING)
        // porque precisamos do token válido e sessão ativa
      }

      result = { name: realName, status: 'STOPPED', provider: 'QUEPASA', token: quepasaToken, webhookUrl };

    } else {
      // WAHA (comportamento original)
      // Se campanha interativa habilitada, criar sessão primeiro para obter ID
      const tempSession = await prisma.whatsAppSession.create({
        data: {
          name: realName,
          displayName,
          status: 'SCAN_QR_CODE',
          provider: 'WAHA',
          tenantId,
          interactiveCampaignEnabled,
          webhookSecret
        }
      });

      if (interactiveCampaignEnabled && webhookSecret) {
        const baseUrl = process.env.APP_URL || 'https://work.trecofantastico.com.br';
        webhookUrl = `${baseUrl}/api/webhooks/incoming/${tempSession.id}/${webhookSecret}`;
        console.log(`🔗 Webhook URL para WAHA: ${webhookUrl}`);
      }

      result = await WahaSyncService.createSession(realName, webhookUrl);

      // Atualizar sessão
      await WhatsAppSessionService.createOrUpdateSession({
        name: realName,
        displayName,
        status: 'SCAN_QR_CODE',
        provider: 'WAHA',
        tenantId,
        interactiveCampaignEnabled,
        webhookSecret
      });
    }

    console.log('✅ Sessão criada:', realName, '(display:', displayName, ') tenant:', tenantId);

    res.json(result);
  } catch (error) {
    console.error('Erro ao criar sessão:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao criar sessão WhatsApp' });
  }
});

// Iniciar sessão
router.post('/sessions/:sessionName/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    console.log('▶️ POST /sessions/:sessionName/start - sessionName:', sessionName, 'user:', req.user?.email, 'tenantId:', req.tenantId);

    // SUPERADMIN pode iniciar qualquer sessão, outros usuários só do seu tenant
    const tenantId = req.user?.role === 'SUPERADMIN' ? undefined : req.tenantId;

    // Verificar o provedor da sessão
    let sessionProvider = 'WAHA'; // Default para WAHA (compatibilidade)
    let sessionData: any;
    try {
      sessionData = await WhatsAppSessionService.getSession(sessionName, tenantId);
      sessionProvider = sessionData.provider || 'WAHA';
    } catch (error) {
      console.error('❌ Sessão não encontrada ou não pertence ao tenant:', error);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    console.log(`▶️ Iniciando sessão ${sessionName} via ${sessionProvider}`);

    let result;
    if (sessionProvider === 'EVOLUTION') {
      // Usar Evolution API - conectar e obter QR Code
      try {
        console.log(`🔄 Conectando instância Evolution ${sessionName}...`);
        result = await evolutionApiService.getQRCode(sessionName);

        // Se conseguiu obter QR, salvar no banco
        if (result) {
          const qrExpiresAt = new Date(Date.now() + 300000); // 5 minutos

          await WhatsAppSessionService.createOrUpdateSession({
            name: sessionName,
            status: 'SCAN_QR_CODE',
            provider: 'EVOLUTION',
            tenantId: sessionData.tenantId,
            qr: result,
            qrExpiresAt: qrExpiresAt
          });

          console.log(`✅ Sessão Evolution ${sessionName} iniciada com QR Code salvo`);
        }

        // Retornar o QR code para o frontend
        result = { qr: result, status: 'SCAN_QR_CODE' };
      } catch (error: any) {
        console.error(`❌ Erro ao conectar instância Evolution ${sessionName}:`, error.message);
        throw new Error(`Erro ao iniciar sessão WhatsApp: ${error.message}`);
      }
    } else if (sessionProvider === 'QUEPASA') {
      // Usar Quepasa API - gerar QR Code
      try {
        console.log(`🔄 Conectando instância Quepasa ${sessionName}...`);

        // Buscar configurações do Quepasa
        const quepasaConfig = await settingsService.getQuepasaConfig();

        if (!quepasaConfig.url || !quepasaConfig.login) {
          throw new Error('Configure as credenciais Quepasa nas configurações do sistema');
        }

        // Usar APENAS o token da sessão (não usar token global)
        let sessionToken = sessionData.quepasaToken;

        // Se não tiver token, gerar e salvar um novo (para sessões criadas antes da implementação)
        if (!sessionToken) {
          sessionToken = generateQuepasaToken();
          console.log(`🔑 Gerando novo token para sessão ${sessionName} (sessão sem token): ${sessionToken.substring(0, 16)}...`);

          await WhatsAppSessionService.createOrUpdateSession({
            name: sessionName,
            status: sessionData.status,
            provider: 'QUEPASA',
            tenantId: sessionData.tenantId,
            quepasaToken: sessionToken
          });
          console.log(`💾 Token salvo para sessão ${sessionName}`);
        }

        console.log(`🔑 Usando token da sessão para ${sessionName}`);

        // Fazer requisição para gerar QR Code
        const qrResponse = await fetch(`${quepasaConfig.url}/scan`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-QUEPASA-USER': quepasaConfig.login,
            'X-QUEPASA-TOKEN': sessionToken
          }
        });

        if (!qrResponse.ok) {
          throw new Error(`Erro ao gerar QR Code Quepasa: ${qrResponse.status} ${qrResponse.statusText}`);
        }

        // Converter resposta para base64
        const imageBuffer = await qrResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const qrBase64 = `data:image/png;base64,${base64Image}`;

        const qrExpiresAt = new Date(Date.now() + 300000); // 5 minutos

        // Salvar QR no banco (preservando o token!)
        await WhatsAppSessionService.createOrUpdateSession({
          name: sessionName,
          status: 'SCAN_QR_CODE',
          provider: 'QUEPASA',
          tenantId: sessionData.tenantId,
          quepasaToken: sessionToken, // IMPORTANTE: preservar o token
          qr: qrBase64,
          qrExpiresAt: qrExpiresAt
        });

        console.log(`✅ Sessão Quepasa ${sessionName} iniciada com QR Code salvo (token: ${sessionToken.substring(0, 16)}...)`);

        result = { qr: qrBase64, status: 'SCAN_QR_CODE' };
      } catch (error: any) {
        console.error(`❌ Erro ao conectar instância Quepasa ${sessionName}:`, error.message);
        throw new Error(`Erro ao iniciar sessão Quepasa: ${error.message}`);
      }
    } else {
      // Usar WAHA com chamada direta
      result = await wahaRequest(`/api/sessions/${sessionName}/start`, {
        method: 'POST'
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Erro ao iniciar sessão:', error);
    res.status(500).json({ error: 'Erro ao iniciar sessão WhatsApp' });
  }
});

// Parar sessão
router.post('/sessions/:sessionName/stop', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    console.log('⏹️ POST /sessions/:sessionName/stop - sessionName:', sessionName, 'user:', req.user?.email, 'tenantId:', req.tenantId);

    // SUPERADMIN pode parar qualquer sessão, outros usuários só do seu tenant
    const tenantId = req.user?.role === 'SUPERADMIN' ? undefined : req.tenantId;

    // Verificar o provedor da sessão
    let sessionProvider = 'WAHA';
    let sessionData: any;
    try {
      sessionData = await WhatsAppSessionService.getSession(sessionName, tenantId);
      sessionProvider = sessionData.provider || 'WAHA';
    } catch (error) {
      console.error('❌ Sessão não encontrada ou não pertence ao tenant:', error);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    console.log(`⏹️ Parando sessão ${sessionName} via ${sessionProvider}`);

    let result;
    if (sessionProvider === 'EVOLUTION') {
      // Para Evolution API, não há stop específico, apenas deletar
      result = { message: 'Sessão Evolution parada (conceitual)' };
      await WhatsAppSessionService.createOrUpdateSession({
        name: sessionName,
        status: 'STOPPED',
        provider: 'EVOLUTION',
        tenantId: sessionData.tenantId
      });
    } else {
      result = await WahaSyncService.stopSession(sessionName);
    }

    res.json(result);
  } catch (error) {
    console.error('Erro ao parar sessão:', error);
    res.status(500).json({ error: 'Erro ao parar sessão WhatsApp' });
  }
});

// Reiniciar sessão
router.post('/sessions/:sessionName/restart', async (req, res) => {
  try {
    const { sessionName } = req.params;

    // Verificar o provedor da sessão
    let sessionProvider = 'WAHA';
    try {
      const savedSession = await WhatsAppSessionService.getSession(sessionName);
      sessionProvider = (savedSession as any).provider || 'WAHA';
    } catch (error) {
      // Se sessão não existe no banco, assumir WAHA
    }

    console.log(`🔄 Reiniciando sessão ${sessionName} via ${sessionProvider}`);

    let result;
    if (sessionProvider === 'EVOLUTION') {
      result = await evolutionApiService.restartInstance(sessionName);
      await WhatsAppSessionService.createOrUpdateSession({
        name: sessionName,
        status: 'SCAN_QR_CODE',
        provider: 'EVOLUTION'
      });
    } else {
      result = await WahaSyncService.restartSession(sessionName);
    }

    res.json(result);
  } catch (error) {
    console.error('Erro ao reiniciar sessão:', error);
    res.status(500).json({ error: 'Erro ao reiniciar sessão WhatsApp' });
  }
});

// Deletar sessão
router.delete('/sessions/:sessionName', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    console.log('🗑️ DELETE /sessions/:sessionName - sessionName:', sessionName, 'user:', req.user?.email, 'tenantId:', req.tenantId);

    // SUPERADMIN pode deletar qualquer sessão, outros usuários só do seu tenant
    const tenantId = req.user?.role === 'SUPERADMIN' ? undefined : req.tenantId;

    // Verificar o provedor da sessão
    let sessionProvider: 'WAHA' | 'EVOLUTION' | 'QUEPASA' | 'UAZAPI' = 'WAHA';
    try {
      const savedSession = await WhatsAppSessionService.getSession(sessionName, tenantId);
      sessionProvider = (savedSession.provider as 'WAHA' | 'EVOLUTION' | 'QUEPASA' | 'UAZAPI') || 'WAHA';
    } catch (error) {
      console.error('❌ Sessão não encontrada ou não pertence ao tenant:', error);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    console.log(`🗑️ Deletando sessão ${sessionName} via ${sessionProvider}`);

    // Deletar da API correspondente
    if (sessionProvider === 'EVOLUTION') {
      try {
        await evolutionApiService.deleteInstance(sessionName);
        console.log(`✅ Sessão ${sessionName} deletada da Evolution API`);
      } catch (error) {
        console.warn(`⚠️ Erro ao deletar ${sessionName} da Evolution API:`, error);
      }
      // Para Evolution, deletar manualmente do banco também
      try {
        await WhatsAppSessionService.deleteSession(sessionName, tenantId);
        console.log(`✅ Sessão ${sessionName} removida do banco de dados`);
      } catch (error) {
        console.warn(`⚠️ Erro ao deletar ${sessionName} do banco:`, error);
      }
    } else if (sessionProvider === 'QUEPASA') {
      try {
        // Buscar configurações do Quepasa e dados da sessão
        const quepasaConfig = await settingsService.getQuepasaConfig();
        const savedSession = await WhatsAppSessionService.getSession(sessionName, tenantId);

        if (quepasaConfig.url && quepasaConfig.login) {
          // Usar o token da sessão salvo no banco
          let sessionToken = (savedSession as any).quepasaToken;

          console.log(`🗑️ Deletando servidor Quepasa - Token: ${sessionToken ? sessionToken.substring(0, 16) + '...' : 'SEM TOKEN'}`);

          if (!sessionToken) {
            console.warn(`⚠️ Sessão ${sessionName} não tem token Quepasa salvo, pulando deleção na API`);
          } else {
            console.log(`🗑️ Deletando servidor Quepasa via API DELETE /info...`);

            // Deletar o servidor no Quepasa usando DELETE /info
            const deleteResponse = await fetch(`${quepasaConfig.url}/info`, {
              method: 'DELETE',
              headers: {
                'Accept': 'application/json',
                'X-QUEPASA-TOKEN': sessionToken
              }
            });

            console.log(`📡 Delete response status: ${deleteResponse.status} ${deleteResponse.statusText}`);

            if (deleteResponse.ok) {
              try {
                const deleteData = await deleteResponse.json();
                console.log(`✅ Servidor Quepasa deletado com sucesso:`, JSON.stringify(deleteData, null, 2));
              } catch (jsonError) {
                // Algumas APIs retornam 200 sem body
                console.log(`✅ Servidor Quepasa deletado (resposta sem JSON)`);
              }
            } else {
              const errorText = await deleteResponse.text();
              console.warn(`⚠️ Erro ao deletar do Quepasa: ${deleteResponse.status} - ${errorText}`);
            }
          }
        }
      } catch (quepasaError) {
        console.warn(`⚠️ Erro ao deletar ${sessionName} do Quepasa:`, quepasaError);
      }

      // Deletar do banco de dados
      try {
        await WhatsAppSessionService.deleteSession(sessionName, tenantId);
        console.log(`✅ Sessão ${sessionName} removida do banco de dados`);
      } catch (error) {
        console.warn(`⚠️ Erro ao deletar ${sessionName} do banco:`, error);
      }
    } else {
      // Deletar via WAHA (já remove do banco também)
      await WahaSyncService.deleteSession(sessionName);
    }

    res.json({ success: true, message: 'Sessão removida com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar sessão:', error);
    res.status(500).json({ error: 'Erro ao remover sessão WhatsApp' });
  }
});

// Obter QR Code da sessão
router.get('/sessions/:sessionName/auth/qr', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    console.log(`🔍 GET /sessions/:sessionName/auth/qr - sessionName: ${sessionName}, user: ${req.user?.email}, tenantId: ${req.tenantId}`);

    // SUPERADMIN pode ver QR de qualquer sessão, outros usuários só do seu tenant
    const tenantId = req.user?.role === 'SUPERADMIN' ? undefined : req.tenantId;

    // Primeiro, verificar se existe QR salvo no banco com tenant isolation
    try {
      const savedSession = await WhatsAppSessionService.getSession(sessionName, tenantId);

      if (savedSession.qr && savedSession.qrExpiresAt && savedSession.qrExpiresAt > new Date()) {
        console.log(`💾 Retornando QR salvo do banco para ${sessionName}`);
        return res.json({
          qr: savedSession.qr,
          expiresAt: savedSession.qrExpiresAt,
          status: savedSession.status,
          message: "QR code retornado do banco de dados"
        });
      }
    } catch (dbError) {
      console.log(`📋 Sessão ${sessionName} não encontrada no banco ou não pertence ao tenant, verificando WAHA API...`);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    // Verificar o provedor da sessão para rotear corretamente
    let sessionProvider: 'WAHA' | 'EVOLUTION' | 'QUEPASA' | 'UAZAPI' = 'WAHA'; // Default para WAHA (compatibilidade)
    let sessionData: any;
    try {
      sessionData = await WhatsAppSessionService.getSession(sessionName, tenantId);
      console.log(`🔍 Sessão ${sessionName} encontrada no banco:`, {
        provider: sessionData.provider,
        status: sessionData.status
      });
      sessionProvider = (sessionData.provider as 'WAHA' | 'EVOLUTION' | 'QUEPASA' | 'UAZAPI') || 'WAHA';
    } catch (error) {
      console.log(`⚠️ Sessão ${sessionName} não encontrada no banco ou não pertence ao tenant, assumindo WAHA`);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    console.log(`🔍 Processando QR para sessão ${sessionName} via ${sessionProvider}`);

    // Se for Evolution API, usar o serviço específico
    if (sessionProvider === 'EVOLUTION') {
      try {
        const qrCodeData = await evolutionApiService.getQRCode(sessionName);
        const expiresAt = new Date(Date.now() + 300000); // 5 minutos

        // Salvar o QR code no banco de dados
        await WhatsAppSessionService.createOrUpdateSession({
          name: sessionName,
          status: 'SCAN_QR_CODE',
          provider: 'EVOLUTION',
          qr: qrCodeData,
          qrExpiresAt: expiresAt,
          tenantId: sessionData.tenantId
        });

        console.log(`💾 QR code Evolution salvo no banco para sessão ${sessionName}`);

        return res.json({
          qr: qrCodeData,
          expiresAt: expiresAt,
          status: 'SCAN_QR_CODE',
          provider: 'EVOLUTION',
          message: "QR code gerado via Evolution API"
        });
      } catch (evolutionError: any) {
        console.error(`❌ Erro ao obter QR da Evolution API:`, evolutionError);
        return res.status(500).json({
          error: 'Erro ao obter QR Code da Evolution API',
          details: evolutionError.message
        });
      }
    } else if (sessionProvider === 'QUEPASA') {
      try {
        // Buscar configurações do Quepasa
        const quepasaConfig = await settingsService.getQuepasaConfig();

        if (!quepasaConfig.url || !quepasaConfig.login) {
          throw new Error('Configure as credenciais Quepasa nas configurações do sistema');
        }

        // Usar APENAS o token da sessão (não usar token global)
        let sessionToken = sessionData.quepasaToken;

        // Se não tiver token, gerar e salvar um novo (para sessões criadas antes da implementação)
        if (!sessionToken) {
          sessionToken = generateQuepasaToken();
          console.log(`🔑 Gerando novo token para sessão ${sessionName} (sessão sem token): ${sessionToken.substring(0, 16)}...`);

          await WhatsAppSessionService.createOrUpdateSession({
            name: sessionName,
            status: sessionData.status,
            provider: 'QUEPASA',
            tenantId: sessionData.tenantId,
            quepasaToken: sessionToken
          });
          console.log(`💾 Token salvo para sessão ${sessionName}`);
        }

        console.log(`🔑 Usando token da sessão para ${sessionName}`);

        // Fazer requisição para gerar QR Code
        const qrResponse = await fetch(`${quepasaConfig.url}/scan`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-QUEPASA-USER': quepasaConfig.login,
            'X-QUEPASA-TOKEN': sessionToken
          }
        });

        if (!qrResponse.ok) {
          throw new Error(`Erro ao gerar QR Code Quepasa: ${qrResponse.status} ${qrResponse.statusText}`);
        }

        // Converter resposta para base64
        const imageBuffer = await qrResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const qrBase64 = `data:image/png;base64,${base64Image}`;

        const expiresAt = new Date(Date.now() + 300000); // 5 minutos

        // Salvar o QR code no banco de dados (preservando o token!)
        await WhatsAppSessionService.createOrUpdateSession({
          name: sessionName,
          status: 'SCAN_QR_CODE',
          provider: 'QUEPASA',
          quepasaToken: sessionToken, // IMPORTANTE: preservar o token
          qr: qrBase64,
          qrExpiresAt: expiresAt,
          tenantId: sessionData.tenantId
        });

        console.log(`💾 QR code Quepasa salvo no banco para sessão ${sessionName} (token: ${sessionToken.substring(0, 16)}...)`);

        return res.json({
          qr: qrBase64,
          expiresAt: expiresAt,
          status: 'SCAN_QR_CODE',
          provider: 'QUEPASA',
          message: "QR code gerado via Quepasa API"
        });
      } catch (quepasaError: any) {
        console.error(`❌ Erro ao obter QR da Quepasa API:`, quepasaError);
        return res.status(500).json({
          error: 'Erro ao obter QR Code da Quepasa API',
          details: quepasaError.message
        });
      }
    } else {
      // Para WAHA, manter lógica original
    let sessionStatus;
    try {
      sessionStatus = await wahaRequest(`/api/sessions/${sessionName}`);
      console.log(`🔍 Status da sessão ${sessionName}:`, sessionStatus.status);
    } catch (wahaError: any) {
      console.error(`❌ Erro ao consultar status da sessão ${sessionName} na WAHA:`, wahaError.message);
      // Se não conseguir acessar WAHA, mas temos a sessão no banco com status SCAN_QR_CODE,
      // vamos tentar gerar o QR usando apenas a URL
      if (sessionData.status === 'SCAN_QR_CODE') {
        console.log(`🔄 Tentando gerar QR com base no banco (status: ${sessionData.status})`);
        sessionStatus = { status: 'SCAN_QR_CODE' };
      } else {
        return res.status(400).json({
          error: 'Não foi possível acessar a API WAHA para verificar o status da sessão',
          details: wahaError.message
        });
      }
    }

    // Priorizar status do banco se for SCAN_QR_CODE, senão usar status da WAHA
    const effectiveStatus = sessionData.status === 'SCAN_QR_CODE' ? 'SCAN_QR_CODE' : sessionStatus.status;
    console.log(`🔄 Status efetivo para ${sessionName}: ${effectiveStatus} (banco: ${sessionData.status}, WAHA: ${sessionStatus.status})`);

    if (effectiveStatus === 'SCAN_QR_CODE') {
      // Sessão está aguardando QR code - buscar QR da WAHA API
      console.log(`📱 Buscando QR code da WAHA API para sessão ${sessionName}`);

      try {
        // Buscar configurações WAHA
        const config = await settingsService.getWahaConfig();
        const WAHA_BASE_URL = config.host || process.env.WAHA_BASE_URL || process.env.DEFAULT_WAHA_HOST || '';
        const WAHA_API_KEY = config.apiKey || process.env.WAHA_API_KEY || process.env.DEFAULT_WAHA_API_KEY || '';

        // Buscar QR como imagem e converter para base64
        const qrImageUrl = `${WAHA_BASE_URL}/api/${sessionName}/auth/qr?format=image`;
        console.log(`📱 Buscando QR image da WAHA: ${qrImageUrl}`);

        const response = await fetch(qrImageUrl, {
          headers: {
            'X-API-KEY': WAHA_API_KEY,
            'Accept': 'image/png'
          }
        });

        if (!response.ok) {
          throw new Error(`Erro ao buscar QR da WAHA: ${response.status} ${response.statusText}`);
        }

        // Converter para base64
        const imageBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const qrBase64 = `data:image/png;base64,${base64Image}`;

        console.log(`📱 QR convertido para base64, tamanho: ${qrBase64.length} caracteres`);

        const expiresAt = new Date(Date.now() + 300000); // 5 minutos

        // Salvar o QR base64 no banco de dados
        await WhatsAppSessionService.createOrUpdateSession({
          name: sessionName,
          status: 'SCAN_QR_CODE',
          provider: 'WAHA',
          qr: qrBase64,
          qrExpiresAt: expiresAt,
          tenantId: sessionData.tenantId
        });

        console.log(`💾 QR WAHA base64 salvo no banco para sessão ${sessionName}`);

        res.json({
          qr: qrBase64,
          expiresAt: expiresAt,
          status: 'SCAN_QR_CODE',
          provider: 'WAHA',
          message: "QR code obtido da WAHA API e convertido para base64"
        });

      } catch (qrError: any) {
        console.error('❌ Erro ao buscar QR da WAHA:', qrError);

        res.status(500).json({
          error: 'Erro ao obter QR Code da WAHA API',
          details: qrError.message
        });
      }

    } else if (effectiveStatus === 'WORKING') {
      console.log(`✅ Sessão ${sessionName} já está conectada`);
      res.status(400).json({
        error: 'Sessão já está conectada',
        status: effectiveStatus
      });

    } else {
      // Para outros status (FAILED, STOPPED), ainda retornar QR se existe no banco
      try {
        if (sessionData.qr && sessionData.qrExpiresAt && sessionData.qrExpiresAt > new Date()) {
          console.log(`📋 Retornando QR existente do banco para sessão ${sessionName} (status: ${effectiveStatus})`);
          return res.json({
            qr: sessionData.qr,
            expiresAt: sessionData.qrExpiresAt,
            status: effectiveStatus,
            message: "QR code retornado do banco (sessão não disponível)"
          });
        }
      } catch (dbError) {
        // Continua para gerar erro abaixo
      }

      console.log(`❌ Sessão ${sessionName} não está disponível para QR code`);
      res.status(400).json({
        error: 'Sessão não está disponível para QR code',
        status: effectiveStatus
      });
    }
    }

  } catch (error) {
    console.error('Erro ao obter QR Code da WAHA:', error);
    res.status(500).json({ error: 'Erro ao obter QR Code' });
  }
});

// Obter status da sessão
router.get('/sessions/:sessionName/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    console.log('🔍 GET /sessions/:sessionName/status - sessionName:', sessionName, 'user:', req.user?.email, 'tenantId:', req.tenantId);

    // SUPERADMIN pode ver status de qualquer sessão, outros usuários só do seu tenant
    const tenantId = req.user?.role === 'SUPERADMIN' ? undefined : req.tenantId;

    // Verificar se a sessão pertence ao tenant
    try {
      await WhatsAppSessionService.getSession(sessionName, tenantId);
    } catch (error) {
      console.error('❌ Sessão não encontrada ou não pertence ao tenant:', error);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const status = await wahaRequest(`/api/sessions/${sessionName}/status`);
    res.json(status);
  } catch (error) {
    console.error('Erro ao obter status:', error);
    res.status(500).json({ error: 'Erro ao obter status da sessão' });
  }
});

// Obter informações "me" da sessão
router.get('/sessions/:sessionName/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    console.log('👤 GET /sessions/:sessionName/me - sessionName:', sessionName, 'user:', req.user?.email, 'tenantId:', req.tenantId);

    // SUPERADMIN pode ver informações de qualquer sessão, outros usuários só do seu tenant
    const tenantId = req.user?.role === 'SUPERADMIN' ? undefined : req.tenantId;

    // Verificar se a sessão pertence ao tenant
    try {
      await WhatsAppSessionService.getSession(sessionName, tenantId);
    } catch (error) {
      console.error('❌ Sessão não encontrada ou não pertence ao tenant:', error);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const me = await wahaRequest(`/api/sessions/${sessionName}/me`);
    res.json(me);
  } catch (error) {
    console.error('Erro ao obter informações do usuário:', error);
    res.status(500).json({ error: 'Erro ao obter informações do usuário' });
  }
});

// Associar sessão a um tenant (SUPERADMIN only)
router.patch('/sessions/:sessionName/assign-tenant', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionName } = req.params;
    const { tenantId } = req.body;

    console.log('🔧 PATCH /sessions/:sessionName/assign-tenant - sessionName:', sessionName, 'tenantId:', tenantId, 'user:', req.user?.email);

    // Apenas SUPERADMIN pode associar sessões a tenants
    if (req.user?.role !== 'SUPERADMIN') {
      return res.status(403).json({ error: 'Apenas SUPERADMIN pode associar sessões a tenants' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório' });
    }

    // Buscar sessão sem filtro de tenant (SUPERADMIN vê todas)
    const session = await WhatsAppSessionService.getSession(sessionName);

    // Atualizar sessão com o novo tenantId
    await WhatsAppSessionService.createOrUpdateSession({
      name: sessionName,
      status: session.status as any,
      provider: session.provider as 'WAHA' | 'EVOLUTION',
      me: session.me ? {
        id: session.me.id,
        pushName: session.me.pushName,
        lid: session.me.lid || undefined,
        jid: session.me.jid || undefined
      } : undefined,
      qr: session.qr || undefined,
      qrExpiresAt: session.qrExpiresAt || undefined,
      tenantId
    });

    console.log(`✅ Sessão ${sessionName} associada ao tenant ${tenantId}`);
    res.json({ success: true, message: 'Sessão associada ao tenant com sucesso' });
  } catch (error) {
    console.error('Erro ao associar sessão:', error);
    res.status(500).json({ error: 'Erro ao associar sessão ao tenant' });
  }
});

export default router;
