import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Header } from '../components/Header';
import { Portal } from '../components/Portal';
import { UazapiConfig } from '../components/flow-nodes/UazapiConfig';
import { UazapiPhonePreview } from '../components/flow-nodes/UazapiPhonePreview';

type MessageContent =
  | { text: string }
  | { url: string; caption?: string }
  | { url: string; fileName?: string }
  | { sequence: Array<{ type: string; content: any }> };

interface Campaign {
  id: string;
  nome: string;
  targetTags: string[];
  sessionNames: string[];
  sessionName: string;
  messageType: string;
  messageContent: MessageContent;
  randomDelay: number;
  startImmediately: boolean;
  scheduledFor: string | null;
  status: string;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  criadoEm: string;
  session: {
    name: string;
    displayName?: string;
    status: string;
    mePushName: string | null;
  };
  _count: {
    messages: number;
  };
}

interface WhatsAppSession {
  name: string; // Nome real usado na API
  displayName?: string; // Nome exibido ao usuário
  mePushName: string | null;
  meId: string | null;
}

interface ContactTag {
  id: string;
  nome: string;
}

function compositionForPreview(item: { type: string; content: any } | undefined) {
  if (!item || item.type === 'wait') return { type: 'text', text: 'Adicione uma mensagem para ver a prévia.' };
  if (item.type === 'uazapi') return item.content?.composition || item.content || { type: 'text', text: '' };
  if (['image', 'video', 'audio', 'document'].includes(item.type)) return { type: item.type, file: item.content?.url || '', text: item.content?.caption || '' };
  return { type: 'text', text: item.content?.text || item.content?.caption || `Mensagem ${item.type}` };
}

function technicalPreview(item: { type: string; content: any }) {
  const composition = item.type === 'uazapi' ? (item.content?.composition || item.content || {}) : item.content || {};
  const kind = item.type === 'uazapi' ? composition.type : item.type;
  const route = ['button', 'list', 'poll'].includes(kind) ? '/send/menu' : kind === 'carousel' ? '/send/carousel' : ['image', 'video', 'audio', 'document'].includes(kind) ? '/send/media' : '/send/text';
  return { label: kind || 'texto', route, delay: composition.delay || 0 };
}

function numberedSequencePreview(sequence: Array<{ type: string; content: any }>) {
  let messageNumber = 0;
  return sequence.map((item, index) => ({
    item,
    index,
    messageNumber: item.type === 'wait' ? undefined : ++messageNumber,
  }));
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [currentReportCampaignId, setCurrentReportCampaignId] = useState<string | null>(null);
  const [reportCurrentPage, setReportCurrentPage] = useState(1);
  const [reportItemsPerPage] = useState(8);
  const [campaignsCurrentPage, setCampaignsCurrentPage] = useState(1);
  const [campaignsPerPage] = useState(10);
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [whatsappSessions, setWhatsappSessions] = useState<WhatsAppSession[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<{ [key: number]: boolean }>({});
  const [fileInfos, setFileInfos] = useState<{ [key: number]: { name: string, size: number, type: string } }>({});
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    nome: '',
    targetTags: [] as string[],
    manualPhones: '',
    sessionNames: [] as string[],
    sessionName: '',
    messageType: 'sequence',
    messageContent: { sequence: [{ type: 'uazapi', content: { composition: { type: 'text', text: '' } } }] as Array<{ type: string; content: any }> } as MessageContent,
    randomDelay: 30,
    startImmediately: true,
    scheduledFor: ''
  });

  useEffect(() => {
    loadCampaigns();
    loadContactTags();
    loadWhatsAppSessions();
  }, []);

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

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch('/api/campaigns');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (error) {
      console.error('Erro ao carregar campanhas:', error);
      toast.error('Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  };

  const loadContactTags = async () => {
    try {
      const response = await authenticatedFetch('/api/campaigns/tags');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const tags = await response.json();
      setContactTags(tags);
    } catch (error) {
      console.error('Erro ao carregar tags:', error);
    }
  };

  const loadWhatsAppSessions = async () => {
    try {
      const response = await authenticatedFetch('/api/campaigns/sessions');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const sessions = await response.json();
      setWhatsappSessions(sessions);
    } catch (error) {
      console.error('Erro ao carregar sessões:', error);
    }
  };

  const handleTagToggle = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      targetTags: prev.targetTags.includes(tag)
        ? prev.targetTags.filter(t => t !== tag)
        : [...prev.targetTags, tag]
    }));
  };

  const handleSessionToggle = (sessionName: string) => {
    setFormData(prev => ({
      ...prev,
      sessionNames: prev.sessionNames.includes(sessionName)
        ? prev.sessionNames.filter(s => s !== sessionName)
        : [...prev.sessionNames, sessionName]
    }));
  };

  const handleSelectAllTags = () => {
    setFormData(prev => ({
      ...prev,
      targetTags: prev.targetTags.length === contactTags.length
        ? []
        : contactTags.map(tag => tag.id)
    }));
  };

  const handleSelectAllSessions = () => {
    setFormData(prev => ({
      ...prev,
      sessionNames: prev.sessionNames.length === whatsappSessions.length
        ? []
        : whatsappSessions.map(session => session.name)
    }));
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.targetTags.length === 0 && !formData.manualPhones.trim()) {
      toast.error('Selecione uma categoria ou informe números manualmente');
      return;
    }

    if (formData.sessionNames.length === 0) {
      toast.error('Selecione pelo menos uma conexão WhatsApp');
      return;
    }

    if (!('sequence' in formData.messageContent) || formData.messageContent.sequence.length === 0) {
      toast.error('Adicione pelo menos uma mensagem à campanha');
      return;
    }

    try {
      const sequence = formData.messageContent.sequence;
      const isSequence = sequence.length > 1;

      let finalMessageType: string;
      let finalMessageContent: any;

      if (isSequence) {
        finalMessageType = 'sequence';
        finalMessageContent = { sequence };
      } else {
        const singleMessage = sequence[0];
        finalMessageType = singleMessage.type;
        finalMessageContent = singleMessage.content;
      }

      // Converter scheduledFor de datetime-local para ISO string
      let scheduledForISO = null;
      if (!formData.startImmediately && formData.scheduledFor) {
        // datetime-local retorna formato "YYYY-MM-DDTHH:mm" SEM timezone
        // Precisamos interpretar como horário LOCAL do usuário e converter para UTC
        // Exemplo: usuário escolhe 2025-10-15T19:00 em UTC-3 (Brasília)
        // Isso deve ser salvo como 2025-10-15T22:00:00.000Z (19:00 - 3 = 22:00 UTC)
        const localDateStr = formData.scheduledFor; // "2025-10-15T19:00"
        const localDate = new Date(localDateStr); // JavaScript interpreta como LOCAL
        scheduledForISO = localDate.toISOString(); // Converte para UTC com timezone
      }

      const campaignData = {
        ...formData,
        messageType: finalMessageType,
        messageContent: finalMessageContent,
        scheduledFor: scheduledForISO
      };

      const response = await authenticatedFetch(editingCampaignId ? `/api/campaigns/${editingCampaignId}` : '/api/campaigns', {
        method: editingCampaignId ? 'PUT' : 'POST',
        body: JSON.stringify(campaignData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.errors && errorData.errors.length > 0) {
          const validationErrors = errorData.errors.map((err: any) => err.msg).join(', ');
          throw new Error(validationErrors);
        } else if (errorData.error) {
          throw new Error(errorData.error);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      }

      toast.success(editingCampaignId ? 'Campanha atualizada com sucesso!' : 'Campanha criada com sucesso!');
      setShowCreateModal(false);
      setEditingCampaignId(null);
      resetForm();
      loadCampaigns();
    } catch (error) {
      console.error('Erro ao criar campanha:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar campanha');
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      targetTags: [],
      manualPhones: '',
      sessionNames: [],
      sessionName: '',
      messageType: 'sequence',
      messageContent: { sequence: [{ type: 'uazapi', content: { composition: { type: 'text', text: '' } } }] },
      randomDelay: 30,
      startImmediately: true,
      scheduledFor: ''
    });
    setUploadingFiles({});
    setFileInfos({});
    setDraggedIndex(null);
  };

  const handleEditCampaign = (campaign: Campaign) => {
    const content: any = campaign.messageContent;
    const sequence = campaign.messageType === 'sequence' ? (content.sequence || []) : [{ type: campaign.messageType, content }];
    setFormData({ nome: campaign.nome, targetTags: campaign.targetTags || [], manualPhones: '', sessionNames: campaign.sessionNames || [], sessionName: campaign.sessionName || '', messageType: 'sequence', messageContent: { sequence }, randomDelay: campaign.randomDelay, startImmediately: campaign.startImmediately, scheduledFor: campaign.scheduledFor ? campaign.scheduledFor.slice(0, 16) : '' });
    setEditingCampaignId(campaign.id);
    setShowCreateModal(true);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
    const newSequence = [...currentSequence];
    const [draggedItem] = newSequence.splice(draggedIndex, 1);
    newSequence.splice(dropIndex, 0, draggedItem);

    setFormData(prev => ({
      ...prev,
      messageContent: { sequence: newSequence }
    }));
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleFileUpload = async (file: File, messageIndex: number, variationIndex?: number) => {
    const uploadKey = variationIndex !== undefined ? `${messageIndex}-${variationIndex}` : messageIndex.toString();
    setUploadingFiles(prev => ({ ...prev, [uploadKey]: true }));

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: uploadFormData,
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo');
      }

      const data = await response.json();

      // Armazenar informações do arquivo
      if (variationIndex !== undefined) {
        setFileInfos(prev => ({
          ...prev,
          [`${messageIndex}-${variationIndex}`]: {
            name: data.originalName,
            size: data.size,
            type: data.mimetype
          }
        }));
      } else {
        setFileInfos(prev => ({
          ...prev,
          [messageIndex]: {
            name: data.originalName,
            size: data.size,
            type: data.mimetype
          }
        }));
      }

      const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];

      if (variationIndex !== undefined) {
        // Upload para variação
        const newSequence = currentSequence.map((seqItem, i) => {
          if (i === messageIndex) {
            const mediaVariations = [...(seqItem.content.mediaVariations || [])];
            // Garantir que o array tenha o tamanho necessário
            while (mediaVariations.length <= variationIndex) {
              mediaVariations.push({ url: '', caption: '', fileName: '' });
            }
            mediaVariations[variationIndex] = {
              ...mediaVariations[variationIndex],
              url: data.fileUrl,
              fileName: data.originalName
            };
            return {
              ...seqItem,
              content: { ...seqItem.content, mediaVariations }
            };
          }
          return seqItem;
        });

        setFormData(prev => ({
          ...prev,
          messageContent: { sequence: newSequence }
        }));
      } else {
        // Upload para modo single
        const newSequence = currentSequence.map((seqItem, i) =>
          i === messageIndex ? {
            ...seqItem,
            content: { ...seqItem.content, url: data.fileUrl }
          } : seqItem
        );

        setFormData(prev => ({
          ...prev,
          messageContent: { sequence: newSequence }
        }));
      }

      toast.success('Arquivo carregado com sucesso!');
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao fazer upload do arquivo');
    } finally {
      setUploadingFiles(prev => ({ ...prev, [uploadKey]: false }));
    }
  };

  const handleRemoveFile = (messageIndex: number) => {
    const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
    const newSequence = currentSequence.map((seqItem, i) =>
      i === messageIndex ? {
        ...seqItem,
        content: { ...seqItem.content, url: '' }
      } : seqItem
    );

    setFormData(prev => ({
      ...prev,
      messageContent: { sequence: newSequence }
    }));

    setFileInfos(prev => {
      const updated = { ...prev };
      delete updated[messageIndex];
      return updated;
    });

    toast.success('Arquivo removido');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    return '📄';
  };

  const handleToggleCampaign = async (campaignId: string, action: 'pause' | 'resume') => {
    try {
      const response = await authenticatedFetch(`/api/campaigns/${campaignId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      toast.success(`Campanha ${action === 'pause' ? 'pausada' : 'retomada'} com sucesso!`);
      loadCampaigns();
    } catch (error) {
      console.error('Erro ao alterar status da campanha:', error);
      toast.error('Erro ao alterar status da campanha');
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      toast.success('Campanha excluída com sucesso!');
      loadCampaigns();
    } catch (error) {
      console.error('Erro ao excluir campanha:', error);
      toast.error('Erro ao excluir campanha');
    }
  };

  const handleViewReport = async (campaignId: string) => {
    setCurrentReportCampaignId(campaignId);
    setReportCurrentPage(1);
    setReportLoading(true);
    setShowReportModal(true);

    try {
      const response = await authenticatedFetch(`/api/campaigns/${campaignId}/report`);

      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao carregar relatório');
        setShowReportModal(false);
      }
    } catch (error) {
      console.error('Erro ao buscar relatório:', error);
      toast.error('Erro ao carregar relatório');
      setShowReportModal(false);
    } finally {
      setReportLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-gray-100 text-gray-800';
      case 'RUNNING':
        return 'bg-blue-100 text-blue-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'PAUSED':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Aguardando';
      case 'RUNNING':
        return 'Executando';
      case 'COMPLETED':
        return 'Concluída';
      case 'PAUSED':
        return 'Pausada';
      case 'FAILED':
        return 'Falha';
      default:
        return status;
    }
  };

  const handleRefreshReport = async () => {
    if (!currentReportCampaignId) return;

    setReportLoading(true);
    try {
      const response = await authenticatedFetch(`/api/campaigns/${currentReportCampaignId}/report`);

      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao carregar relatório');
      }
    } catch (error) {
      console.error('Erro ao buscar relatório:', error);
      toast.error('Erro ao carregar relatório');
    } finally {
      setReportLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!currentReportCampaignId || !reportData) return;

    try {
      const response = await authenticatedFetch(`/api/campaigns/${currentReportCampaignId}/report/download`);

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `relatorio-campanha-${reportData.campaign.nome}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Relatório baixado com sucesso!');
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao baixar relatório');
      }
    } catch (error) {
      console.error('Erro ao baixar relatório:', error);
      toast.error('Erro ao baixar relatório');
    }
  };

  const getErrorIcon = (errorMessage: string) => {
    if (!errorMessage || errorMessage === 'N/A') return null;

    const error = errorMessage.toLowerCase();

    if (error.includes('network') || error.includes('connection') || error.includes('timeout')) {
      return {
        icon: '🌐',
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        category: 'Conectividade'
      };
    }

    if (error.includes('blocked') || error.includes('banned') || error.includes('spam')) {
      return {
        icon: '🚫',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        category: 'Bloqueio'
      };
    }

    if (error.includes('rate limit') || error.includes('quota') || error.includes('limit')) {
      return {
        icon: '⏰',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        category: 'Rate Limit'
      };
    }

    if (error.includes('invalid') || error.includes('not found') || error.includes('number')) {
      return {
        icon: '📱',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        category: 'Número Inválido'
      };
    }

    if (error.includes('permission') || error.includes('unauthorized') || error.includes('forbidden')) {
      return {
        icon: '🔒',
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        category: 'Permissão'
      };
    }

    if (error.includes('session') || error.includes('disconnected') || error.includes('logout')) {
      return {
        icon: '📲',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-100',
        category: 'Sessão'
      };
    }

    if (error.includes('media') || error.includes('file') || error.includes('download')) {
      return {
        icon: '📁',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        category: 'Mídia'
      };
    }

    // Erro genérico
    return {
      icon: '⚠️',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      category: 'Erro Geral'
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Carregando campanhas...</span>
      </div>
    );
  }

  return (
    <>
      <Header
        title="Campanhas"
        subtitle={`${campaigns.length} campanhas ativas`}
        actions={
          <button
            onClick={() => { setEditingCampaignId(null); resetForm(); setShowCreateModal(true); }}
            className="btn-primary"
          >
            + Nova Campanha
          </button>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Campanhas Criadas</h3>
          </div>

          {campaigns.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              Nenhuma campanha encontrada. Crie sua primeira campanha para começar.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="px-4 sm:px-6 py-3 flex items-center">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
                    {/* Nome e Status */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-gray-900 truncate">{campaign.nome}</h4>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                        {getStatusText(campaign.status)}
                      </span>
                    </div>

                    {/* Informações essenciais */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Contatos:</span>
                        <span>{campaign.totalContacts}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Enviados:</span>
                        <span>{campaign.sentCount}/{campaign.totalContacts}</span>
                      </div>

                      {/* Sessões ativas (apenas ícones) */}
                      {campaign.sessionNames && campaign.sessionNames.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Sessões:</span>
                          <div className="flex gap-1">
                            {campaign.sessionNames.slice(0, 3).map((sessionName, index) => (
                              <span key={index} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                                {sessionName.substring(0, 3)}
                              </span>
                            ))}
                            {campaign.sessionNames.length > 3 && (
                              <span className="text-xs text-gray-500">+{campaign.sessionNames.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Botões de ação */}
                    <div className="flex gap-1 self-end sm:self-auto sm:ml-4">
                      <button
                        onClick={() => handleViewReport(campaign.id)}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        title="Ver relatório da campanha"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                        </svg>
                      </button>
                      {campaign.status !== 'RUNNING' && (
                        <button onClick={() => handleEditCampaign(campaign)} className="px-2 py-1 bg-slate-600 text-white text-xs rounded hover:bg-slate-700" title="Editar campanha">✎</button>
                      )}
                      {campaign.status === 'RUNNING' && (
                        <button
                          onClick={() => handleToggleCampaign(campaign.id, 'pause')}
                          className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                          title="Pausar campanha"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                      {campaign.status === 'PAUSED' && (
                        <button
                          onClick={() => handleToggleCampaign(campaign.id, 'resume')}
                          className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          title="Retomar campanha"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                      {campaign.status !== 'RUNNING' && (
                        <button
                          onClick={() => handleDeleteCampaign(campaign.id)}
                          className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                          title="Excluir campanha"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal de Criação */}
        {showCreateModal && (
          <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ zIndex: 9999 }}>
            <div className="bg-white rounded-lg shadow-xl max-w-[1600px] w-full max-h-[95vh] overflow-x-hidden overflow-y-auto">
              <div className="flex justify-between items-start gap-3 p-4 sm:p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{editingCampaignId ? 'Editar Campanha' : 'Nova Campanha'}</h3>
                  <p className="text-sm text-gray-600 mt-1">Configure sua campanha de mensagens WhatsApp</p>
                </div>
                <button
                  onClick={() => { setShowCreateModal(false); setEditingCampaignId(null); resetForm(); }}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreateCampaign} className="p-4 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(280px,.8fr)_minmax(420px,1.2fr)_296px] gap-5 sm:gap-8">

                  {/* COLUNA ESQUERDA - Informações Básicas */}
                  <div className="space-y-6">
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <h4 className="text-lg font-semibold text-blue-900 mb-2">Informações Básicas</h4>
                      <p className="text-sm text-blue-700">Configure os dados fundamentais da sua campanha</p>
                    </div>

                    {/* Nome da Campanha */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nome da Campanha *
                      </label>
                      <input
                        type="text"
                        value={formData.nome}
                        onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: Promoção Black Friday 2024"
                        required
                      />
                    </div>

                    {/* Categorias de Contatos */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Categorias de Contatos *
                        </label>
                        {contactTags.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSelectAllTags}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                          >
                            {formData.targetTags.length === contactTags.length ? 'Desmarcar todas' : 'Selecionar todas'}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-3">Selecione quais categorias de contatos receberão a campanha</p>
                      <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-3 bg-gray-50">
                        {contactTags.map((tag) => (
                          <label key={tag.id} className="flex items-center space-x-2 mb-2 p-2 rounded hover:bg-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.targetTags.includes(tag.id)}
                              onChange={() => handleTagToggle(tag.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 font-medium">{tag.nome}</span>
                          </label>
                        ))}
                        {contactTags.length === 0 && (
                          <p className="text-sm text-gray-500 text-center py-4">Nenhuma categoria disponível</p>
                        )}
                      </div>
                      {formData.targetTags.length > 0 && (
                        <p className="text-xs text-green-600 mt-2">✅ {formData.targetTags.length} categoria(s) selecionada(s)</p>
                      )}
                    </div>

                    {/* Leads adicionados manualmente */}
                    <div>
                      <label htmlFor="manual-phones" className="block text-sm font-medium text-gray-700 mb-2">
                        Leads manuais (opcional)
                      </label>
                      <textarea
                        id="manual-phones"
                        value={formData.manualPhones}
                        onChange={(e) => setFormData(prev => ({ ...prev, manualPhones: e.target.value }))}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        placeholder={'5511999999999\n5511988888888, 5511977777777'}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Informe um número por linha ou separe por vírgula, ponto e vírgula ou espaços. Use DDI e somente números (ex.: 5511999999999). Os números serão adicionados aos contatos desta campanha.
                      </p>
                    </div>

                    {/* Conexões WhatsApp */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Conexões WhatsApp * ({formData.sessionNames.length} selecionadas)
                        </label>
                        {whatsappSessions.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSelectAllSessions}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                          >
                            {formData.sessionNames.length === whatsappSessions.length ? 'Desmarcar todas' : 'Selecionar todas'}
                          </button>
                        )}
                      </div>
                      <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start">
                          <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <h4 className="text-sm font-medium text-green-800">Multi-Sessão com Failover</h4>
                            <p className="text-sm text-green-700 mt-1">
                              Sistema inteligente que distribui envios entre múltiplas conexões com redundância automática.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-3 bg-gray-50">
                        {whatsappSessions.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">Nenhuma conexão WhatsApp disponível</p>
                        ) : (
                          whatsappSessions.map((session) => (
                            <label key={session.name} className="flex items-center justify-between space-x-2 mb-2 p-2 rounded hover:bg-white cursor-pointer">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={formData.sessionNames.includes(session.name)}
                                  onChange={() => handleSessionToggle(session.name)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                  <span className="text-sm font-medium text-gray-700">
                                    {session.mePushName || session.displayName || session.name}
                                  </span>
                                  <span className="text-xs text-gray-500 block">({session.displayName || session.name})</span>
                                </div>
                              </div>
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                                Ativa
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                      {formData.sessionNames.length > 0 && (
                        <p className="text-xs text-green-600 mt-2">✅ {formData.sessionNames.length} conexão(ões) selecionada(s)</p>
                      )}
                    </div>

                    {/* Configuração de Envio */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tempo de Randomização (segundos)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="300"
                        value={formData.randomDelay}
                        onChange={(e) => setFormData(prev => ({ ...prev, randomDelay: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        ⏱️ Intervalo aleatório entre envios (0-{formData.randomDelay}s) para evitar bloqueios
                      </p>
                    </div>

                    {/* Data de Envio */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quando Enviar
                      </label>
                      <div className="space-y-3">
                        <label className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="radio"
                            checked={formData.startImmediately}
                            onChange={() => setFormData(prev => ({ ...prev, startImmediately: true }))}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-700">🚀 Iniciar imediatamente</span>
                            <p className="text-xs text-gray-500">A campanha será executada assim que for criada</p>
                          </div>
                        </label>
                        <label className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="radio"
                            checked={!formData.startImmediately}
                            onChange={() => setFormData(prev => ({ ...prev, startImmediately: false }))}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-700">📅 Agendar para:</span>
                            <p className="text-xs text-gray-500">Escolha data e hora específicas</p>
                          </div>
                        </label>
                        {!formData.startImmediately && (
                          <input
                            type="datetime-local"
                            value={formData.scheduledFor}
                            onChange={(e) => setFormData(prev => ({ ...prev, scheduledFor: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ml-6"
                            required={!formData.startImmediately}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* COLUNA DIREITA - Mensagens */}
                  <div className="space-y-6">
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                      <h4 className="text-lg font-semibold text-purple-900 mb-2">💬 Mensagens da Campanha</h4>
                      <p className="text-sm text-purple-700">Composição Uazapi é o padrão. A prévia permanece visível durante toda a edição.</p>
                    </div>

                    <div>
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start">
                          <svg className="h-5 w-5 text-blue-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <h4 className="text-sm font-medium text-blue-800">💡 Variáveis Dinâmicas</h4>
                            <p className="text-sm text-blue-700 mt-1">
                              Personalize suas mensagens com:
                              <span className="block mt-1">
                                <code className="bg-blue-100 px-1 rounded mx-1">{'{{nome}}'}</code>
                                <code className="bg-blue-100 px-1 rounded mx-1">{'{{telefone}}'}</code>
                                <code className="bg-blue-100 px-1 rounded mx-1">{'{{email}}'}</code>
                                <code className="bg-blue-100 px-1 rounded mx-1">{'{{categoria}}'}</code>
                                <code className="bg-blue-100 px-1 rounded mx-1">{'{{observacoes}}'}</code>
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-gray-600">Adicione uma ou mais mensagens para serem enviadas em sequência</p>
                          <button
                            type="button"
                            onClick={() => {
                              const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                              const newSequence = [...currentSequence, { type: 'uazapi', content: { composition: { type: 'text', text: '' } } }];
                              setFormData(prev => ({
                                ...prev,
                                messageContent: { sequence: newSequence }
                              }));
                            }}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 flex items-center gap-2"
                          >
                            Nova mensagem
                          </button>
                        </div>

                        <div className="space-y-3">
                          {('sequence' in formData.messageContent) && formData.messageContent.sequence.map((item, index) => (
                            <div
                              key={index}
                              draggable
                              onDragStart={() => handleDragStart(index)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDrop={(e) => handleDrop(e, index)}
                              onDragEnd={handleDragEnd}
                              className={`border rounded-lg p-4 transition-all cursor-move ${
                                draggedIndex === index
                                  ? 'border-blue-500 bg-blue-50 opacity-50'
                                  : draggedIndex !== null
                                  ? 'border-gray-300 bg-gray-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-400 cursor-move text-xl">⋮⋮</span>
                                  <span className="text-sm font-medium text-gray-600">Mensagem {index + 1}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                    const newSequence = currentSequence.filter((_, i) => i !== index);
                                    setFormData(prev => ({
                                      ...prev,
                                      messageContent: { sequence: newSequence }
                                    }));
                                  }}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  Remover
                                </button>
                              </div>

                              <div className="space-y-3">
                                <select
                                  value={item.type}
                                  onChange={(e) => {
                                    const newType = e.target.value;
                                    let newContent;
                                    switch (newType) {
                                      case 'uazapi':
                                        newContent = { composition: { type: 'text', text: '' } };
                                        break;
                                      case 'text':
                                        newContent = { text: '' };
                                        break;
                                      case 'document':
                                        newContent = { url: '', fileName: '' };
                                        break;
                                      case 'openai':
                                        newContent = { model: '', system: '', user: '' };
                                        break;
                                      case 'groq':
                                        newContent = { model: '', system: '', user: '' };
                                        break;
                                      case 'wait':
                                        newContent = { waitTime: 30 };
                                        break;
                                      default:
                                        newContent = { url: '', caption: '' };
                                        break;
                                    }

                                    const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                    const newSequence = currentSequence.map((seqItem, i) =>
                                      i === index ? { type: newType, content: newContent } : seqItem
                                    );
                                    setFormData(prev => ({
                                      ...prev,
                                      messageContent: { sequence: newSequence }
                                    }));
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="uazapi">🧩 Uazapi — composição completa (padrão)</option>
                                  <option value="text">💬 Texto legado</option>
                                  <option value="image">🖼️ Imagem</option>
                                  <option value="video">🎬 Vídeo</option>
                                  <option value="audio">🎵 Áudio</option>
                                  <option value="document">📄 Arquivo</option>
                                  <option value="uazapi">🧩 Uazapi — composição completa</option>
                                  <option value="openai">🤖 OpenAI</option>
                                  <option value="groq">⚡ Groq AI</option>
                                  <option value="wait">⏱️ Espera</option>
                                </select>

                                {item.type === 'uazapi' && (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                                    <div className="mb-3"><strong className="text-sm text-emerald-900">Composição Uazapi experimental</strong><p className="text-xs text-emerald-800">Os campos abaixo são enviados como payload estruturado pela rota documentada da Uazapi. Use somente em conexões Uazapi.</p></div>
                                    <UazapiConfig value={item.content.composition || item.content} showPreview={false} onChange={(composition) => {
                                      const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                      const newSequence = currentSequence.map((seqItem, i) => i === index ? { ...seqItem, content: { ...seqItem.content, composition } } : seqItem);
                                      setFormData(prev => ({ ...prev, messageContent: { sequence: newSequence } }));
                                    }} />
                                  </div>
                                )}

                                {item.type === 'text' && (
                                  <div className="space-y-2">
                                    {/* Checkbox para usar variações */}
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id={`useVariations-${index}`}
                                        checked={item.content.useVariations || false}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: {
                                                ...seqItem.content,
                                                useVariations: e.target.checked,
                                                variations: e.target.checked ? [''] : undefined,
                                                text: e.target.checked ? undefined : seqItem.content.text
                                              }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="rounded text-blue-600 focus:ring-blue-500"
                                      />
                                      <label htmlFor={`useVariations-${index}`} className="text-sm font-medium text-gray-700">
                                        Usar variações de texto
                                      </label>
                                    </div>

                                    {item.content.useVariations ? (
                                      /* Modo variações */
                                      <div className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">
                                          Variações de texto
                                        </label>
                                        {(item.content.variations || ['']).map((variation: string, varIndex: number) => (
                                          <div key={varIndex} className="flex gap-2">
                                            <div className="flex-1">
                                              <textarea
                                                placeholder={`Variação ${varIndex + 1}... Use variáveis como {{nome}}, {{email}}, {{telefone}}, {{categoria}}, {{observacoes}}`}
                                                value={variation}
                                                onChange={(e) => {
                                                  const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                  const newSequence = currentSequence.map((seqItem, i) => {
                                                    if (i === index) {
                                                      const newVariations = [...(seqItem.content.variations || [])];
                                                      newVariations[varIndex] = e.target.value;
                                                      return {
                                                        ...seqItem,
                                                        content: { ...seqItem.content, variations: newVariations }
                                                      };
                                                    }
                                                    return seqItem;
                                                  });
                                                  setFormData(prev => ({
                                                    ...prev,
                                                    messageContent: { sequence: newSequence }
                                                  }));
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                rows={2}
                                              />
                                            </div>
                                            {(item.content.variations || []).length > 1 && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                  const newSequence = currentSequence.map((seqItem, i) => {
                                                    if (i === index) {
                                                      const newVariations = [...(seqItem.content.variations || [])];
                                                      newVariations.splice(varIndex, 1);
                                                      return {
                                                        ...seqItem,
                                                        content: { ...seqItem.content, variations: newVariations }
                                                      };
                                                    }
                                                    return seqItem;
                                                  });
                                                  setFormData(prev => ({
                                                    ...prev,
                                                    messageContent: { sequence: newSequence }
                                                  }));
                                                }}
                                                className="px-2 py-1 text-red-600 hover:text-red-800"
                                                title="Remover variação"
                                              >
                                                ✕
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                            const newSequence = currentSequence.map((seqItem, i) => {
                                              if (i === index) {
                                                const newVariations = [...(seqItem.content.variations || []), ''];
                                                return {
                                                  ...seqItem,
                                                  content: { ...seqItem.content, variations: newVariations }
                                                };
                                              }
                                              return seqItem;
                                            });
                                            setFormData(prev => ({
                                              ...prev,
                                              messageContent: { sequence: newSequence }
                                            }));
                                          }}
                                          className="px-3 py-1 bg-blue-100 text-blue-600 text-sm rounded hover:bg-blue-200 flex items-center gap-1"
                                        >
                                          <span>+</span>
                                          Nova variação
                                        </button>
                                      </div>
                                    ) : (
                                      /* Modo texto único */
                                      <div>
                                        <textarea
                                          placeholder="Digite sua mensagem... Use variáveis como {{nome}}, {{email}}, {{telefone}}, {{categoria}}, {{observacoes}}"
                                          value={item.content.text || ''}
                                          onChange={(e) => {
                                            const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                            const newSequence = currentSequence.map((seqItem, i) =>
                                              i === index ? { ...seqItem, content: { text: e.target.value } } : seqItem
                                            );
                                            setFormData(prev => ({
                                              ...prev,
                                              messageContent: { sequence: newSequence }
                                            }));
                                          }}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          rows={3}
                                        />
                                      </div>
                                    )}

                                    <div className="flex flex-wrap gap-1">
                                      <span className="text-xs text-gray-500">Variáveis disponíveis:</span>
                                      {['{{nome}}', '{{email}}', '{{telefone}}', '{{categoria}}', '{{observacoes}}'].map((variable) => (
                                        <button
                                          key={variable}
                                          type="button"
                                          onClick={() => {
                                            const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                            if (item.content.useVariations) {
                                              // Adicionar à primeira variação vazia ou criar nova
                                              const variations = item.content.variations || [''];
                                              let targetIndex = variations.findIndex(v => !v.trim());
                                              if (targetIndex === -1) targetIndex = 0;

                                              const newSequence = currentSequence.map((seqItem, i) => {
                                                if (i === index) {
                                                  const newVariations = [...variations];
                                                  newVariations[targetIndex] = (newVariations[targetIndex] || '') + variable;
                                                  return {
                                                    ...seqItem,
                                                    content: { ...seqItem.content, variations: newVariations }
                                                  };
                                                }
                                                return seqItem;
                                              });
                                              setFormData(prev => ({
                                                ...prev,
                                                messageContent: { sequence: newSequence }
                                              }));
                                            } else {
                                              // Adicionar ao texto único
                                              const currentText = currentSequence[index]?.content?.text || '';
                                              const newSequence = currentSequence.map((seqItem, i) =>
                                                i === index ? { ...seqItem, content: { text: currentText + variable } } : seqItem
                                              );
                                              setFormData(prev => ({
                                                ...prev,
                                                messageContent: { sequence: newSequence }
                                              }));
                                            }
                                          }}
                                          className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200"
                                        >
                                          {variable}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {item.type === 'openai' && (
                                  <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-blue-600 font-medium">🤖 OpenAI</span>
                                      </div>
                                      <p className="text-sm text-blue-600">
                                        Configure os parâmetros para gerar mensagens personalizadas usando inteligência artificial
                                      </p>
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Modelo *
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Digite o modelo da OpenAI (ex: gpt-3.5-turbo)"
                                        value={item.content.model || ''}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: { ...seqItem.content, model: e.target.value }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      <div className="mt-2">
                                        <p className="text-xs text-gray-500 mb-1">Modelos sugeridos:</p>
                                        <div className="flex flex-wrap gap-1">
                                          {['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'].map((model) => (
                                            <button
                                              key={model}
                                              type="button"
                                              onClick={() => {
                                                const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                const newSequence = currentSequence.map((seqItem, i) =>
                                                  i === index ? {
                                                    ...seqItem,
                                                    content: { ...seqItem.content, model: model }
                                                  } : seqItem
                                                );
                                                setFormData(prev => ({
                                                  ...prev,
                                                  messageContent: { sequence: newSequence }
                                                }));
                                              }}
                                              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 border border-gray-300"
                                            >
                                              {model}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Prompt do Sistema *
                                      </label>
                                      <textarea
                                        placeholder="Ex: Você é um assistente virtual especializado em vendas. Responda de forma profissional e persuasiva..."
                                        value={item.content.system || ''}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: { ...seqItem.content, system: e.target.value }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        rows={3}
                                      />
                                      <p className="text-xs text-gray-500 mt-1">
                                        Define como a IA deve se comportar e responder
                                      </p>
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Prompt do Usuário *
                                      </label>
                                      <textarea
                                        placeholder="Ex: Crie uma mensagem de vendas personalizada para {{nome}}, que tem interesse em {{categoria}}. Use variáveis como {{nome}}, {{email}}, {{telefone}}, {{categoria}}, {{observacoes}}"
                                        value={item.content.user || ''}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: { ...seqItem.content, user: e.target.value }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        rows={4}
                                      />
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        <span className="text-xs text-gray-500">Variáveis disponíveis:</span>
                                        {['{{nome}}', '{{email}}', '{{telefone}}', '{{categoria}}', '{{observacoes}}'].map((variable) => (
                                          <button
                                            key={variable}
                                            type="button"
                                            onClick={() => {
                                              const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                              const currentUser = currentSequence[index]?.content?.user || '';
                                              const newSequence = currentSequence.map((seqItem, i) =>
                                                i === index ? {
                                                  ...seqItem,
                                                  content: { ...seqItem.content, user: currentUser + variable }
                                                } : seqItem
                                              );
                                              setFormData(prev => ({
                                                ...prev,
                                                messageContent: { sequence: newSequence }
                                              }));
                                            }}
                                            className="px-2 py-1 bg-green-100 text-green-600 text-xs rounded hover:bg-green-200"
                                          >
                                            {variable}
                                          </button>
                                        ))}
                                      </div>
                                      <p className="text-xs text-gray-500 mt-1">
                                        A IA usará este prompt junto com os dados do contato para gerar a mensagem
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.type === 'groq' && (
                                  <div className="space-y-4">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-yellow-600 font-medium">⚡ Groq AI</span>
                                      </div>
                                      <p className="text-sm text-yellow-600">
                                        Configure os parâmetros para gerar mensagens personalizadas usando Groq AI com velocidade ultra-rápida
                                      </p>
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Modelo *
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Digite o modelo do Groq (ex: llama-3.1-8b-instant)"
                                        value={item.content.model || ''}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: { ...seqItem.content, model: e.target.value }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                      <div className="mt-2">
                                        <p className="text-xs text-gray-500 mb-1">Modelos sugeridos:</p>
                                        <div className="flex flex-wrap gap-1">
                                          {['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'llama-3.2-11b-text-preview', 'mixtral-8x7b-32768', 'gemma2-9b-it'].map((model) => (
                                            <button
                                              key={model}
                                              type="button"
                                              onClick={() => {
                                                const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                const newSequence = currentSequence.map((seqItem, i) =>
                                                  i === index ? {
                                                    ...seqItem,
                                                    content: { ...seqItem.content, model: model }
                                                  } : seqItem
                                                );
                                                setFormData(prev => ({
                                                  ...prev,
                                                  messageContent: { sequence: newSequence }
                                                }));
                                              }}
                                              className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded hover:bg-yellow-200 border border-yellow-300"
                                            >
                                              {model}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Prompt do Sistema *
                                      </label>
                                      <textarea
                                        placeholder="Ex: Você é um assistente virtual especializado em vendas. Responda de forma profissional e persuasiva..."
                                        value={item.content.system || ''}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: { ...seqItem.content, system: e.target.value }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        rows={3}
                                      />
                                      <p className="text-xs text-gray-500 mt-1">
                                        Define como a IA deve se comportar e responder
                                      </p>
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Prompt do Usuário *
                                      </label>
                                      <textarea
                                        placeholder="Ex: Crie uma mensagem de vendas personalizada para {{nome}}, que tem interesse em {{categoria}}. Use variáveis como {{nome}}, {{email}}, {{telefone}}, {{categoria}}, {{observacoes}}"
                                        value={item.content.user || ''}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: { ...seqItem.content, user: e.target.value }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        rows={4}
                                      />
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        <span className="text-xs text-gray-500">Variáveis disponíveis:</span>
                                        {['{{nome}}', '{{email}}', '{{telefone}}', '{{categoria}}', '{{observacoes}}'].map((variable) => (
                                          <button
                                            key={variable}
                                            type="button"
                                            onClick={() => {
                                              const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                              const currentUser = currentSequence[index]?.content?.user || '';
                                              const newSequence = currentSequence.map((seqItem, i) =>
                                                i === index ? {
                                                  ...seqItem,
                                                  content: { ...seqItem.content, user: currentUser + variable }
                                                } : seqItem
                                              );
                                              setFormData(prev => ({
                                                ...prev,
                                                messageContent: { sequence: newSequence }
                                              }));
                                            }}
                                            className="px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded hover:bg-orange-200"
                                          >
                                            {variable}
                                          </button>
                                        ))}
                                      </div>
                                      <p className="text-xs text-gray-500 mt-1">
                                        A IA usará este prompt junto com os dados do contato para gerar a mensagem
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {['image', 'video', 'audio', 'document'].includes(item.type) && (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <label className="block text-sm font-medium text-gray-700">
                                        Arquivo
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={item.content.useMediaVariations || false}
                                          onChange={(e) => {
                                            const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                            const newSequence = currentSequence.map((seqItem, i) => {
                                              if (i === index) {
                                                return {
                                                  ...seqItem,
                                                  content: {
                                                    ...seqItem.content,
                                                    useMediaVariations: e.target.checked,
                                                    mediaVariations: e.target.checked ? Array.from({ length: 4 }, () => ({ url: '', caption: '', fileName: '' })) : undefined,
                                                    // Limpar URL principal quando ativar variações
                                                    url: e.target.checked ? '' : seqItem.content.url
                                                  }
                                                };
                                              }
                                              return seqItem;
                                            });
                                            setFormData(prev => ({
                                              ...prev,
                                              messageContent: { sequence: newSequence }
                                            }));
                                          }}
                                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-600">Usar Variações</span>
                                      </label>
                                    </div>

                                    {item.content.useMediaVariations ? (
                                      // Grid horizontal de 4 variações
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {Array.from({ length: 4 }, (_, varIndex) => {
                                          const mediaVariations = item.content.mediaVariations || [];
                                          const variation = mediaVariations[varIndex] || { url: '', caption: '', fileName: '' };
                                          const hasFile = variation.url;

                                          return (
                                            <div key={varIndex} className="space-y-2">
                                              {/* Header da variação */}
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-gray-600">
                                                  {varIndex === 0 ? 'Principal' : `Var. ${varIndex + 1}`}
                                                </span>
                                                {hasFile && varIndex > 0 && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                      const newSequence = currentSequence.map((seqItem, i) => {
                                                        if (i === index) {
                                                          const newVariations = [...(seqItem.content.mediaVariations || [])];
                                                          newVariations[varIndex] = { url: '', caption: '', fileName: '' };
                                                          return {
                                                            ...seqItem,
                                                            content: { ...seqItem.content, mediaVariations: newVariations }
                                                          };
                                                        }
                                                        return seqItem;
                                                      });
                                                      setFormData(prev => ({
                                                        ...prev,
                                                        messageContent: { sequence: newSequence }
                                                      }));
                                                    }}
                                                    className="text-red-500 hover:text-red-700 text-xs p-0.5"
                                                    title="Remover"
                                                  >
                                                    ✕
                                                  </button>
                                                )}
                                              </div>

                                              {/* Preview quadrado */}
                                              <div className="aspect-square border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                                                {!hasFile ? (
                                                  <>
                                                    <input
                                                      type="file"
                                                      id={`file-upload-${index}-${varIndex}`}
                                                      className="hidden"
                                                      accept={
                                                        item.type === 'image' ? 'image/*' :
                                                        item.type === 'video' ? 'video/*' :
                                                        item.type === 'audio' ? 'audio/*' :
                                                        'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/zip'
                                                      }
                                                      onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                          handleFileUpload(file, index, varIndex);
                                                        }
                                                      }}
                                                      disabled={uploadingFiles[`${index}-${varIndex}`]}
                                                    />
                                                    <label
                                                      htmlFor={`file-upload-${index}-${varIndex}`}
                                                      className={`w-full h-full flex flex-col items-center justify-center cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50 ${
                                                        uploadingFiles[`${index}-${varIndex}`]
                                                          ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                                                          : 'text-gray-500 hover:text-blue-600'
                                                      }`}
                                                    >
                                                      {uploadingFiles[`${index}-${varIndex}`] ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                                          <span className="text-xs">Enviando</span>
                                                        </div>
                                                      ) : (
                                                        <div className="flex flex-col items-center gap-1">
                                                          <div className="text-2xl">
                                                            {item.type === 'image' && '🖼️'}
                                                            {item.type === 'video' && '🎥'}
                                                            {item.type === 'audio' && '🎵'}
                                                            {item.type === 'document' && '📄'}
                                                          </div>
                                                          <span className="text-xs text-center">
                                                            Fazer upload
                                                          </span>
                                                        </div>
                                                      )}
                                                    </label>
                                                  </>
                                                ) : (
                                                  <div className="w-full h-full relative group">
                                                    {item.type === 'image' && (
                                                      <img
                                                        src={variation.url}
                                                        alt={`Variação ${varIndex + 1}`}
                                                        className="w-full h-full object-cover"
                                                      />
                                                    )}

                                                    {item.type === 'video' && (
                                                      <div className="w-full h-full relative">
                                                        <video
                                                          src={variation.url}
                                                          className="w-full h-full object-cover"
                                                          muted
                                                        />
                                                        <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
                                                          <div className="bg-white bg-opacity-90 p-1 rounded-full">
                                                            <svg className="w-4 h-4 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
                                                              <path d="M8 5v14l11-7z"/>
                                                            </svg>
                                                          </div>
                                                        </div>
                                                      </div>
                                                    )}

                                                    {item.type === 'audio' && (
                                                      <div className="w-full h-full bg-gradient-to-br from-green-100 to-green-200 flex flex-col items-center justify-center">
                                                        <div className="text-3xl mb-1">🎵</div>
                                                        <div className="text-xs text-center text-gray-700 px-1">
                                                          Áudio
                                                        </div>
                                                      </div>
                                                    )}

                                                    {item.type === 'document' && (
                                                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200 flex flex-col items-center justify-center p-2">
                                                        <div className="text-3xl mb-1">📄</div>
                                                        <div className="text-xs text-center text-gray-700 truncate w-full">
                                                          {variation.fileName || 'Documento'}
                                                        </div>
                                                      </div>
                                                    )}

                                                    {/* Overlay de ações */}
                                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                      <a
                                                        href={variation.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="bg-white bg-opacity-90 px-2 py-1 rounded text-xs font-medium"
                                                      >
                                                        Ver
                                                      </a>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Campo de legenda para imagem e vídeo */}
                                              {hasFile && ['image', 'video'].includes(item.type) && (
                                                <input
                                                  type="text"
                                                  placeholder="Legenda..."
                                                  value={variation.caption || ''}
                                                  onChange={(e) => {
                                                    const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                    const newSequence = currentSequence.map((seqItem, i) => {
                                                      if (i === index) {
                                                        const newVariations = [...(seqItem.content.mediaVariations || [])];
                                                        // Garantir que o array tenha o tamanho necessário
                                                        while (newVariations.length <= varIndex) {
                                                          newVariations.push({ url: '', caption: '', fileName: '' });
                                                        }
                                                        newVariations[varIndex] = { ...newVariations[varIndex], caption: e.target.value };
                                                        return {
                                                          ...seqItem,
                                                          content: { ...seqItem.content, mediaVariations: newVariations }
                                                        };
                                                      }
                                                      return seqItem;
                                                    });
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      messageContent: { sequence: newSequence }
                                                    }));
                                                  }}
                                                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                />
                                              )}

                                              {/* Nome do arquivo para não-imagens */}
                                              {hasFile && !['image', 'video'].includes(item.type) && (
                                                <div className="text-xs text-gray-600 truncate" title={variation.fileName}>
                                                  {variation.fileName || 'Arquivo'}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      // Interface original de arquivo único
                                      <>
                                        {!item.content.url ? (
                                          <div className="flex items-center gap-3">
                                            <input
                                              type="file"
                                              id={`file-upload-${index}`}
                                              className="hidden"
                                              accept={
                                                item.type === 'image' ? 'image/*' :
                                                item.type === 'video' ? 'video/*' :
                                                item.type === 'audio' ? 'audio/*' :
                                                'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/zip'
                                              }
                                              onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                  handleFileUpload(file, index);
                                                }
                                              }}
                                              disabled={uploadingFiles[index]}
                                            />
                                            <label
                                              htmlFor={`file-upload-${index}`}
                                              className={`flex-1 cursor-pointer px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg text-center text-sm font-medium transition-colors hover:border-blue-400 hover:bg-blue-50 ${
                                                uploadingFiles[index]
                                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                                                  : 'bg-white text-gray-700'
                                              }`}
                                            >
                                              {uploadingFiles[index] ? (
                                                <div className="flex flex-col items-center gap-2">
                                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                                  <span>Enviando arquivo...</span>
                                                </div>
                                              ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                  <div className="text-2xl">📁</div>
                                                  <span>Clique para fazer upload do arquivo</span>
                                                  <span className="text-xs text-gray-500">
                                                    {item.type === 'image' && 'Imagens: JPG, PNG, GIF, WebP'}
                                                    {item.type === 'video' && 'Vídeos: MP4, AVI, MOV, WMV, MKV'}
                                                    {item.type === 'audio' && 'Áudios: MP3, WAV, OGG, AAC, M4A'}
                                                    {item.type === 'document' && 'Documentos: PDF, DOC, XLS, TXT, ZIP'}
                                                  </span>
                                                </div>
                                              )}
                                            </label>
                                          </div>
                                        ) : (
                                          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-3">
                                                {item.type === 'image' && (
                                                  <img
                                                    src={item.content.url}
                                                    alt="Preview"
                                                    className="w-12 h-12 object-cover rounded"
                                                  />
                                                )}
                                                {item.type !== 'image' && (
                                                  <div className="w-12 h-12 bg-blue-100 rounded flex items-center justify-center text-2xl">
                                                    {getFileIcon(fileInfos[index]?.type || item.type)}
                                                  </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                  <div className="text-sm font-medium text-gray-900 truncate">
                                                    {fileInfos[index]?.name || 'Arquivo carregado'}
                                                  </div>
                                                  <div className="text-xs text-gray-500">
                                                    {fileInfos[index]?.size ? formatFileSize(fileInfos[index].size) : ''}
                                                  </div>
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveFile(index)}
                                                className="text-red-600 hover:text-red-800 p-1"
                                                title="Remover arquivo"
                                              >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    )}

                                    {['image', 'video'].includes(item.type) && !item.content.useMediaVariations && (
                                      <div className="space-y-2">
                                        <input
                                          type="text"
                                          placeholder="Legenda (opcional) - Use variáveis como {{nome}}, {{telefone}}, etc."
                                          value={item.content.caption || ''}
                                          onChange={(e) => {
                                            const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                            const newSequence = currentSequence.map((seqItem, i) =>
                                              i === index ? {
                                                ...seqItem,
                                                content: { ...seqItem.content, caption: e.target.value }
                                              } : seqItem
                                            );
                                            setFormData(prev => ({
                                              ...prev,
                                              messageContent: { sequence: newSequence }
                                            }));
                                          }}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <div className="flex flex-wrap gap-1">
                                          <span className="text-xs text-gray-500">Variáveis:</span>
                                          {['{{nome}}', '{{telefone}}', '{{categoria}}'].map((variable) => (
                                            <button
                                              key={variable}
                                              type="button"
                                              onClick={() => {
                                                const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                const currentCaption = currentSequence[index]?.content?.caption || '';
                                                const newSequence = currentSequence.map((seqItem, i) =>
                                                  i === index ? {
                                                    ...seqItem,
                                                    content: { ...seqItem.content, caption: currentCaption + variable }
                                                  } : seqItem
                                                );
                                                setFormData(prev => ({
                                                  ...prev,
                                                  messageContent: { sequence: newSequence }
                                                }));
                                              }}
                                              className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200"
                                            >
                                              {variable}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {item.type === 'document' && !item.content.useMediaVariations && (
                                      <input
                                        type="text"
                                        placeholder="Nome do arquivo (opcional)"
                                        value={item.content.fileName || ''}
                                        onChange={(e) => {
                                          const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                          const newSequence = currentSequence.map((seqItem, i) =>
                                            i === index ? {
                                              ...seqItem,
                                              content: { ...seqItem.content, fileName: e.target.value }
                                            } : seqItem
                                          );
                                          setFormData(prev => ({
                                            ...prev,
                                            messageContent: { sequence: newSequence }
                                          }));
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      />
                                    )}
                                  </div>
                                )}

                                {item.type === 'wait' && (
                                  <div className="space-y-3">
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                      <div className="flex items-start gap-3">
                                        <span className="text-2xl">⏱️</span>
                                        <div className="flex-1">
                                          <h4 className="text-sm font-medium text-yellow-900 mb-2">
                                            Tempo de Espera
                                          </h4>
                                          <p className="text-xs text-yellow-700 mb-3">
                                            Aguarda um tempo antes de enviar a próxima mensagem
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="number"
                                              min="1"
                                              max="3600"
                                              value={item.content.waitTime || 30}
                                              onChange={(e) => {
                                                const currentSequence = ('sequence' in formData.messageContent) ? formData.messageContent.sequence : [];
                                                const newSequence = currentSequence.map((seqItem, i) =>
                                                  i === index ? {
                                                    ...seqItem,
                                                    content: { waitTime: parseInt(e.target.value) || 30 }
                                                  } : seqItem
                                                );
                                                setFormData(prev => ({
                                                  ...prev,
                                                  messageContent: { sequence: newSequence }
                                                }));
                                              }}
                                              className="w-24 px-3 py-2 border border-yellow-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                                            />
                                            <span className="text-sm text-yellow-700">segundos</span>
                                          </div>
                                          <p className="text-xs text-yellow-600 mt-2">
                                            Mínimo: 1 segundo | Máximo: 3600 segundos (1 hora)
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}

                          {(!('sequence' in formData.messageContent) || formData.messageContent.sequence.length === 0) && (
                            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                              <div className="text-4xl mb-4">📝</div>
                              <p className="text-lg font-medium">Nenhuma mensagem na sequência</p>
                              <p className="text-sm">Clique em "Adicionar Mensagem" para começar a criar sua campanha.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="lg:col-span-2 xl:col-span-1">
                    <div className="mx-auto w-fit xl:sticky xl:top-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                      <p className="mb-2 text-center text-xs font-medium text-emerald-900">Prévia da sequência</p>
                      <div className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-emerald-100 bg-white p-2">
                        {numberedSequencePreview('sequence' in formData.messageContent ? formData.messageContent.sequence : []).map(({ item, index, messageNumber }) => item.type === 'wait' ? <div key={index} className="rounded bg-amber-50 px-2 py-1 text-center text-[11px] text-amber-800">Intervalo antes da próxima mensagem · {item.content?.waitTime || 30}s</div> : <div key={index} className="rounded border border-slate-200 p-2 text-[11px]"><strong>Mensagem {messageNumber}</strong><p className="mt-1 line-clamp-2 text-slate-600">{compositionForPreview(item).text || 'Composição sem texto'}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{technicalPreview(item).route} · {technicalPreview(item).label} · presença {technicalPreview(item).delay}ms</p></div>)}
                      </div>
                      <UazapiPhonePreview composition={compositionForPreview((('sequence' in formData.messageContent ? formData.messageContent.sequence : []).find(item => item.type !== 'wait')))} onReorderButtons={(from, to) => {
                        const sequence = ('sequence' in formData.messageContent ? formData.messageContent.sequence : []);
                        const itemIndex = sequence.findIndex(item => item.type === 'uazapi');
                        if (itemIndex < 0) return;
                        const composition = sequence[itemIndex].content.composition || sequence[itemIndex].content;
                        const buttons = [...(composition.buttons || [])]; const [button] = buttons.splice(from, 1); buttons.splice(to, 0, button);
                        const updated = sequence.map((item, index) => index === itemIndex ? { ...item, content: { ...item.content, composition: { ...composition, buttons } } } : item);
                        setFormData(prev => ({ ...prev, messageContent: { sequence: updated } }));
                      }} />
                    </div>
                  </aside>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-8 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => { setShowCreateModal(false); setEditingCampaignId(null); resetForm(); }}
                    className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-medium shadow-lg"
                  >
                    {editingCampaignId ? 'Salvar alterações' : 'Criar Campanha'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          </Portal>
        )}

        {/* Modal de Relatórios */}
        {showReportModal && (
          <Portal>
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center backdrop-blur-sm" style={{ zIndex: 9999 }}>
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto relative"
                 style={{ zIndex: 1000 }}>
              <div className="flex justify-between items-center p-6 border-b">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-medium text-gray-900">Relatório da Campanha</h3>
                  <button
                    onClick={handleRefreshReport}
                    disabled={reportLoading}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-600 text-sm rounded-md hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Atualizar relatório"
                  >
                    <svg className={`w-4 h-4 ${reportLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {reportLoading ? 'Atualizando...' : 'Atualizar'}
                  </button>
                </div>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6">
                {reportLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-gray-600">Carregando relatório...</span>
                  </div>
                ) : reportData ? (
                  <div className="space-y-6">
                    {/* Informações da Campanha */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">{reportData.campaign.nome}</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Status:</span>
                          <span className={`ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(reportData.campaign.status)}`}>
                            {getStatusText(reportData.campaign.status)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Criado por:</span>
                          <span className="ml-2 text-gray-900">
                            {reportData.campaign.createdByName || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Data de Criação:</span>
                          <span className="ml-2 text-gray-900">{new Date(reportData.campaign.criadoEm).toLocaleString('pt-BR')}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Data de Início:</span>
                          <span className="ml-2 text-gray-900">
                            {reportData.campaign.startedAt ? new Date(reportData.campaign.startedAt).toLocaleString('pt-BR') : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Data de Conclusão:</span>
                          <span className="ml-2 text-gray-900">
                            {reportData.campaign.completedAt ? new Date(reportData.campaign.completedAt).toLocaleString('pt-BR') : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Estatísticas */}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">Estatísticas de Envio</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-blue-600">{reportData.stats.total}</div>
                          <div className="text-sm text-blue-800">Total de Contatos</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-green-600">{reportData.stats.sent}</div>
                          <div className="text-sm text-green-800">Mensagens Enviadas</div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-red-600">{reportData.stats.failed}</div>
                          <div className="text-sm text-red-800">Mensagens Falharam</div>
                        </div>
                        <div className="bg-yellow-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-yellow-600">{reportData.stats.pending}</div>
                          <div className="text-sm text-yellow-800">Mensagens Pendentes</div>
                        </div>
                      </div>
                    </div>

                    {/* Mensagens por Sessão */}
                    {Object.keys(reportData.messagesBySession).length > 0 && (
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-3">Distribuição por Sessão</h4>
                        <div className="bg-white border rounded-lg overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessão</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enviadas</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Falharam</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {Object.entries(reportData.messagesBySession).map(([sessionName, sessionData]) => {
                                const messages = (sessionData as any).messages || [];
                                return (
                                  <tr key={sessionName}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sessionName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{messages.length}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                                      {messages.filter((m: any) => m.status === 'SENT').length}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                                      {messages.filter((m: any) => m.status === 'FAILED').length}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Mensagens Detalhadas */}
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-lg font-semibold text-gray-900">Detalhes das Mensagens</h4>
                        <button
                          onClick={handleDownloadReport}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                        >
                          📊 Download CSV
                        </button>
                      </div>

                      {(() => {
                        const messages = reportData.campaign.messages || [];
                        const totalPages = Math.ceil(messages.length / reportItemsPerPage);
                        const startIndex = (reportCurrentPage - 1) * reportItemsPerPage;
                        const endIndex = startIndex + reportItemsPerPage;
                        const currentMessages = messages.slice(startIndex, endIndex);

                        return (
                          <>
                            <div className="bg-white border rounded-lg overflow-hidden overflow-visible">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telefone</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessão</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data de Envio</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Erro</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {currentMessages.map((message: any) => (
                                    <tr key={message.id}>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{message.contactName}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{message.contactPhone}</td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                          message.status === 'SENT' ? 'bg-green-100 text-green-800' :
                                          message.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                          'bg-yellow-100 text-yellow-800'
                                        }`}>
                                          {message.status === 'SENT' ? 'Enviada' :
                                           message.status === 'FAILED' ? 'Falhou' : 'Pendente'}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{message.sessionName || 'N/A'}</td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {message.sentAt ? new Date(message.sentAt).toLocaleString('pt-BR') : 'N/A'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        {message.errorMessage && message.errorMessage !== 'N/A' ? (
                                          (() => {
                                            const errorInfo = getErrorIcon(message.errorMessage);
                                            return errorInfo ? (
                                              <div className="group relative inline-flex items-center">
                                                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${errorInfo.bgColor} cursor-help`}>
                                                  <span className="text-lg">{errorInfo.icon}</span>
                                                </div>

                                                {/* Tooltip com posicionamento inteligente */}
                                                <div className="group-hover:block hidden absolute z-[9999]">
                                                  {/* Versão à direita */}
                                                  <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 w-96 max-w-sm p-4 text-sm bg-gray-900 text-white rounded-lg shadow-xl border border-gray-700 group-hover/right:block hidden">
                                                    {/* Seta esquerda */}
                                                    <div className="absolute top-1/2 left-0 transform -translate-y-1/2 -translate-x-1">
                                                      <div className="w-2 h-2 bg-gray-900 border-l border-b border-gray-700 rotate-45"></div>
                                                    </div>

                                                    {/* Conteúdo */}
                                                    <div className="space-y-3">
                                                      <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${errorInfo.bgColor} ${errorInfo.color}`}>
                                                          {errorInfo.icon} {errorInfo.category}
                                                        </span>
                                                      </div>
                                                      <div className="font-semibold text-white text-sm">
                                                        Detalhes do Erro:
                                                      </div>
                                                      <div className="text-gray-200 break-all whitespace-normal text-xs leading-relaxed hyphens-auto overflow-wrap-anywhere">
                                                        {message.errorMessage}
                                                      </div>
                                                    </div>
                                                  </div>

                                                  {/* Versão à esquerda (fallback) */}
                                                  <div className="absolute right-full top-1/2 transform -translate-y-1/2 mr-2 w-96 max-w-sm p-4 text-sm bg-gray-900 text-white rounded-lg shadow-xl border border-gray-700">
                                                    {/* Seta direita */}
                                                    <div className="absolute top-1/2 right-0 transform -translate-y-1/2 translate-x-1">
                                                      <div className="w-2 h-2 bg-gray-900 border-r border-t border-gray-700 rotate-45"></div>
                                                    </div>

                                                    {/* Conteúdo */}
                                                    <div className="space-y-3">
                                                      <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${errorInfo.bgColor} ${errorInfo.color}`}>
                                                          {errorInfo.icon} {errorInfo.category}
                                                        </span>
                                                      </div>
                                                      <div className="font-semibold text-white text-sm">
                                                        Detalhes do Erro:
                                                      </div>
                                                      <div className="text-gray-200 break-all whitespace-normal text-xs leading-relaxed hyphens-auto overflow-wrap-anywhere">
                                                        {message.errorMessage}
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            ) : (
                                              <span className="text-sm text-red-600">
                                                {message.errorMessage}
                                              </span>
                                            );
                                          })()
                                        ) : (
                                          <span className="text-sm text-gray-400 flex items-center justify-center">
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100">
                                              <span className="text-lg">✅</span>
                                            </div>
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {messages.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                  Nenhuma mensagem encontrada
                                </div>
                              )}
                            </div>

                            {/* Paginação */}
                            {totalPages > 1 && (
                              <div className="flex items-center justify-between mt-4">
                                <div className="text-sm text-gray-700">
                                  Mostrando {startIndex + 1} a {Math.min(endIndex, messages.length)} de {messages.length} mensagens
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setReportCurrentPage(page => Math.max(page - 1, 1))}
                                    disabled={reportCurrentPage === 1}
                                    className="px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Anterior
                                  </button>

                                  <div className="flex items-center gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                                      <button
                                        key={pageNum}
                                        onClick={() => setReportCurrentPage(pageNum)}
                                        className={`px-3 py-2 text-sm rounded-md ${
                                          pageNum === reportCurrentPage
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                      >
                                        {pageNum}
                                      </button>
                                    ))}
                                  </div>

                                  <button
                                    onClick={() => setReportCurrentPage(page => Math.min(page + 1, totalPages))}
                                    disabled={reportCurrentPage === totalPages}
                                    className="px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Próximo
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Erro ao carregar relatório
                  </div>
                )}
              </div>
            </div>
          </div>
          </Portal>
        )}
      </div>
    </>
  );
}
