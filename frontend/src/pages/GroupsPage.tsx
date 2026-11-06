import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Header } from '../components/Header';

type Session = { id: string; name: string; displayName?: string; status: string };
type Group = {
  id: string;
  nome: string;
  descricao?: string | null;
  jid: string;
  participantCount: number;
  isCommunity: boolean;
  sessionId: string;
  lastSyncedAt?: string;
  session?: Session;
  _count?: { members: number };
};
type Lead = { id: string; nome: string; telefone: string; groupName?: string };
type LeadList = {
  id: string;
  nome: string;
  descricao?: string | null;
  motivo?: string | null;
  updatedAt?: string;
  _count?: { members: number };
};
type LeadListDetail = LeadList & {
  members?: Array<{ id: string; lead: { id: string; nome: string; telefone: string; tags?: string[] } }>;
};

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Erro na operação');
  return data;
}

function StatusBadge({ value }: { value: string }) {
  const online = value === 'WORKING' || value === 'ACTIVE' || value === 'CONNECTED';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {online ? 'Conectada' : value || 'Offline'}
    </span>
  );
}

export function GroupsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'admin' | 'extract' | 'lists'>('admin');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [lists, setLists] = useState<LeadList[]>([]);

  // Filters & table state (Tab 1 & Tab 2)
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [filterSession, setFilterSession] = useState('all');
  const [filterType, setFilterType] = useState<'all' | 'group' | 'community'>('all');
  const [sortBy, setSortBy] = useState<'participants' | 'leads' | 'name'>('participants');
  const [search, setSearch] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Extraction Wizard state
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncingSessionId, setSyncingSessionId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [listName, setListName] = useState('');
  const [saveList, setSaveList] = useState(true);
  const [addContacts, setAddContacts] = useState(true);
  const [tag, setTag] = useState('');

  // Saved list detail modal state
  const [viewingList, setViewingList] = useState<LeadListDetail | null>(null);
  const [listModalSearch, setListModalSearch] = useState('');
  const [listActionLoading, setListActionLoading] = useState<string | null>(null);

  const load = async () => {
    try {
      const [groupData, listData, connectionData] = await Promise.all([
        api('/groups'),
        api('/groups/lists'),
        api('/connections'),
      ]);
      setGroups(Array.isArray(groupData) ? groupData : []);
      setLists(Array.isArray(listData) ? listData : []);
      setSessions(
        (Array.isArray(connectionData) ? connectionData : [])
          .filter((c: any) => c.provider === 'UAZAPI')
          .map((c: any) => ({
            id: c.id,
            name: c.instanceName,
            displayName: c.displayName || c.instanceName,
            status: c.status,
          }))
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredAndSortedGroups = useMemo(() => {
    return groups
      .filter((g) => {
        if (filterSession !== 'all' && g.sessionId !== filterSession) return false;
        if (filterType === 'group' && g.isCommunity) return false;
        if (filterType === 'community' && !g.isCommunity) return false;
        if (search) {
          const q = search.toLowerCase();
          return `${g.nome} ${g.jid} ${g.descricao || ''}`.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'participants') return (b.participantCount || 0) - (a.participantCount || 0);
        if (sortBy === 'leads') return (b._count?.members || 0) - (a._count?.members || 0);
        return a.nome.localeCompare(b.nome, 'pt-BR');
      });
  }, [groups, filterSession, filterType, search, sortBy]);

  const selectedObjects = useMemo(
    () => groups.filter((g) => selectedGroups.includes(g.id)),
    [groups, selectedGroups]
  );

  const totalParticipants = groups.reduce((sum, group) => sum + (group.participantCount || 0), 0);
  const totalIdentifiedLeads = groups.reduce((sum, group) => sum + (group._count?.members || 0), 0);
  const totalCommunities = groups.filter((group) => group.isCommunity).length;
  const totalRegularGroups = groups.length - totalCommunities;

  const toggle = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    setter((value) => (value.includes(id) ? value.filter((item) => item !== id) : [...value, id]));

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredAndSortedGroups.map((g) => g.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedGroups.includes(id));
    if (allSelected) {
      setSelectedGroups((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedGroups((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const sync = async (sessionId?: string) => {
    setLoading(true);
    if (sessionId) setSyncingSessionId(sessionId);
    try {
      const result = await api('/groups/sync', {
        method: 'POST',
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      });
      toast.success(`${result.count || 0} grupos e comunidades sincronizados com sucesso!`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
      setSyncingSessionId(null);
    }
  };

  const startQuickExtraction = (groupIds: string[]) => {
    const targetGroups = groups.filter((g) => groupIds.includes(g.id));
    const instanceIds = [...new Set(targetGroups.map((g) => g.sessionId))];
    setSelectedInstances(instanceIds);
    setSelectedGroups(groupIds);
    setTab('extract');
    setStep(3);
  };

  const loadSourcesForWizard = async () => {
    if (!selectedInstances.length) return toast.error('Selecione pelo menos uma instância');
    setLoading(true);
    try {
      for (const id of selectedInstances) {
        await api('/groups/sync', { method: 'POST', body: JSON.stringify({ sessionId: id }) });
      }
      await load();
      setFilterSession(selectedInstances.length === 1 ? selectedInstances[0] : 'all');
      setStep(2);
      toast.success('Grupos e comunidades sincronizados');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const extract = async () => {
    if (!selectedGroups.length) return toast.error('Selecione pelo menos um grupo ou comunidade');
    setLoading(true);
    try {
      const result = await api('/groups/extract', {
        method: 'POST',
        body: JSON.stringify({ groupIds: selectedGroups }),
      });
      const extractedLeads = result.leads || [];
      setLeads(extractedLeads);
      const defaultName = `Leads · ${selectedObjects
        .slice(0, 2)
        .map((g) => g.nome)
        .join(' + ')}${selectedObjects.length > 2 ? ` (+${selectedObjects.length - 2})` : ''}`.slice(0, 80);
      setListName(defaultName);
      setTag(defaultName);
      setStep(4);
      toast.success(`${result.total || extractedLeads.length} leads únicos extraídos e higienizados!`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const finishExtraction = async (openCampaignModal: boolean) => {
    if (!leads.length) return toast.error('Nenhum lead encontrado para salvar');
    if (saveList && !listName.trim()) return toast.error('Informe um nome para a lista');
    setLoading(true);
    try {
      let createdCategoryId: string | null = null;
      const finalCategoryName = (tag || listName).trim();

      if (saveList) {
        await api('/groups/lists', {
          method: 'POST',
          body: JSON.stringify({
            nome: listName.trim(),
            motivo: `Extração de ${selectedObjects.length} grupo(s)/comunidade(s)`,
            leadIds: leads.map((l) => l.id),
          }),
        });
      }

      if (addContacts || openCampaignModal) {
        const promoted = await api('/groups/promote', {
          method: 'POST',
          body: JSON.stringify({
            leadIds: leads.map((l) => l.id),
            tag: finalCategoryName,
            categoryName: finalCategoryName,
          }),
        });
        createdCategoryId = promoted.categoryId || null;
      }

      await load();

      if (openCampaignModal) {
        if (createdCategoryId) {
          localStorage.setItem('ruptur_campaign_group_category', createdCategoryId);
        }
        localStorage.setItem('ruptur_campaign_group_name', finalCategoryName || listName.trim());
        localStorage.setItem('ruptur_campaign_group_leads', leads.map((l) => l.telefone).join('\n'));
        toast.success('Lista criada e vinculada! Abrindo criador de campanha...');
        navigate('/campanhas');
      } else {
        toast.success('Lista e contatos salvos com sucesso!');
        resetWizard();
        setTab('lists');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedInstances([]);
    setSelectedGroups([]);
    setLeads([]);
    setListName('');
    setSaveList(true);
    setAddContacts(true);
    setTag('');
  };

  const exportList = async (id: string, nome: string, format: string) => {
    try {
      const response = await fetch(`/api/groups/lists/${id}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) return toast.error('Não foi possível exportar a lista');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      const safeSlug = nome.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 40) || id;
      link.href = url;
      link.download = `leads-${safeSlug}.${format === 'xlsx' ? 'xlsx' : format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportação ${format.toUpperCase()} concluída!`);
    } catch {
      toast.error('Falha ao exportar arquivo');
    }
  };

  const handleViewListDetails = async (id: string) => {
    setListActionLoading(id);
    try {
      const detail = await api(`/groups/lists/${id}`);
      setViewingList(detail);
      setListModalSearch('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setListActionLoading(null);
    }
  };

  const handleUseListInCampaign = async (list: LeadList, goToCampaign: boolean) => {
    setListActionLoading(list.id);
    try {
      const result = await api(`/groups/lists/${list.id}/promote`, {
        method: 'POST',
        body: JSON.stringify({ categoryName: list.nome }),
      });
      if (goToCampaign) {
        if (result.categoryId) {
          localStorage.setItem('ruptur_campaign_group_category', result.categoryId);
        }
        localStorage.setItem('ruptur_campaign_group_name', list.nome);
        if (Array.isArray(result.phones) && result.phones.length) {
          localStorage.setItem('ruptur_campaign_group_leads', result.phones.join('\n'));
        }
        toast.success(`Categoria "${list.nome}" sincronizada (${result.count} contatos)! Abrindo campanha...`);
        navigate('/campanhas');
      } else {
        toast.success(
          `Lista "${list.nome}" sincronizada em Contatos & Categorias (${result.count} contatos)! Agora ela aparece em todas as suas campanhas.`
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setListActionLoading(null);
    }
  };

  const handleDeleteList = async (list: LeadList) => {
    if (!confirm(`Deseja realmente excluir a lista "${list.nome}"? Os contatos já promovidos serão mantidos.`)) {
      return;
    }
    setListActionLoading(list.id);
    try {
      await api(`/groups/lists/${list.id}`, { method: 'DELETE' });
      toast.success('Lista excluída com sucesso');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setListActionLoading(null);
    }
  };

  const tabs = [
    {
      key: 'admin' as const,
      title: '1. Meus Grupos & Instâncias',
      subtitle: 'Sincronize conexões, filtre grupos e selecione fontes',
    },
    {
      key: 'extract' as const,
      title: '2. Extrator de Leads (Passo a Passo)',
      subtitle: 'Higienize números únicos e crie categorias de disparo',
    },
    {
      key: 'lists' as const,
      title: `3. Listas Extraídas & Exportação (${lists.length})`,
      subtitle: 'Dispare campanhas, sincronize categorias ou baixe CSV/Excel',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        title="Grupos & Comunidades WhatsApp"
        subtitle="Transforme participantes de grupos e comunidades em listas higienizadas prontas para Campanhas e CRM"
      />

      <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
        {/* Banner explicativo colapsável de contexto e boas práticas */}
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-white to-blue-50/80 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-sm">
                🧲
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Fluxo Inteligente: Grupos → Higienização → Categorias de Contatos → Campanhas
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Sincronize suas conexões UAZAPI, escolha os grupos desejados e extraia os participantes sem números duplicados. Ao salvar, a lista vira automaticamente uma <b>Categoria selecionável nas suas Campanhas</b>.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="shrink-0 self-start sm:self-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
            >
              {showGuide ? 'Ocultar dicas' : '❓ Como usar com segurança'}
            </button>
          </div>

          {showGuide && (
            <div className="mt-4 grid gap-3 border-t border-indigo-100 pt-4 text-xs text-slate-600 sm:grid-cols-3">
              <div className="rounded-lg bg-white p-3 border border-slate-200/80">
                <b className="text-slate-900 block mb-1">1. Participantes vs. Leads Extraídos</b>
                <span className="font-medium text-blue-700">Participantes</span> é a estimativa total do grupo informada pelo WhatsApp. <span className="font-medium text-emerald-700">Leads Extraídos</span> são os telefones reais já coletados, validados e sem duplicidade.
              </div>
              <div className="rounded-lg bg-white p-3 border border-slate-200/80">
                <b className="text-slate-900 block mb-1">2. Proteção Anti-Bloqueio (Cadência UAZAPI)</b>
                Durante a extração, o Ruptur consulta cada grupo respeitando um espaçamento seguro de 1,2s por requisição, evitando picos artificiais na sua instância.
              </div>
              <div className="rounded-lg bg-white p-3 border border-slate-200/80">
                <b className="text-slate-900 block mb-1">3. Uso Imediato em Campanhas ou Excel</b>
                Toda lista extraída pode ser exportada em <b>CSV, Excel (XLSX) ou TXT</b> e também fica disponível como <b>Categoria de Contatos</b> ao criar qualquer campanha.
              </div>
            </div>
          )}
        </div>

        {/* KPIs Executivos da Base de Grupos */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupos Sincronizados</span>
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">👥 Grupos</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{totalRegularGroups}</div>
            <div className="mt-1 text-xs text-slate-500">Em {sessions.length} conexão(ões) UAZAPI</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comunidades</span>
              <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">◎ Avisos/Hubs</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-700">{totalCommunities}</div>
            <div className="mt-1 text-xs text-slate-500">Comunidades mapeadas</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500" title="Soma nominal de membros reportada pelo WhatsApp antes da remoção de duplicados entre grupos">
                Alcance Bruto (Membros) ⓘ
              </span>
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Potencial</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-700">{totalParticipants.toLocaleString('pt-BR')}</div>
            <div className="mt-1 text-xs text-slate-500">Soma de membros nas fontes</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500" title="Telefones únicos já extraídos, validados e salvos na base do seu tenant">
                Leads Únicos Extraídos ⓘ
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Prontos</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-700">{totalIdentifiedLeads.toLocaleString('pt-BR')}</div>
            <div className="mt-1 text-xs text-slate-500">{lists.length} lista(s) salva(s) para uso</div>
          </div>
        </div>

        {/* Navegação por Abas Clara */}
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-3">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-lg p-3 text-left transition ${
                tab === item.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="font-semibold text-sm">{item.title}</div>
              <span className={`block text-xs mt-0.5 ${tab === item.key ? 'text-slate-300' : 'text-slate-500'}`}>
                {item.subtitle}
              </span>
            </button>
          ))}
        </div>

        {/* ABA 1: MEUS GRUPOS E INSTÂNCIAS (UNIFICADA, SEM DUPLICAÇÃO) */}
        {tab === 'admin' && (
          <div className="space-y-6">
            {/* Painel Único de Conexões e Sincronização */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Conexões WhatsApp & Sincronização de Fontes
                  </h2>
                  <p className="text-xs text-slate-500">
                    Atualize os grupos de cada chip conectado ou clique em uma instância para filtrar a tabela abaixo.
                  </p>
                </div>
                <button
                  onClick={() => sync()}
                  disabled={loading || !sessions.length}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading && !syncingSessionId ? 'Sincronizando todas...' : '🔄 Sincronizar Todas as Instâncias'}
                </button>
              </div>

              {sessions.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {sessions.map((s) => {
                    const instanceGroups = groups.filter((g) => g.sessionId === s.id);
                    const instanceCommunities = instanceGroups.filter((g) => g.isCommunity);
                    const instanceRegularGroups = instanceGroups.filter((g) => !g.isCommunity);
                    const instanceParticipants = instanceGroups.reduce((sum, g) => sum + (g.participantCount || 0), 0);
                    const instanceLeads = instanceGroups.reduce((sum, g) => sum + (g._count?.members || 0), 0);
                    const isFiltered = filterSession === s.id;

                    return (
                      <div
                        key={s.id}
                        className={`rounded-xl border p-4 transition ${
                          isFiltered ? 'border-blue-500 bg-blue-50/20 ring-1 ring-blue-500' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{s.displayName || s.name}</div>
                            <div className="text-[11px] text-slate-500">{instanceGroups.length} fonte(s) mapeada(s)</div>
                          </div>
                          <StatusBadge value={s.status} />
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-slate-50 p-2">
                            <div className="text-[11px] text-slate-500">Grupos</div>
                            <b className="text-slate-900">{instanceRegularGroups.length}</b>
                          </div>
                          <div className="rounded-lg bg-purple-50/70 p-2">
                            <div className="text-[11px] text-purple-700">Comunid.</div>
                            <b className="text-purple-800">{instanceCommunities.length}</b>
                          </div>
                          <div className="rounded-lg bg-emerald-50/70 p-2">
                            <div className="text-[11px] text-emerald-700">Extraídos</div>
                            <b className="text-emerald-800">{instanceLeads.toLocaleString('pt-BR')}</b>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                          <span className="text-slate-500">
                            Potencial: <b>{instanceParticipants.toLocaleString('pt-BR')}</b> membros
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setFilterSession(isFiltered ? 'all' : s.id)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium border ${
                                isFiltered
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {isFiltered ? 'Mostrando' : 'Filtrar'}
                            </button>
                            <button
                              onClick={() => sync(s.id)}
                              disabled={loading}
                              className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            >
                              {syncingSessionId === s.id ? '...' : '🔄 Sincronizar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Nenhuma instância UAZAPI conectada neste ambiente. Conecte uma instância na aba <b>WhatsApp / Conexões</b> para listar seus grupos.
                </div>
              )}
            </div>

            {/* Tabela Única Inteligente de Grupos e Comunidades com Seleção em Lote */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Catálogo de Grupos e Comunidades ({filteredAndSortedGroups.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Marque um ou mais grupos na tabela para extrair todos os participantes de uma só vez.
                    </p>
                  </div>

                  {selectedGroups.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 border border-indigo-200">
                      <span className="text-xs font-semibold text-indigo-900">
                        {selectedGroups.length} selecionado(s) (~
                        {selectedObjects.reduce((s, g) => s + (g.participantCount || 0), 0).toLocaleString('pt-BR')} membros)
                      </span>
                      <button
                        onClick={() => startQuickExtraction(selectedGroups)}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                      >
                        🧲 Extrair Leads Selecionados
                      </button>
                      <button
                        onClick={() => setSelectedGroups([])}
                        className="text-xs text-slate-500 hover:text-slate-700 px-1"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>

                {/* Barra de Filtros e Pesquisa */}
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="🔍 Buscar por nome do grupo ou JID..."
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                  <select
                    value={filterSession}
                    onChange={(e) => setFilterSession(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="all">Todas as instâncias ({sessions.length})</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        Instância: {s.displayName || s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="all">Todos os tipos (Grupos + Comunidades)</option>
                    <option value="group">👥 Apenas Grupos</option>
                    <option value="community">◎ Apenas Comunidades</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="participants">Ordenar: Maior nº de participantes</option>
                    <option value="leads">Ordenar: Mais leads já extraídos</option>
                    <option value="name">Ordenar: Nome (A-Z)</option>
                  </select>
                </div>
              </div>

              {filteredAndSortedGroups.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={
                              filteredAndSortedGroups.length > 0 &&
                              filteredAndSortedGroups.every((g) => selectedGroups.includes(g.id))
                            }
                            onChange={toggleSelectAllVisible}
                            title="Selecionar todos os grupos visíveis"
                          />
                        </th>
                        <th className="px-4 py-3">Grupo / Comunidade</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Instância</th>
                        <th className="px-4 py-3 text-right">Participantes</th>
                        <th className="px-4 py-3 text-right">Leads Extraídos</th>
                        <th className="px-4 py-3 text-right">Ação Rápida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAndSortedGroups.map((g) => {
                        const isSelected = selectedGroups.includes(g.id);
                        return (
                          <tr
                            key={g.id}
                            className={`hover:bg-slate-50 transition ${isSelected ? 'bg-indigo-50/40' : ''}`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggle(g.id, setSelectedGroups)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{g.nome}</div>
                              {g.descricao && (
                                <div className="text-xs text-slate-400 truncate max-w-xs">{g.descricao}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  g.isCommunity
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {g.isCommunity ? '◎ Comunidade' : '👥 Grupo'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              {g.session?.displayName || g.session?.name || '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-800">
                              {(g.participantCount || 0).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`font-semibold ${
                                  (g._count?.members || 0) > 0 ? 'text-emerald-700' : 'text-slate-400'
                                }`}
                              >
                                {(g._count?.members || 0).toLocaleString('pt-BR')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => startQuickExtraction([g.id])}
                                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                              >
                                Extrair leads →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center">
                  <p className="text-sm font-medium text-slate-700">Nenhum grupo encontrado para os filtros atuais.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Clique em <b>"Sincronizar Todas as Instâncias"</b> acima para buscar os grupos das suas conexões.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 2: WIZARD DE EXTRAÇÃO PASSO A PASSO */}
        {tab === 'extract' && (
          <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Assistente de Extração e Higienização de Leads</h2>
                <p className="text-xs text-slate-500">
                  Extraia participantes de múltiplos grupos simultaneamente, remova telefones duplicados e envie direto para Campanhas.
                </p>
              </div>
              <button
                onClick={resetWizard}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                ↺ Recomeçar
              </button>
            </div>

            <div className="mb-8 grid grid-cols-4 gap-2">
              {['1. Instâncias', '2. Grupos/Fontes', '3. Revisão & Extração', '4. Destino & Campanha'].map(
                (label, i) => (
                  <div
                    key={label}
                    className={`border-b-2 pb-2 text-center text-xs sm:text-sm ${
                      step > i
                        ? 'border-indigo-600 font-semibold text-indigo-700'
                        : 'border-slate-200 text-slate-400'
                    }`}
                  >
                    {label}
                  </div>
                )
              )}
            </div>

            {step === 1 && (
              <div>
                <h3 className="text-base font-semibold text-slate-900">1. Selecione as conexões WhatsApp de origem</h3>
                <p className="mb-5 text-xs text-slate-500">
                  Escolha de quais instâncias você deseja carregar os grupos e comunidades.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {sessions.map((s) => (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                        selectedInstances.includes(s.id)
                          ? 'border-indigo-600 bg-indigo-50/30'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInstances.includes(s.id)}
                        onChange={() => toggle(s.id, setSelectedInstances)}
                      />
                      <div className="flex-1">
                        <b className="text-sm text-slate-900">{s.displayName || s.name}</b>
                        <div className="text-xs text-slate-500">
                          {groups.filter((g) => g.sessionId === s.id).length} grupos já sincronizados
                        </div>
                      </div>
                      <StatusBadge value={s.status} />
                    </label>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-between border-t pt-4">
                  <span className="text-xs text-slate-500">
                    {selectedInstances.length} instância(s) selecionada(s)
                  </span>
                  <div className="flex gap-2">
                    {groups.some((g) => selectedInstances.includes(g.sessionId)) && (
                      <button
                        onClick={() => setStep(2)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Usar grupos já sincronizados →
                      </button>
                    )}
                    <button
                      onClick={loadSourcesForWizard}
                      disabled={!selectedInstances.length || loading}
                      className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {loading ? 'Sincronizando na UAZAPI...' : '🔄 Sincronizar e Avançar'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h3 className="text-base font-semibold text-slate-900">2. Escolha os grupos e comunidades</h3>
                <p className="mb-4 text-xs text-slate-500">
                  Você pode selecionar vários grupos ao mesmo tempo. Números repetidos em mais de um grupo serão unificados automaticamente.
                </p>
                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <select
                    value={filterSession}
                    onChange={(e) => setFilterSession(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    <option value="all">Todas as instâncias selecionadas</option>
                    {sessions
                      .filter((s) => selectedInstances.includes(s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName || s.name}
                        </option>
                      ))}
                  </select>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="🔍 Buscar grupo ou comunidade..."
                    className="flex-1 rounded-lg border px-3 py-2 text-xs"
                  />
                </div>
                <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 divide-y">
                  {filteredAndSortedGroups
                    .filter((g) => !selectedInstances.length || selectedInstances.includes(g.sessionId))
                    .map((g) => (
                      <label
                        key={g.id}
                        className="flex cursor-pointer items-center gap-3 p-3.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroups.includes(g.id)}
                          onChange={() => toggle(g.id, setSelectedGroups)}
                        />
                        <span className="text-lg">{g.isCommunity ? '◎' : '👥'}</span>
                        <div className="flex-1">
                          <b className="text-sm text-slate-900">{g.nome}</b>
                          <div className="text-xs text-slate-500">
                            {g.isCommunity ? 'Comunidade' : 'Grupo'} ·{' '}
                            {(g.participantCount || 0).toLocaleString('pt-BR')} participantes ·{' '}
                            {g.session?.displayName || g.session?.name}
                          </div>
                        </div>
                      </label>
                    ))}
                </div>
                <div className="mt-6 flex items-center justify-between border-t pt-4">
                  <button onClick={() => setStep(1)} className="rounded-lg border px-4 py-2 text-xs font-medium">
                    ← Voltar
                  </button>
                  <span className="text-xs text-slate-600">
                    <b>{selectedGroups.length}</b> fonte(s) · ~
                    <b>
                      {selectedObjects
                        .reduce((sum, g) => sum + (g.participantCount || 0), 0)
                        .toLocaleString('pt-BR')}
                    </b>{' '}
                    participantes
                  </span>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!selectedGroups.length}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Continuar →
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h3 className="text-base font-semibold text-slate-900">3. Confirme as fontes para extração</h3>
                <p className="mb-4 text-xs text-slate-500">
                  O Ruptur consultará os participantes de cada grupo selecionado e removerá números repetidos ou inválidos.
                </p>
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
                  <b>{selectedGroups.length} grupo(s)/comunidade(s)</b> prontos para leitura · Estimativa bruta de{' '}
                  <b>
                    {selectedObjects
                      .reduce((sum, g) => sum + (g.participantCount || 0), 0)
                      .toLocaleString('pt-BR')}{' '}
                    participantes
                  </b>
                  .
                </div>
                <div className="max-h-72 overflow-auto space-y-2">
                  {selectedObjects.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"
                    >
                      <div>
                        <b className="text-slate-900">{g.nome}</b>
                        <div className="text-slate-500">
                          {g.session?.displayName || g.session?.name} ·{' '}
                          {(g.participantCount || 0).toLocaleString('pt-BR')} participantes
                        </div>
                      </div>
                      <button
                        onClick={() => toggle(g.id, setSelectedGroups)}
                        className="text-red-600 hover:underline font-medium"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-between border-t pt-4">
                  <button onClick={() => setStep(2)} className="rounded-lg border px-4 py-2 text-xs font-medium">
                    ← Escolher mais grupos
                  </button>
                  <button
                    onClick={extract}
                    disabled={loading || !selectedGroups.length}
                    className="rounded-lg bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? '⏳ Extraindo e desduplicando leads...' : '🧲 Extrair Leads Agora'}
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  ✅ <b>{leads.length.toLocaleString('pt-BR')} leads únicos extraídos com sucesso!</b> Todos os números foram higienizados e desduplicados.
                </div>

                <h3 className="mb-3 text-base font-semibold text-slate-900">
                  4. Como você deseja salvar e utilizar esses leads?
                </h3>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50/60">
                    <input
                      type="checkbox"
                      checked={saveList}
                      onChange={(e) => setSaveList(e.target.checked)}
                      className="mt-1"
                    />
                    <span className="flex-1">
                      <b className="text-sm text-slate-900">Salvar na aba "Listas Extraídas & Exportação"</b>
                      <span className="block text-xs text-slate-500">
                        Permite baixar em Excel (XLSX), CSV ou TXT a qualquer momento e reutilizar depois.
                      </span>
                      {saveList && (
                        <input
                          value={listName}
                          onChange={(e) => {
                            setListName(e.target.value);
                            if (!tag || tag === listName) setTag(e.target.value);
                          }}
                          placeholder="Ex: Leads Grupo VIP Imóveis"
                          className="mt-2.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                        />
                      )}
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addContacts}
                      onChange={(e) => setAddContacts(e.target.checked)}
                      className="mt-1"
                    />
                    <span className="flex-1">
                      <b className="text-sm text-indigo-950">
                        Criar Categoria em Contatos (Pronta para selecionar em Campanhas)
                      </b>
                      <span className="block text-xs text-slate-600">
                        Cria automaticamente uma Categoria na sua base de Contatos para você selecionar em qualquer Campanha de disparo.
                      </span>
                      {addContacts && (
                        <input
                          value={tag}
                          onChange={(e) => setTag(e.target.value)}
                          placeholder="Nome da Categoria em Campanhas (Ex: Grupo VIP)"
                          className="mt-2.5 w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs"
                        />
                      )}
                    </span>
                  </label>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <button onClick={() => setStep(3)} className="rounded-lg border px-4 py-2 text-xs font-medium">
                    ← Voltar
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => finishExtraction(false)}
                      disabled={loading || (!saveList && !addContacts)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      💾 Apenas Salvar Lista / Categoria
                    </button>
                    <button
                      onClick={() => finishExtraction(true)}
                      disabled={loading}
                      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      🚀 Salvar e Criar Campanha de Disparo Agora
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 3: LISTAS EXTRAÍDAS, SINCRONIZAÇÃO COM CAMPANHAS E EXPORTAÇÃO */}
        {tab === 'lists' && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Listas de Leads Extraídas ({lists.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Use qualquer lista diretamente em uma Nova Campanha, sincronize como Categoria de Contatos ou exporte em CSV, Excel (XLSX) e TXT.
                </p>
              </div>
              <button
                onClick={() => {
                  resetWizard();
                  setTab('extract');
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 self-start sm:self-auto"
              >
                + Nova Extração de Grupos
              </button>
            </div>

            {lists.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {lists.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between hover:bg-slate-50/70 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <b className="text-sm font-semibold text-slate-900">{l.nome}</b>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          {(l._count?.members || 0).toLocaleString('pt-BR')} leads
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {l.motivo || 'Extração de grupos WhatsApp'}
                        {l.updatedAt ? ` · Atualizada em ${new Date(l.updatedAt).toLocaleDateString('pt-BR')}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleUseListInCampaign(l, true)}
                        disabled={listActionLoading === l.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        title="Promover para Categoria e abrir o criador de Campanha já com esta lista selecionada"
                      >
                        🚀 Usar em Campanha
                      </button>

                      <button
                        onClick={() => handleUseListInCampaign(l, false)}
                        disabled={listActionLoading === l.id}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        title="Cria ou atualiza uma Categoria em Contatos com os membros desta lista"
                      >
                        🏷️ Sincronizar Categoria
                      </button>

                      <button
                        onClick={() => handleViewListDetails(l.id)}
                        disabled={listActionLoading === l.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        👁️ Ver Leads
                      </button>

                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        <span className="px-2 text-[11px] font-medium text-slate-500">📥 Exportar:</span>
                        {(['csv', 'xlsx', 'txt'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => exportList(l.id, l.nome, f)}
                            className="rounded px-2 py-1 text-[11px] font-semibold uppercase text-slate-700 hover:bg-white hover:shadow-sm"
                            title={`Baixar lista em formato ${f.toUpperCase()}`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => handleDeleteList(l)}
                        disabled={listActionLoading === l.id}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        title="Excluir lista salva"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <p className="text-sm font-medium text-slate-700">Nenhuma lista extraída ainda.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Selecione um ou mais grupos na primeira aba ou use o Extrator Passo a Passo para gerar sua primeira lista.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal para Visualizar os Leads de uma Lista Salva */}
      {viewingList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{viewingList.nome}</h3>
                <p className="text-xs text-slate-500">
                  {(viewingList.members || []).length.toLocaleString('pt-BR')} leads nesta lista
                </p>
              </div>
              <button
                onClick={() => setViewingList(null)}
                className="rounded-lg border px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                ✕ Fechar
              </button>
            </div>
            <div className="border-b p-3 bg-slate-50">
              <input
                value={listModalSearch}
                onChange={(e) => setListModalSearch(e.target.value)}
                placeholder="🔍 Filtrar por nome ou telefone..."
                className="w-full rounded-lg border bg-white px-3 py-2 text-xs"
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y">
              {(viewingList.members || [])
                .filter((m) =>
                  !listModalSearch
                    ? true
                    : `${m.lead?.nome || ''} ${m.lead?.telefone || ''}`
                        .toLowerCase()
                        .includes(listModalSearch.toLowerCase())
                )
                .map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <span className="font-medium text-slate-800">{m.lead?.nome || 'Sem nome'}</span>
                    <span className="font-mono text-slate-600">{m.lead?.telefone}</span>
                  </div>
                ))}
            </div>
            <div className="flex items-center justify-between border-t bg-slate-50 p-4">
              <div className="flex gap-2">
                {(['csv', 'xlsx', 'txt'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => exportList(viewingList.id, viewingList.nome, f)}
                    className="rounded border bg-white px-3 py-1.5 text-xs font-semibold uppercase text-slate-700 hover:bg-slate-100"
                  >
                    📥 Baixar {f}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const target = viewingList;
                  setViewingList(null);
                  handleUseListInCampaign(target, true);
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                🚀 Usar em Campanha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
