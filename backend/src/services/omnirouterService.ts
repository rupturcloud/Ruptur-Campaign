import { tenantSettingsService } from './tenantSettingsService';

export interface OmniRouterMessage {
  model: string;
  system: string;
  user: string;
}

export interface OmniRouterResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class OmniRouterService {
  private static instance: OmniRouterService;
  private defaultBaseURL = 'https://api.omnirouters.com/v1';

  public static getInstance(): OmniRouterService {
    if (!OmniRouterService.instance) {
      OmniRouterService.instance = new OmniRouterService();
    }
    return OmniRouterService.instance;
  }

  async generateMessage(messageConfig: OmniRouterMessage, contactData: any = {}, tenantId?: string): Promise<OmniRouterResponse> {
    try {
      if (!tenantId) {
        return {
          success: false,
          error: 'TenantId é obrigatório para usar OmniRouter.'
        };
      }

      const tenantSettings: any = await tenantSettingsService.getTenantSettings(tenantId);

      if (!tenantSettings?.omnirouterApiKey) {
        return {
          success: false,
          error: 'OmniRouter API Key não configurada para este tenant. Configure a chave em Configurações > Integrações de IA.'
        };
      }

      const rawBase = (tenantSettings.omnirouterUrl || this.defaultBaseURL).trim().replace(/\/+$/, '');
      const endpoint = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`;

      let userPrompt = messageConfig.user || '';
      const variables: Record<string, string> = {
        '{{nome}}': contactData.nome || '',
        '{{email}}': contactData.email || '',
        '{{telefone}}': contactData.telefone || '',
        '{{categoria}}': contactData.categoria || '',
        '{{observacoes}}': contactData.observacoes || ''
      };

      Object.entries(variables).forEach(([variable, value]) => {
        userPrompt = userPrompt.replace(new RegExp(variable, 'g'), value);
      });

      const messages: Array<{ role: string; content: string }> = [];
      if (messageConfig.system && messageConfig.system.trim()) {
        messages.push({ role: 'system', content: messageConfig.system });
      }
      messages.push({ role: 'user', content: userPrompt });

      const model = (messageConfig.model || '').trim() || 'auto';

      console.log('🧭 Enviando requisição para OmniRouter:', { endpoint, model, messagesCount: messages.length });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenantSettings.omnirouterApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Erro da API OmniRouter:', response.status, errorData);

        let errorMessage = 'Erro ao gerar mensagem com OmniRouter';
        if (response.status === 401) {
          errorMessage = 'API Key do OmniRouter inválida ou não autorizada';
        } else if (response.status === 429) {
          errorMessage = 'Limite de requisições do OmniRouter excedido. Tente novamente mais tarde.';
        } else {
          errorMessage = `Erro da API OmniRouter: HTTP ${response.status}`;
        }

        return { success: false, error: errorMessage };
      }

      const data: any = await response.json();

      if (data && data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
        const generatedMessage = data.choices[0].message.content.trim();
        return { success: true, message: generatedMessage };
      }

      return { success: false, error: 'Resposta inválida do OmniRouter' };
    } catch (error: any) {
      console.error('Erro ao chamar API do OmniRouter:', error);
      return {
        success: false,
        error: error?.message || 'Erro de conexão com a API do OmniRouter'
      };
    }
  }
}

export const omnirouterService = OmniRouterService.getInstance();
