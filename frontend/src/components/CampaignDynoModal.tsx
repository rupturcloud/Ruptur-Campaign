import React, { useState, useEffect, useRef } from 'react';
import { Portal } from './Portal';

interface DataloggerPoint {
  timestamp: string;
  label: string;
  rpm: number;
  sent: number;
  failed: number;
  successRatePercent: number;
  perCylinderRpm: Record<string, number>;
}

interface CylinderStats {
  sessionName: string;
  provider: string;
  dbStatus: string;
  mePushName: string | null;
  circuit: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    canUse: boolean;
    consecutiveFailures: number;
    trips: number;
    lastError?: string;
    lastFailureAt?: string;
    lastSuccessAt?: string;
    reopensAt?: string;
  };
  stats: {
    sent: number;
    failed: number;
    pending: number;
    rpm5Min: number;
    totalHandled: number;
    avgLatencyMs: number;
    healthScore: number;
    lambdaRatio: number;
  };
}

interface RecentError {
  id: string;
  contactPhone: string;
  sessionName: string | null;
  errorMessage: string;
  status: string;
  atualizadoEm: string;
  errorClass: 'INFRA' | 'UNKNOWN_OUTCOME' | 'PERMANENT';
}

interface DynoData {
  campaignId: string;
  campaignName: string;
  status: string;
  timestamp: string;
  performance: {
    rpm5Min: number;
    rpm15Min: number;
    etaMinutes: number | null;
    successRatePercent: number;
    configuredRandomDelay: number;
  };
  counts: {
    total: number;
    pending: number;
    processing: number;
    sent: number;
    failed: number;
  };
  cylinders: CylinderStats[];
  quarantinedSessionsCount: number;
  activeSessionsCount: number;
  recentErrors: RecentError[];
  datalogger?: DataloggerPoint[];
}

interface CampaignDynoModalProps {
  campaignId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CampaignDynoModal: React.FC<CampaignDynoModalProps> = ({
  campaignId,
  isOpen,
  onClose
}) => {
  const [data, setData] = useState<DynoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'DATALOGGER' | 'TUNING' | 'CYLINDERS' | 'BLACKBOX'>('DATALOGGER');
  
  // Filtro de canal para isolar curva individual no datalogger
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Estados de Tuning (Calibração em Tempo Real)
  const [tunedDelay, setTunedDelay] = useState<number>(30);
  const [tuningSaving, setTuningSaving] = useState(false);
  const [tuningToast, setTuningToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDynoData = async (silent = false) => {
    if (!campaignId) return;
    if (!silent) setLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/campaigns/${campaignId}/dyno`, { headers });
      if (res.ok) {
        const json: DynoData = await res.json();
        setData(json);
        setLastFetchedAt(new Date());
        if (json.performance?.configuredRandomDelay && !tuningSaving) {
          setTunedDelay(json.performance.configuredRandomDelay);
        }
      }
    } catch (err) {
      console.error('Falha ao obter telemetria:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleApplyTuning = async (options?: { resetSession?: string; quarantineSession?: string }) => {
    if (!campaignId) return;
    setTuningSaving(true);
    setTuningToast(null);

    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload: any = {
        randomDelay: tunedDelay
      };

      if (options?.resetSession) {
        payload.resetSession = options.resetSession;
      }
      if (options?.quarantineSession) {
        payload.quarantineSession = options.quarantineSession;
      }

      const res = await fetch(`/api/campaigns/${campaignId}/tuning`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setTuningToast({
          message: options?.quarantineSession
            ? `Instância ${options.quarantineSession} colocada em quarentena forçada!`
            : options?.resetSession
            ? `Disjuntor de ${options.resetSession} rearmado com sucesso!`
            : 'Novo mapa de calibração gravado com sucesso!',
          type: 'success'
        });
        await fetchDynoData(true);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setTuningToast({
          message: errJson.error || 'Falha ao aplicar novo mapa.',
          type: 'error'
        });
      }
    } catch (err) {
      setTuningToast({ message: 'Erro na requisição de calibração.', type: 'error' });
    } finally {
      setTuningSaving(false);
      setTimeout(() => setTuningToast(null), 4000);
    }
  };

  useEffect(() => {
    if (isOpen && campaignId) {
      fetchDynoData(false);
    } else {
      setData(null);
    }
  }, [isOpen, campaignId]);

  useEffect(() => {
    if (!isOpen || !campaignId || !autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      fetchDynoData(true);
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, campaignId, autoRefresh]);

  if (!isOpen) return null;

  const p = data?.performance;
  const c = data?.counts;
  const datalogger = data?.datalogger || [];

  // Cálculos do Gráfico Datalogger SVG
  const chartWidth = 900;
  const chartHeight = 240;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const maxRpm = Math.max(10, ...datalogger.map(d => d.rpm), ...(selectedChannel ? datalogger.map(d => d.perCylinderRpm?.[selectedChannel] || 0) : []));

  const getX = (idx: number) => {
    if (datalogger.length <= 1) return padLeft + innerW / 2;
    return padLeft + (idx / (datalogger.length - 1)) * innerW;
  };

  const getY = (val: number, maxVal: number) => {
    const clamped = Math.max(0, Math.min(val, maxVal));
    return padTop + innerH - (clamped / maxVal) * innerH;
  };

  // Coordenadas das séries
  const pointsGlobalRpm = datalogger.map((d, i) => `${getX(i)},${getY(d.rpm, maxRpm)}`).join(' ');
  const pointsSuccessRate = datalogger.map((d, i) => `${getX(i)},${getY(d.successRatePercent, 100)}`).join(' ');
  const pointsInfraFailures = datalogger.map((d, i) => `${getX(i)},${getY(d.failed, Math.max(5, maxRpm))}`).join(' ');
  const pointsChannelRpm = selectedChannel
    ? datalogger.map((d, i) => `${getX(i)},${getY(d.perCylinderRpm?.[selectedChannel] || 0, maxRpm)}`).join(' ')
    : '';

  // Área preenchida sob a curva do RPM global
  const areaGlobalRpm = datalogger.length > 0
    ? `${getX(0)},${padTop + innerH} ${pointsGlobalRpm} ${getX(datalogger.length - 1)},${padTop + innerH}`
    : '';

  // Hover Point Selecionado
  const hoveredPoint = hoveredPointIndex !== null && datalogger[hoveredPointIndex] ? datalogger[hoveredPointIndex] : null;

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/75 flex items-center justify-center backdrop-blur-md p-3 sm:p-4" style={{ zIndex: 9999 }}>
        <div className="bg-slate-950 text-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[94vh] flex flex-col border border-slate-800 overflow-hidden font-sans">
          
          {/* Header do Cockpit de Telemetria */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
                <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                    Cockpit de Telemetria & Calibração
                    <span className="text-[10px] bg-slate-800 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono font-medium">
                      PRO TUNER v2.4
                    </span>
                  </h3>
                  {data && (
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                      data.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      data.status === 'PAUSED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      data.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {data.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate max-w-lg">
                  {data?.campaignName || 'Carregando dados da campanha...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
                  autoRefresh
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Atualização automática a cada 3s"
              >
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                {autoRefresh ? 'TELEMETRIA LIVE' : 'PAUSADO'}
              </button>

              <button
                onClick={() => fetchDynoData(false)}
                disabled={loading}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-50 transition"
                title="Sincronizar telemetria agora"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Toast de Notificação do Tuning */}
          {tuningToast && (
            <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b ${
              tuningToast.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-200 border-emerald-800/80'
                : 'bg-rose-950/80 text-rose-200 border-rose-800/80'
            }`}>
              <span>{tuningToast.message}</span>
              <button onClick={() => setTuningToast(null)} className="text-slate-400 hover:text-white ml-2">✕</button>
            </div>
          )}

          {/* Tacômetro & Gauges Rápidos */}
          <div className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">RPM Vazão (5m)</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-extrabold text-amber-400">{p?.rpm5Min ?? 0}</span>
                  <span className="text-[10px] text-slate-500">msg/min</span>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">RPM Médio (15m)</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-extrabold text-slate-200">{p?.rpm15Min ?? 0}</span>
                  <span className="text-[10px] text-slate-500">msg/min</span>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Taxa Entrega</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className={`text-xl font-extrabold ${
                    (p?.successRatePercent || 0) >= 90 ? 'text-emerald-400' :
                    (p?.successRatePercent || 0) >= 70 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {p?.successRatePercent ?? 100}%
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Previsão ETA</span>
                <div className="mt-0.5 text-base font-bold text-slate-100">
                  {p?.etaMinutes !== null ? `~${p?.etaMinutes} min` : 'Em espera'}
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Disjuntores</span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-base font-bold text-emerald-400">{data?.activeSessionsCount ?? 0} ON</span>
                  {(data?.quarantinedSessionsCount || 0) > 0 && (
                    <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-1 rounded">
                      {data?.quarantinedSessionsCount} ISOLADOS
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Progresso</span>
                <div className="mt-0.5 text-xs text-slate-300 font-mono flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">{c?.sent ?? 0}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-slate-400">{c?.total ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Abas de Navegação */}
          <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-950">
            <button
              onClick={() => setActiveTab('DATALOGGER')}
              className={`px-4 py-2 text-xs font-bold tracking-wider rounded-t-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'DATALOGGER'
                  ? 'bg-slate-800 text-amber-400 border-t-2 border-amber-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              DATALOGGER (CURVAS DE VAZÃO)
            </button>

            <button
              onClick={() => setActiveTab('TUNING')}
              className={`px-4 py-2 text-xs font-bold tracking-wider rounded-t-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'TUNING'
                  ? 'bg-slate-800 text-orange-400 border-t-2 border-orange-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              CALIBRAÇÃO & REMAP AO VIVO
            </button>

            <button
              onClick={() => setActiveTab('CYLINDERS')}
              className={`px-4 py-2 text-xs font-bold tracking-wider rounded-t-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'CYLINDERS'
                  ? 'bg-slate-800 text-cyan-400 border-t-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              MATRIZ DE CILINDROS ({data?.cylinders?.length ?? 0})
            </button>

            <button
              onClick={() => setActiveTab('BLACKBOX')}
              className={`px-4 py-2 text-xs font-bold tracking-wider rounded-t-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'BLACKBOX'
                  ? 'bg-slate-800 text-rose-400 border-t-2 border-rose-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CAIXA PRETA / FALHAS ({data?.recentErrors?.length ?? 0})
            </button>
          </div>

          {/* Conteúdo Principal com Scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-950">
            {loading && !data ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Acessando telemetria em tempo real...</span>
              </div>
            ) : data ? (
              <>
                {/* ================= ABA 1: DATALOGGER (GRÁFICOS CONTÍNUOS) ================= */}
                {activeTab === 'DATALOGGER' && (
                  <div className="space-y-4">
                    {/* Header do Gráfico & Seletor de Canal */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                      <div>
                        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                          Curva Contínua de Desempenho e Vazão
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Linha temporal dos disparos agrupados por janela de amostragem.
                        </p>
                      </div>

                      {/* Legenda das Curvas */}
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-1 bg-amber-400 rounded-full" />
                          <span className="text-amber-300 font-semibold text-[11px]">RPM Geral</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-1 bg-emerald-400 rounded-full" />
                          <span className="text-emerald-300 font-semibold text-[11px]">Entrega (%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-1 bg-rose-500 rounded-full" />
                          <span className="text-rose-300 font-semibold text-[11px]">Falhas Infra</span>
                        </div>
                        {selectedChannel && (
                          <div className="flex items-center gap-1.5 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-700/60">
                            <span className="w-3 h-1 bg-cyan-400 rounded-full" />
                            <span className="text-cyan-300 font-bold text-[11px]">Canal: {selectedChannel}</span>
                            <button
                              onClick={() => setSelectedChannel(null)}
                              className="text-slate-400 hover:text-white ml-1 text-xs"
                              title="Limpar isolamento"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Gráfico SVG Estilo EcuTuner / Datalogger */}
                    <div className="relative bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-inner overflow-hidden">
                      {datalogger.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs">
                          <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Nenhum ponto registrado no histórico ainda. Os dados aparecem conforme os disparos ocorrem.
                        </div>
                      ) : (
                        <div className="w-full overflow-x-auto">
                          <svg
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                            className="w-full h-auto min-w-[650px] select-none"
                            onMouseLeave={() => setHoveredPointIndex(null)}
                          >
                            <defs>
                              <linearGradient id="rpmGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                              </linearGradient>
                              <linearGradient id="channelGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Grid Horizontal */}
                            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                              const y = padTop + innerH * (1 - ratio);
                              const val = Math.round(ratio * maxRpm);
                              return (
                                <g key={idx}>
                                  <line
                                    x1={padLeft}
                                    y1={y}
                                    x2={padLeft + innerW}
                                    y2={y}
                                    stroke="#334155"
                                    strokeDasharray="3 3"
                                    strokeWidth="0.8"
                                  />
                                  <text
                                    x={padLeft - 8}
                                    y={y + 3}
                                    textAnchor="end"
                                    fill="#64748b"
                                    fontSize="9"
                                    fontFamily="monospace"
                                  >
                                    {val}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Área do RPM Global */}
                            {areaGlobalRpm && (
                              <polygon points={areaGlobalRpm} fill="url(#rpmGradient)" />
                            )}

                            {/* Linha da Taxa de Entrega (%) */}
                            {pointsSuccessRate && (
                              <polyline
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="1.8"
                                strokeOpacity="0.7"
                                points={pointsSuccessRate}
                              />
                            )}

                            {/* Linha de Falhas de Infraestrutura */}
                            {pointsInfraFailures && (
                              <polyline
                                fill="none"
                                stroke="#f43f5e"
                                strokeWidth="1.8"
                                strokeDasharray="4 2"
                                points={pointsInfraFailures}
                              />
                            )}

                            {/* Linha do RPM Global */}
                            {pointsGlobalRpm && (
                              <polyline
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="2.5"
                                points={pointsGlobalRpm}
                              />
                            )}

                            {/* Linha de Canal Específico (se selecionado) */}
                            {selectedChannel && pointsChannelRpm && (
                              <polyline
                                fill="none"
                                stroke="#06b6d4"
                                strokeWidth="2.2"
                                points={pointsChannelRpm}
                              />
                            )}

                            {/* Pontos Interativos no Hover */}
                            {datalogger.map((d, i) => {
                              const x = getX(i);
                              const y = getY(d.rpm, maxRpm);
                              return (
                                <g
                                  key={i}
                                  onMouseEnter={() => setHoveredPointIndex(i)}
                                  className="cursor-pointer"
                                >
                                  {/* Coluna invisível para captura ampla do mouse */}
                                  <rect
                                    x={x - 12}
                                    y={padTop}
                                    width="24"
                                    height={innerH}
                                    fill="transparent"
                                  />
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r={hoveredPointIndex === i ? 5 : 3}
                                    fill={hoveredPointIndex === i ? '#ffffff' : '#f59e0b'}
                                    stroke="#0f172a"
                                    strokeWidth="1.5"
                                  />
                                </g>
                              );
                            })}

                            {/* Linha guia vertical sob o cursor */}
                            {hoveredPointIndex !== null && (
                              <line
                                x1={getX(hoveredPointIndex)}
                                y1={padTop}
                                x2={getX(hoveredPointIndex)}
                                y2={padTop + innerH}
                                stroke="#f59e0b"
                                strokeWidth="1"
                                strokeDasharray="2 2"
                              />
                            )}

                            {/* Labels do Eixo X (Tempo) */}
                            {datalogger.map((d, i) => {
                              // Mostra labels com espaçamento razoável
                              if (datalogger.length > 10 && i % Math.ceil(datalogger.length / 8) !== 0) return null;
                              return (
                                <text
                                  key={i}
                                  x={getX(i)}
                                  y={chartHeight - 8}
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize="9"
                                  fontFamily="monospace"
                                >
                                  {d.label}
                                </text>
                              );
                            })}
                          </svg>
                        </div>
                      )}

                      {/* Tooltip Detalhado do Cursor */}
                      {hoveredPoint && (
                        <div className="mt-3 bg-slate-950/90 border border-amber-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded">
                              Ponto {hoveredPoint.label}
                            </span>
                            <span className="text-slate-400">
                              Data: {new Date(hoveredPoint.timestamp).toLocaleTimeString('pt-BR')}
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div>
                              <span className="text-slate-500 text-[10px] uppercase font-bold">Vazão Total</span>
                              <p className="font-bold text-amber-400 text-sm">{hoveredPoint.rpm} msg/min</p>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[10px] uppercase font-bold">Taxa Entrega</span>
                              <p className="font-bold text-emerald-400 text-sm">{hoveredPoint.successRatePercent}%</p>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[10px] uppercase font-bold">Enviadas</span>
                              <p className="font-bold text-slate-200 text-sm">{hoveredPoint.sent}</p>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[10px] uppercase font-bold">Falhas Infra</span>
                              <p className="font-bold text-rose-400 text-sm">{hoveredPoint.failed}</p>
                            </div>
                            {selectedChannel && hoveredPoint.perCylinderRpm?.[selectedChannel] !== undefined && (
                              <div className="bg-cyan-950/50 border border-cyan-800 px-2 py-1 rounded">
                                <span className="text-cyan-400 text-[10px] uppercase font-bold">Canal {selectedChannel}</span>
                                <p className="font-bold text-cyan-200 text-sm">
                                  {hoveredPoint.perCylinderRpm[selectedChannel]} msg/min
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Seletor de Instâncias para Isolar Curvas */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                          Isolar Curva Individual de um Cilindro:
                        </span>
                        {selectedChannel && (
                          <button
                            onClick={() => setSelectedChannel(null)}
                            className="text-xs text-amber-400 hover:underline"
                          >
                            Mostrar visão global
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {data.cylinders.map(cyl => {
                          const isSelected = selectedChannel === cyl.sessionName;
                          return (
                            <button
                              key={cyl.sessionName}
                              onClick={() => setSelectedChannel(isSelected ? null : cyl.sessionName)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-2 transition ${
                                isSelected
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20'
                                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${
                                cyl.circuit.state === 'CLOSED' ? 'bg-emerald-400' :
                                cyl.circuit.state === 'HALF_OPEN' ? 'bg-amber-400' : 'bg-rose-500'
                              }`} />
                              <span className="truncate max-w-[140px]">{cyl.sessionName}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {cyl.stats.sent} env
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= ABA 2: TUNING & CALIBRAÇÃO (ECU REMAP) ================= */}
                {activeTab === 'TUNING' && (
                  <div className="space-y-6">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                        <div>
                          <h4 className="text-base font-bold text-orange-400 flex items-center gap-2">
                            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                            </svg>
                            Mapa de Injeção & Cadência dos Disparos
                          </h4>
                          <p className="text-xs text-slate-400 mt-1">
                            Ajuste os parâmetros dinamicamente sem interromper a fila ou perder a posição dos leads.
                          </p>
                        </div>

                        <button
                          onClick={() => handleApplyTuning()}
                          disabled={tuningSaving}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-xs shadow-lg shadow-orange-500/20 disabled:opacity-50 transition"
                        >
                          {tuningSaving ? 'GRAVANDO MAPA...' : 'APLICAR NOVO MAPA'}
                        </button>
                      </div>

                      {/* Slider de Delay Base */}
                      <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                              Cadência Base entre Disparos (Delay Médio)
                            </span>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Tempo médio entre mensagens em cada instância para respeitar limites de rate-limit.
                            </p>
                          </div>
                          <div className="flex items-baseline gap-1 bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg">
                            <span className="text-xl font-mono font-extrabold text-orange-400">{tunedDelay}</span>
                            <span className="text-xs text-slate-400">segundos</span>
                          </div>
                        </div>

                        <input
                          type="range"
                          min="10"
                          max="180"
                          step="5"
                          value={tunedDelay}
                          onChange={(e) => setTunedDelay(parseInt(e.target.value))}
                          className="w-full accent-orange-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                        />

                        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                          <span>10s (Agressivo / Alto Throughput)</span>
                          <span>60s (Padrão Equilibrado)</span>
                          <span>180s (Conservador / Proteção Máxima)</span>
                        </div>

                        {/* Estimativa de Vazão Teórica */}
                        <div className="mt-3 p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                          <span className="text-slate-400">Vazão Teórica Estimada com {data.activeSessionsCount} cilindros ativos:</span>
                          <span className="font-bold text-amber-400 font-mono">
                            ~{tunedDelay > 0 ? ((60 / tunedDelay) * data.activeSessionsCount).toFixed(1) : 0} msg/min
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bancada de Disjuntores & Corte Preventivo por Instância */}
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
                      <div className="mb-4">
                        <h4 className="text-base font-bold text-cyan-400 flex items-center gap-2">
                          <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          Corte Preventivo Individual (Quarentena & Rearme Manual)
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">
                          Você pode desarmar imediatamente qualquer canal instável sem esperar o limite automático, ou forçar o rearme de canais recuperados.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.cylinders.map(cyl => {
                          const isQuarantined = cyl.circuit.state === 'OPEN';
                          return (
                            <div
                              key={cyl.sessionName}
                              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                                isQuarantined
                                  ? 'bg-rose-950/30 border-rose-800/80'
                                  : 'bg-slate-950/60 border-slate-800'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${
                                    isQuarantined ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
                                  }`} />
                                  <span className="font-bold text-xs text-slate-200 truncate max-w-[150px]">
                                    {cyl.sessionName}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 font-mono">
                                  <span>{cyl.stats.sent} ok</span>
                                  <span>•</span>
                                  <span className={cyl.stats.failed > 0 ? 'text-rose-400' : 'text-slate-500'}>
                                    {cyl.stats.failed} err
                                  </span>
                                  <span>•</span>
                                  <span className="text-amber-400">Score {cyl.stats.healthScore}%</span>
                                </div>
                              </div>

                              <div>
                                {isQuarantined ? (
                                  <button
                                    onClick={() => handleApplyTuning({ resetSession: cyl.sessionName })}
                                    disabled={tuningSaving}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition disabled:opacity-50"
                                  >
                                    Rearmar Disjuntor
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleApplyTuning({ quarantineSession: cyl.sessionName })}
                                    disabled={tuningSaving}
                                    className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 font-medium text-xs transition disabled:opacity-50"
                                  >
                                    Isolar Canal
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= ABA 3: MATRIZ DE CILINDROS (DATA ANALYSIS) ================= */}
                {activeTab === 'CYLINDERS' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                        Análise Individualizada de Saúde & Eficiência dos Canais
                      </h4>
                      <span className="text-xs text-slate-400 font-mono">
                        {data.activeSessionsCount} OPERACIONAIS / {data.quarantinedSessionsCount} EM PROTEÇÃO
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {data.cylinders.map(cyl => {
                        const isQuarantined = cyl.circuit.state === 'OPEN';
                        const isHalfOpen = cyl.circuit.state === 'HALF_OPEN';

                        return (
                          <div
                            key={cyl.sessionName}
                            className={`rounded-2xl border p-4 flex flex-col justify-between transition-all ${
                              isQuarantined
                                ? 'bg-rose-950/20 border-rose-800/80 shadow-lg shadow-rose-950/40'
                                : isHalfOpen
                                ? 'bg-amber-950/20 border-amber-800/70'
                                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-100 truncate max-w-[170px]" title={cyl.sessionName}>
                                  {cyl.sessionName}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                  isQuarantined
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                    : isHalfOpen
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                }`}>
                                  {cyl.circuit.state}
                                </span>
                              </div>

                              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                                <span>{cyl.provider}</span>
                                {cyl.mePushName && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate max-w-[110px]" title={cyl.mePushName}>{cyl.mePushName}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Indicadores Técnicos Avançados */}
                            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2.5">
                              {/* Barra de Health Score */}
                              <div>
                                <div className="flex justify-between text-[11px] mb-1 font-medium">
                                  <span className="text-slate-400">Health Score</span>
                                  <span className={`font-bold ${
                                    cyl.stats.healthScore >= 80 ? 'text-emerald-400' :
                                    cyl.stats.healthScore >= 50 ? 'text-amber-400' : 'text-rose-400'
                                  }`}>
                                    {cyl.stats.healthScore}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-500 ${
                                      cyl.stats.healthScore >= 80 ? 'bg-emerald-500' :
                                      cyl.stats.healthScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${cyl.stats.healthScore}%` }}
                                  />
                                </div>
                              </div>

                              {/* Grid de Métricas */}
                              <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-950/60 p-2 rounded-xl border border-slate-800/60">
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-slate-500">Enviadas</span>
                                  <p className="font-bold text-emerald-400 text-sm mt-0.5">{cyl.stats.sent}</p>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-slate-500">Falhas</span>
                                  <p className={`font-bold text-sm mt-0.5 ${cyl.stats.failed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                    {cyl.stats.failed}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-slate-500">RPM (5m)</span>
                                  <p className="font-bold text-amber-400 text-sm mt-0.5">{cyl.stats.rpm5Min}</p>
                                </div>
                              </div>

                              {/* Linha de Latência & Lambda */}
                              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
                                <span>Latência: <strong className="text-slate-200">{cyl.stats.avgLatencyMs || '~'}ms</strong></span>
                                <span>Lambda: <strong className="text-amber-300">{cyl.stats.lambdaRatio ? cyl.stats.lambdaRatio.toFixed(2) : '1.00'}</strong></span>
                              </div>
                            </div>

                            {isQuarantined && cyl.circuit.reopensAt && (
                              <div className="mt-3 text-[10px] text-rose-300 bg-rose-950/70 border border-rose-900 rounded-lg px-2.5 py-1.5">
                                Reabertura preventiva programada: {new Date(cyl.circuit.reopensAt).toLocaleTimeString('pt-BR')}
                              </div>
                            )}

                            {cyl.circuit.lastError && (
                              <div className="mt-2 text-[10px] text-slate-400 truncate font-mono bg-slate-950/80 px-2 py-1 rounded" title={cyl.circuit.lastError}>
                                Erro: {cyl.circuit.lastError}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ================= ABA 4: CAIXA PRETA / FALHAS ================= */}
                {activeTab === 'BLACKBOX' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                        Sensoriamento de Erros e Disparos Falhos Capturados
                      </h4>
                      <span className="text-xs text-slate-400">
                        {data.recentErrors?.length ?? 0} eventos registrados
                      </span>
                    </div>

                    {(!data.recentErrors || data.recentErrors.length === 0) ? (
                      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center text-slate-500 text-xs">
                        Nenhuma falha crítica capturada recentemente nesta campanha.
                      </div>
                    ) : (
                      <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-3">Telefone</th>
                              <th className="py-2.5 px-3">Instância Alocada</th>
                              <th className="py-2.5 px-3">Diagnóstico Defensivo</th>
                              <th className="py-2.5 px-3">Retorno UAZAPI / Provedor</th>
                              <th className="py-2.5 px-3 text-right">Horário</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {data.recentErrors.map(err => (
                              <tr key={err.id} className="hover:bg-slate-800/40">
                                <td className="py-2 px-3 font-mono text-slate-200">{err.contactPhone}</td>
                                <td className="py-2 px-3 text-slate-400 truncate max-w-[140px]" title={err.sessionName || 'N/A'}>
                                  {err.sessionName || 'N/A'}
                                </td>
                                <td className="py-2 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    err.errorClass === 'INFRA'
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  }`}>
                                    {err.errorClass === 'INFRA' ? '🛡️ INFRA (PRESERVADO)' : '❌ CLIENTE INVÁLIDO'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400 truncate max-w-xs font-mono text-[11px]" title={err.errorMessage}>
                                  {err.errorMessage}
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-right font-mono">
                                  {new Date(err.atualizadoEm).toLocaleTimeString('pt-BR')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer do Cockpit */}
          <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono text-[11px]">
              Sincronizado às: {lastFetchedAt ? lastFetchedAt.toLocaleTimeString('pt-BR') : 'Aguardando'}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Cockpit de Telemetria • Torre Central & Guardrails de Alta Performance
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>

        </div>
      </div>
    </Portal>
  );
};
