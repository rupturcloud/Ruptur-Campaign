import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Header } from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { PerfexSyncModal } from '../components/PerfexSyncModal';

interface Settings {
  id: string;
  openaiApiKey?: string;
  groqApiKey?: string;
  openrouterApiKey?: string;
  omnirouterApiKey?: string;
  omnirouterUrl?: string;
  chatwootUrl?: string;
  chatwootAccountId?: string;
  chatwootApiToken?: string;
  perfexUrl?: string;
  perfexToken?: string;
  uazapiUrl?: string;
  uazapiHost?: string;
  uazapiAdminToken?: string;
}

const settingsSchema = z.object({
  openaiApiKey: z.string().optional(),
  groqApiKey: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  omnirouterApiKey: z.string().optional(),
  omnirouterUrl: z.string().optional(),
  chatwootUrl: z.string().optional(),
  chatwootAccountId: z.string().optional(),
  chatwootApiToken: z.string().optional(),
  perfexUrl: z.string().optional(),
  perfexToken: z.string().optional(),
  uazapiUrl: z.string().optional(),
  uazapiAdminToken: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingUazapi, setSyncingUazapi] = useState(false);
  const [activeModal, setActiveModal] = useState<'openai' | 'groq' | 'openrouter' | 'omnirouter' | 'chatwoot' | 'perfex' | 'uazapi' | null>(null);
  const { user } = useAuth();

  // Helper para fazer requisições autenticadas
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    onErrors: (errors) => {
      console.log('🔴 Erros de validação:', errors);
    }
  });

  useEffect(() => {
    loadSettings();

    const handleTenantChange = () => {
      loadSettings();
    };

    window.addEventListener('superadmin-tenant-changed', handleTenantChange);
    return () => {
      window.removeEventListener('superadmin-tenant-changed', handleTenantChange);
    };
  }, [user]);

  const loadSettings = async () => {
    try {
      let url = '/api/settings';

      if (user?.role === 'SUPERADMIN') {
        const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
        if (selectedTenantId) {
          url = `/api/settings?tenantId=${selectedTenantId}`;
        }
      }

      const response = await authenticatedFetch(url);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setValue('openaiApiKey', data.openaiApiKey || '');
        setValue('groqApiKey', data.groqApiKey || '');
        setValue('openrouterApiKey', data.openrouterApiKey || '');
        setValue('omnirouterApiKey', data.omnirouterApiKey || '');
        setValue('omnirouterUrl', data.omnirouterUrl || 'https://api.omnirouters.com/v1');
        setValue('chatwootUrl', data.chatwootUrl || '');
        setValue('chatwootAccountId', data.chatwootAccountId || '');
        setValue('chatwootApiToken', data.chatwootApiToken || '');
        setValue('perfexUrl', data.perfexUrl || '');
        setValue('perfexToken', data.perfexToken || '');
        setValue('uazapiUrl', data.uazapiUrl || data.uazapiHost || 'https://ruptur001.uazapi.com');
        setValue('uazapiAdminToken', data.uazapiAdminToken || '');
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncUazapi = async (overrideUrl?: string, overrideToken?: string) => {
    setSyncingUazapi(true);
    try {
      const bodyPayload: any = {};
      if (overrideUrl) bodyPayload.uazapiUrl = overrideUrl;
      if (overrideToken) bodyPayload.uazapiAdminToken = overrideToken;
      if (user?.role === 'SUPERADMIN') {
        const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
        if (selectedTenantId) bodyPayload.tenantId = selectedTenantId;
      }

      const response = await authenticatedFetch('/api/waha/sessions/uazapi/sync', {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao sincronizar instâncias Uazapi');
      }
      toast.success(
        `Sincronização concluída! ${data.imported || 0} nova(s) instância(s) importada(s) e ${data.updated || 0} atualizada(s).`
      );
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao sincronizar instâncias Uazapi');
    } finally {
      setSyncingUazapi(false);
    }
  };

  const onSubmit = async (data: SettingsFormData) => {
    try {
      let requestData: any = { ...data };

      if (user?.role === 'SUPERADMIN') {
        const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
        if (selectedTenantId) {
          requestData = { ...data, tenantId: selectedTenantId };
        }
      }

      const response = await authenticatedFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(requestData),
      });

      if (response.ok) {
        toast.success('Configurações de integração salvas com sucesso');
        const wasUazapiModal = activeModal === 'uazapi';
        setActiveModal(null);
        await loadSettings();
        if (wasUazapiModal && data.uazapiAdminToken) {
          await handleSyncUazapi(data.uazapiUrl, data.uazapiAdminToken);
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao salvar configurações de integração');
      }
    } catch (error) {
      console.error('Erro ao salvar configurações de integração:', error);
      toast.error('Erro ao salvar configurações de integração');
    }
  };

  const removeIntegration = async (type: 'openai' | 'groq' | 'openrouter' | 'omnirouter' | 'chatwoot' | 'perfex' | 'uazapi') => {
    const integrationNames = {
      openai: 'OpenAI',
      groq: 'Groq',
      openrouter: 'OpenRouter',
      omnirouter: 'OmniRouter',
      chatwoot: 'Chatwoot',
      perfex: 'Perfex CRM',
      uazapi: 'Uazapi'
    };

    if (!confirm(`Tem certeza que deseja remover a integração com ${integrationNames[type]}?`)) {
      return;
    }

    try {
      let requestData: any = {};

      if (type === 'openai') {
        requestData.openaiApiKey = '';
      } else if (type === 'groq') {
        requestData.groqApiKey = '';
      } else if (type === 'openrouter') {
        requestData.openrouterApiKey = '';
      } else if (type === 'omnirouter') {
        requestData.omnirouterApiKey = '';
      } else if (type === 'chatwoot') {
        requestData.chatwootUrl = '';
        requestData.chatwootAccountId = '';
        requestData.chatwootApiToken = '';
      } else if (type === 'perfex') {
        requestData.perfexUrl = '';
        requestData.perfexToken = '';
      } else if (type === 'uazapi') {
        requestData.uazapiAdminToken = '';
      }

      if (user?.role === 'SUPERADMIN') {
        const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
        if (selectedTenantId) {
          requestData.tenantId = selectedTenantId;
        }
      }

      const response = await authenticatedFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(requestData),
      });

      if (response.ok) {
        toast.success(`Integração com ${integrationNames[type]} removida com sucesso`);
        setActiveModal(null);
        await loadSettings();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao remover integração');
      }
    } catch (error) {
      console.error('Erro ao remover integração:', error);
      toast.error('Erro ao remover integração');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Carregando configurações...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header
        title="Configurações"
        subtitle="Configure as definições do sistema"
      />

      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          {/* Integração Uazapi */}
          <div className="bg-white rounded-lg shadow p-6 mb-6 border-l-4 border-emerald-600">
            <h2 className="text-lg font-semibold mb-2 text-gray-900">
              📱 Integração Conta Uazapi (WhatsApp)
            </h2>
            <p className="text-gray-600 mb-6 text-sm">
              Configure a URL e o Admin Token da sua conta Uazapi para sincronizar e importar automaticamente todas as instâncias disponíveis para uso nas campanhas
            </p>

            <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <span className="text-emerald-700 font-semibold text-lg">📱</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Conta Uazapi API</h3>
                    <p className="text-sm text-gray-500">
                      {settings?.uazapiUrl || settings?.uazapiHost || 'https://ruptur001.uazapi.com'} — Sincronização de instâncias
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    settings?.uazapiAdminToken
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {settings?.uazapiAdminToken ? 'Configurado' : 'Não configurado'}
                  </span>
                  {settings?.uazapiAdminToken && (
                    <button
                      type="button"
                      onClick={() => handleSyncUazapi()}
                      disabled={syncingUazapi}
                      className="px-3 py-1 bg-emerald-100 text-emerald-800 text-sm font-medium rounded hover:bg-emerald-200 disabled:opacity-50"
                    >
                      {syncingUazapi ? '🔄 Sincronizando...' : '🔄 Sincronizar Instâncias'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveModal('uazapi')}
                    className="px-3 py-1 bg-emerald-700 text-white text-sm rounded hover:bg-emerald-800"
                  >
                    Configurar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-6 text-gray-900">
              🔗 Integrações de IA
            </h2>
            <p className="text-gray-600 mb-6">
              Configure as chaves de API para usar inteligência artificial nas campanhas
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* OpenAI Button */}
              <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-green-600 font-semibold">🤖</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">OpenAI</h3>
                      <p className="text-sm text-gray-500">ChatGPT, GPT-4</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      settings?.openaiApiKey
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {settings?.openaiApiKey ? 'Configurado' : 'Não configurado'}
                    </span>
                    <button
                      onClick={() => setActiveModal('openai')}
                      className="px-3 py-1 bg-gray-800 text-white text-sm rounded hover:bg-gray-900"
                    >
                      Configurar
                    </button>
                  </div>
                </div>
              </div>

              {/* Groq Button */}
              <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <span className="text-orange-600 font-semibold">⚡</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">Groq</h3>
                      <p className="text-sm text-gray-500">LLaMA, Mixtral (ultra-rápido)</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      settings?.groqApiKey
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {settings?.groqApiKey ? 'Configurado' : 'Não configurado'}
                    </span>
                    <button
                      onClick={() => setActiveModal('groq')}
                      className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
                    >
                      Configurar
                    </button>
                  </div>
                </div>
              </div>

              {/* OpenRouter Button */}
              <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <span className="text-indigo-600 font-semibold">🌐</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">OpenRouter</h3>
                      <p className="text-sm text-gray-500">Claude, Gemini, DeepSeek, GPT-4o (+300 modelos)</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      settings?.openrouterApiKey
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {settings?.openrouterApiKey ? 'Configurado' : 'Não configurado'}
                    </span>
                    <button
                      onClick={() => setActiveModal('openrouter')}
                      className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
                    >
                      Configurar
                    </button>
                  </div>
                </div>
              </div>

              {/* OmniRouter Button */}
              <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                      <span className="text-teal-600 font-semibold">🧭</span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">OmniRouter</h3>
                      <p className="text-sm text-gray-500">Roteamento inteligente multi-LLM & failover</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      settings?.omnirouterApiKey
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {settings?.omnirouterApiKey ? 'Configurado' : 'Não configurado'}
                    </span>
                    <button
                      onClick={() => setActiveModal('omnirouter')}
                      className="px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700"
                    >
                      Configurar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Integração Chatwoot */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-semibold mb-6 text-gray-900">
              💬 Integração Chatwoot
            </h2>
            <p className="text-gray-600 mb-6">
              Configure a integração com Chatwoot para sincronizar conversas
            </p>

            <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">💬</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Chatwoot</h3>
                    <p className="text-sm text-gray-500">Plataforma de atendimento ao cliente</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    settings?.chatwootUrl && settings?.chatwootAccountId && settings?.chatwootApiToken
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {settings?.chatwootUrl && settings?.chatwootAccountId && settings?.chatwootApiToken ? 'Configurado' : 'Não configurado'}
                  </span>
                  <button
                    onClick={() => setActiveModal('chatwoot')}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Configurar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Integração Perfex CRM */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-semibold mb-6 text-gray-900">
              🔧 Integração Perfex CRM
            </h2>
            <p className="text-gray-600 mb-6">
              Configure a integração com Perfex CRM para sincronizar clientes e leads
            </p>

            <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-purple-600 font-semibold">🔧</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Perfex CRM</h3>
                    <p className="text-sm text-gray-500">Sistema de gestão de clientes e projetos</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    settings?.perfexUrl && settings?.perfexToken
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {settings?.perfexUrl && settings?.perfexToken ? 'Configurado' : 'Não configurado'}
                  </span>
                  <button
                    onClick={() => setActiveModal('perfex')}
                    className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                  >
                    Configurar
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Modal Uazapi */}
      {activeModal === 'uazapi' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">📱 Configurar Conta Uazapi</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="uazapiUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  URL do Servidor Uazapi *
                </label>
                <input
                  id="uazapiUrl"
                  type="url"
                  {...register('uazapiUrl')}
                  placeholder="https://ruptur001.uazapi.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Endereço do servidor da sua conta Uazapi (ex: https://ruptur001.uazapi.com)
                </p>
              </div>

              <div>
                <label htmlFor="uazapiAdminToken" className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Token da Conta (admintoken) *
                </label>
                <input
                  id="uazapiAdminToken"
                  type="password"
                  {...register('uazapiAdminToken')}
                  placeholder="Informe o admintoken da conta Uazapi..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  O Admin Token permite listar e sincronizar automaticamente todas as instâncias criadas na sua conta Uazapi.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 text-sm"
                >
                  Cancelar
                </button>
                {settings?.uazapiAdminToken && (
                  <button
                    type="button"
                    onClick={() => removeIntegration('uazapi')}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting || syncingUazapi}
                  className="flex-1 px-4 py-2 bg-emerald-700 text-white rounded-md hover:bg-emerald-800 disabled:opacity-50 text-sm font-medium"
                >
                  {isSubmitting || syncingUazapi ? 'Salvando e Sincronizando...' : 'Salvar e Sincronizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal OpenAI */}
      {activeModal === 'openai' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">🤖 Configurar OpenAI</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="openaiApiKey" className="block text-sm font-medium text-gray-700 mb-1">
                  API Key OpenAI
                </label>
                <input
                  id="openaiApiKey"
                  type="password"
                  {...register('openaiApiKey')}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.openaiApiKey && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.openaiApiKey.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Chave API para integração com ChatGPT nas campanhas
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                {settings?.openaiApiKey && (
                  <button
                    type="button"
                    onClick={() => removeIntegration('openai')}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Groq */}
      {activeModal === 'groq' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">⚡ Configurar Groq</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="groqApiKey" className="block text-sm font-medium text-gray-700 mb-1">
                  API Key Groq
                </label>
                <input
                  id="groqApiKey"
                  type="password"
                  {...register('groqApiKey')}
                  placeholder="gsk_..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.groqApiKey && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.groqApiKey.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Chave API para integração com Groq AI nas campanhas (modelos rápidos e eficientes)
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                {settings?.groqApiKey && (
                  <button
                    type="button"
                    onClick={() => removeIntegration('groq')}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal OpenRouter */}
      {activeModal === 'openrouter' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">🌐 Configurar OpenRouter</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="openrouterApiKey" className="block text-sm font-medium text-gray-700 mb-1">
                  API Key OpenRouter *
                </label>
                <input
                  id="openrouterApiKey"
                  type="password"
                  {...register('openrouterApiKey')}
                  placeholder="sk-or-v1-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.openrouterApiKey && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.openrouterApiKey.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Acesse <strong>openrouter.ai/keys</strong> para gerar sua chave unificada para Claude, Gemini, DeepSeek, Llama e GPT.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                {settings?.openrouterApiKey && (
                  <button
                    type="button"
                    onClick={() => removeIntegration('openrouter')}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal OmniRouter */}
      {activeModal === 'omnirouter' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">🧭 Configurar OmniRouter</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="omnirouterUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  Endpoint Base URL (OmniRouter)
                </label>
                <input
                  id="omnirouterUrl"
                  type="url"
                  {...register('omnirouterUrl')}
                  placeholder="https://api.omnirouters.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Padrão oficial: <code>https://api.omnirouters.com/v1</code> (ou informe seu gateway OmniRoute/self-hosted).
                </p>
              </div>

              <div>
                <label htmlFor="omnirouterApiKey" className="block text-sm font-medium text-gray-700 mb-1">
                  API Key OmniRouter *
                </label>
                <input
                  id="omnirouterApiKey"
                  type="password"
                  {...register('omnirouterApiKey')}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {errors.omnirouterApiKey && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.omnirouterApiKey.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Chave de API para roteamento inteligente multi-LLM com fallback automático (ex: modelo <code>auto</code>).
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                {settings?.omnirouterApiKey && (
                  <button
                    type="button"
                    onClick={() => removeIntegration('omnirouter')}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chatwoot */}
      {activeModal === 'chatwoot' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">💬 Configurar Chatwoot</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="chatwootUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  URL do Chatwoot *
                </label>
                <input
                  id="chatwootUrl"
                  type="url"
                  {...register('chatwootUrl')}
                  placeholder="https://app.chatwoot.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.chatwootUrl && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.chatwootUrl.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  URL completa da sua instância Chatwoot
                </p>
              </div>

              <div>
                <label htmlFor="chatwootAccountId" className="block text-sm font-medium text-gray-700 mb-1">
                  ID da Conta *
                </label>
                <input
                  id="chatwootAccountId"
                  type="text"
                  {...register('chatwootAccountId')}
                  placeholder="123456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.chatwootAccountId && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.chatwootAccountId.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  ID numérico da sua conta no Chatwoot
                </p>
              </div>

              <div>
                <label htmlFor="chatwootApiToken" className="block text-sm font-medium text-gray-700 mb-1">
                  Token de API *
                </label>
                <input
                  id="chatwootApiToken"
                  type="password"
                  {...register('chatwootApiToken')}
                  placeholder="••••••••••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.chatwootApiToken && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.chatwootApiToken.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Token de API do seu perfil (encontrado em Configurações &gt; Perfil)
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                {settings?.chatwootUrl && settings?.chatwootAccountId && settings?.chatwootApiToken && (
                  <button
                    type="button"
                    onClick={() => removeIntegration('chatwoot')}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Perfex CRM */}
      <PerfexSyncModal
        isOpen={activeModal === 'perfex'}
        onClose={() => setActiveModal(null)}
        perfexUrl={settings?.perfexUrl || ''}
        perfexToken={settings?.perfexToken || ''}
        onSave={async (url, token) => {
          try {
            let requestData: any = {
              perfexUrl: url,
              perfexToken: token
            };

            if (user?.role === 'SUPERADMIN') {
              const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
              if (selectedTenantId) {
                requestData.tenantId = selectedTenantId;
              }
            }

            const response = await authenticatedFetch('/api/settings', {
              method: 'PUT',
              body: JSON.stringify(requestData),
            });

            if (response.ok) {
              toast.success('Integração com Perfex CRM configurada com sucesso');
              await loadSettings();
            } else {
              const errorData = await response.json();
              toast.error(errorData.error || 'Erro ao configurar Perfex CRM');
            }
          } catch (error) {
            console.error('Erro ao configurar Perfex CRM:', error);
            toast.error('Erro ao configurar Perfex CRM');
          }
        }}
      />

    </>
  );
}
