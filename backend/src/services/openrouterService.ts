import { tenantSettingsService } from './tenantSettingsService';

export interface OpenRouterMessage {
  model: string;
  system: string;
  user: string;
}

export interface OpenRouterResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class OpenRouterService {
  private static instance: OpenRouterService;
  private baseURL = 'https://openrouter.ai/api/v1/chat/completions';

  public static getInstance(): OpenRouterService {
    if (!OpenRouterService.instance) {
      OpenRouterService.instance = new OpenRouterService();
    }
    return OpenRouterService.instance;
  }

  async generateMessage(messageConfig: OpenRouterMessage, contactData: any = {}, tenantId?: string): Promise<OpenRouterResponse> {
    try {
      if (!tenantId) {
        return {
          success: false,
          error: 'TenantId é obrigatório para usar OpenRouter.'
        };
      }

      const tenantSettings: any = await tenantSettingsService.getTenantSettings(tenantId);

      if (!tenantSettings?.openrouterApiKey) {
        return {
          success: false,
          error: 'OpenRouter API Key não configurada para este tenant. Configure a chave em Configurações > Integrações de IA.'
        };
      }

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

      const model = (messageConfig.model || '').trim() || 'openai/gpt-4o-mini';

      console.log('🌐 Enviando requisição para OpenRouter:', { model, messagesCount: messages.length });

      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenantSettings.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://ruptur-campaign.ruptur.cloud',
          'X-Title': 'Ruptur Campaign'
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
        console.error('Erro da API OpenRouter:', response.status, errorData);

        let errorMessage = 'Erro ao gerar mensagem com OpenRouter';
        if (response.status === 401) {
          errorMessage = 'API Key do OpenRouter inválida ou não autorizada';
        } else if (response.status === 402) {
          errorMessage = 'Saldo insuficiente na conta OpenRouter';
        } else if (response.status === 429) {
          errorMessage = 'Limite de requisições do OpenRouter excedido. Tente novamente mais tarde.';
        } else {
          errorMessage = `Erro da API OpenRouter: HTTP ${response.status}`;
        }

        return { success: false, error: errorMessage };
      }

      const data: any = await response.json();

      if (data && data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
        const generatedMessage = data.choices[0].message.content.trim();
        return { success: true, message: generatedMessage };
      }

      return { success: false, error: 'Resposta inválida do OpenRouter' };
    } catch (error: any) {
      console.error('Erro ao chamar API do OpenRouter:', error);
      return {
        success: false,
        error: error?.message || 'Erro de conexão com a API do OpenRouter'
      };
    }
  }
}

export const openrouterService = OpenRouterService.getInstance();
