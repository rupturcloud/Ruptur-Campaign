import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Portal } from './Portal';

interface DataloggerPoint {
  timestamp: string;
  minuteLabel: string;
  rpm: number;
  sent: number;
  failed: number;
  infraErrors: number;
  successRate: number;
  activeCylinders: number;
  perCylinderRpm: Record<string, number>;
  perCylinderStats?: Record<string, { sent: number; failed: number }>;
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
    effectiveRpm?: number;
    nominalRpm?: number;
    etaMinutes: number | null;
    etaFormatted?: string;
    etaBasis?: string;
    successRatePercent: number;
    configuredRandomDelay: number;
  };
  counts: {
    total: number;
    processed?: number;
    remaining?: number;
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

const INSTANCE_PALETTE = [
  '#2563eb', // Blue
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#db2777', // Pink
  '#0891b2', // Cyan
  '#ea580c', // Orange
  '#4f46e5', // Indigo
  '#059669', // Emerald
  '#dc2626', // Red
  '#6366f1', // Violet
  '#ca8a04', // Yellow
];

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

  // Comparativo de instâncias no datalogger (múltiplas selecionadas simultaneamente)
  const [selectedInstances, setSelectedInstances] = useState<Record<string, boolean>>({});
  const [showGlobalRpm, setShowGlobalRpm] = useState(true);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Calibração / Tuning
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

        // Inicializar seleção das instâncias se ainda vazia
        setSelectedInstances(prev => {
          if (Object.keys(prev).length === 0 && json.cylinders) {
            const initialMap: Record<string, boolean> = {};
            json.cylinders.forEach(cyl => {
              initialMap[cyl.sessionName] = true;
            });
            return initialMap;
          }
          return prev;
        });

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
            ? `Instância ${options.quarantineSession} colocada em quarentena defensiva!`
            : options?.resetSession
            ? `Disjuntor de ${options.resetSession} rearmado com sucesso!`
            : 'Novo mapa de calibração gravado com sucesso!',
          type: 'success'
        });
        await fetchDynoData(true);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setTuningToast({
          message: errJson.error || 'Falha ao aplicar mapa.',
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
      setSelectedInstances({});
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

  // Mapa de cores estáveis para cada instância
  const instanceColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!data?.cylinders) return map;
    data.cylinders.forEach((cyl, idx) => {
      map[cyl.sessionName] = INSTANCE_PALETTE[idx % INSTANCE_PALETTE.length];
    });
    return map;
  }, [data?.cylinders]);

  if (!isOpen) return null;

  const p = data?.performance;
  const c = data?.counts;
  const datalogger = data?.datalogger || [];

  // Geometria e Escalas do Gráfico Datalogger SVG
  const chartWidth = 920;
  const chartHeight = 280;
  const padLeft = 50;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  // Encontrar o teto de RPM considerando todas as instâncias e o global
  let maxRpm = Math.max(5, ...datalogger.map(d => d.rpm));
  datalogger.forEach(d => {
    if (d.perCylinderRpm) {
      Object.entries(d.perCylinderRpm).forEach(([sess, val]) => {
        if (selectedInstances[sess]) {
          maxRpm = Math.max(maxRpm, val);
        }
      });
    }
  });

  const getX = (idx: number) => {
    if (datalogger.length <= 1) return padLeft + innerW / 2;
    return padLeft + (idx / (datalogger.length - 1)) * innerW;
  };

  const getY = (val: number, maxVal: number) => {
    const clamped = Math.max(0, Math.min(val, maxVal));
    return padTop + innerH - (clamped / maxVal) * innerH;
  };

  // Curva do RPM Global
  const pointsGlobalRpm = datalogger.map((d, i) => `${getX(i)},${getY(d.rpm, maxRpm)}`).join(' ');
  const areaGlobalRpm = datalogger.length > 0
    ? `${getX(0)},${padTop + innerH} ${pointsGlobalRpm} ${getX(datalogger.length - 1)},${padTop + innerH}`
    : '';

  // Curvas individuais por instância para comparativo
  const cylinderPolylines: Array<{ sessionName: string; color: string; points: string }> = [];
  if (data?.cylinders) {
    data.cylinders.forEach(cyl => {
      if (selectedInstances[cyl.sessionName]) {
        const pts = datalogger
          .map((d, i) => {
            const val = d.perCylinderRpm?.[cyl.sessionName] || 0;
            return `${getX(i)},${getY(val, maxRpm)}`;
          })
          .join(' ');
        cylinderPolylines.push({
          sessionName: cyl.sessionName,
          color: instanceColorMap[cyl.sessionName] || '#3b82f6',
          points: pts
        });
      }
    });
  }

  const hoveredPoint = hoveredPointIndex !== null && datalogger[hoveredPointIndex] ? datalogger[hoveredPointIndex] : null;

  const toggleAllInstances = (select: boolean) => {
    if (!data?.cylinders) return;
    const updated: Record<string, boolean> = {};
    data.cylinders.forEach(cyl => {
      updated[cyl.sessionName] = select;
    });
    setSelectedInstances(updated);
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
        <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col border border-gray-200 overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">

          {/* Header do Cockpit no padrão UI/UX do Ruptur Campaign */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Cockpit de Telemetria
                  </h3>
                  {data && (
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wide ${
                      data.status === 'RUNNING' ? 'bg-green-100 text-green-800 border border-green-200' :
                      data.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                      data.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {data.status === 'RUNNING' ? 'Em Execução' :
                       data.status === 'PAUSED' ? 'Pausada' :
                       data.status === 'COMPLETED' ? 'Concluída' : data.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate max-w-lg">
                  {data?.campaignName || 'Carregando dados da campanha...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border flex items-center gap-1.5 transition ${
                  autoRefresh
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
                title="Atualização automática a cada 3s"
              >
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-ping' : 'bg-gray-400'}`} />
                {autoRefresh ? 'Live (3s)' : 'Pausado'}
              </button>

              <button
                onClick={() => fetchDynoData(false)}
                disabled={loading}
                className="p-1.5 rounded-md bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 disabled:opacity-50 transition"
                title="Sincronizar telemetria"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                title="Fechar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Notificação Toast do Tuning */}
          {tuningToast && (
            <div className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
              tuningToast.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}>
              <span>{tuningToast.message}</span>
              <button onClick={() => setTuningToast(null)} className="text-gray-500 hover:text-gray-700 ml-2">✕</button>
            </div>
          )}

          {/* Métricas Rápidas no Padrão do Sistema Ruptur */}
          {(() => {
            const totalCount = c?.total ?? 0;
            const sentCount = c?.sent ?? 0;
            const failedCount = c?.failed ?? 0;
            const processedCount = c?.processed ?? (sentCount + failedCount);
            const remainingCount = c?.remaining ?? Math.max(0, totalCount - processedCount);
            const percentProcessed = totalCount > 0 ? Math.min(100, Math.round((processedCount / totalCount) * 100)) : 0;
            const percentSent = totalCount > 0 ? Math.min(100, Math.round((sentCount / totalCount) * 100)) : 0;
            const percentFailed = totalCount > 0 ? Math.min(100 - percentSent, Math.round((failedCount / totalCount) * 100)) : 0;

            return (
              <div className="bg-white border-b border-gray-200 px-6 py-3.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {/* 1. Total a Fazer */}
                  <div className="bg-blue-50/50 border border-blue-200/70 rounded-lg p-3 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Total Planejado</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-blue-700">{totalCount}</span>
                      <span className="text-[11px] text-blue-600">leads</span>
                    </div>
                    <span className="text-[10px] text-blue-500 font-medium mt-1">Fila da campanha</span>
                  </div>

                  {/* 2. Disparos J? Feitos */}
                  <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-lg p-3 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wider">Disparos Feitos</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-emerald-700">{sentCount}</span>
                      <span className="text-[11px] text-emerald-600">enviadas</span>
                    </div>
                    <span className={`text-[10px] font-medium mt-1 ${failedCount > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}`}>
                      {failedCount > 0 ? `? ${failedCount} com falha` : '? 0 falhas'}
                    </span>
                  </div>

                  {/* 3. Restam Fazer */}
                  <div className="bg-amber-50/50 border border-amber-200/70 rounded-lg p-3 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">Restam Fazer</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-amber-700">{remainingCount}</span>
                      <span className="text-[11px] text-amber-600">contatos</span>
                    </div>
                    <span className="text-[10px] text-amber-600 font-medium mt-1">
                      {remainingCount === 0 ? 'Fila zerada' : `${c?.pending ?? remainingCount} na fila`}
                    </span>
                  </div>

                  {/* 4. Previs?o de Entrega (ETA) */}
                  <div className="bg-purple-50/50 border border-purple-200/70 rounded-lg p-3 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-purple-900 uppercase tracking-wider">Previs?o (ETA)</span>
                    <div className="mt-1 text-base font-bold text-purple-700 truncate" title={p?.etaFormatted || ''}>
                      {p?.etaFormatted || (p?.etaMinutes !== null ? `~${p?.etaMinutes} min` : 'Em espera')}
                    </div>
                    <span className="text-[10px] text-purple-600 font-medium mt-1 truncate" title={p?.etaBasis || ''}>
                      {p?.etaBasis || (p?.rpm5Min ? `${p.rpm5Min} msg/min atual` : 'Aguardando pulso')}
                    </span>
                  </div>

                  {/* 5. Vaz?o Atual Operacional */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Vaz?o (RPM)</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-gray-800">{p?.rpm5Min ?? 0}</span>
                      <span className="text-[11px] text-gray-500">msg/min</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium mt-1">
                      M?dia 15m: {p?.rpm15Min ?? 0} msg/min
                    </span>
                  </div>

                  {/* 6. Inst?ncias Ativas */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Inst?ncias Ativas</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-2xl font-bold text-gray-800">{data?.activeSessionsCount ?? 0}</span>
                      <span className="text-xs text-gray-500">/ {data?.cylinders?.length ?? 0}</span>
                      {(data?.quarantinedSessionsCount || 0) > 0 && (
                        <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded">
                          {data?.quarantinedSessionsCount} protegidas
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-emerald-600 font-medium mt-1">
                      {p?.successRatePercent ?? 100}% de sucesso
                    </span>
                  </div>
                </div>

                {/* Barra de Progresso Visual de Disparos em Tempo Real */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-800 flex items-center gap-2">
                      <span>Progresso da Campanha:</span>
                      <span className="text-blue-600 font-bold">{percentProcessed}% conclu?do</span>
                    </span>
                    <span className="text-gray-600 font-mono text-[11px]">
                      <strong className="text-gray-900">{processedCount}</strong> de <strong className="text-gray-900">{totalCount}</strong> processados ? <strong className="text-amber-700">{remainingCount}</strong> restantes
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200 flex">
                    <div
                      style={{ width: `${percentSent}%` }}
                      className="bg-emerald-500 transition-all duration-500"
                      title={`${sentCount} enviadas com sucesso`}
                    />
                    {percentFailed > 0 && (
                      <div
                        style={{ width: `${percentFailed}%` }}
                        className="bg-red-500 transition-all duration-500"
                        title={`${failedCount} falhas`}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="flex items-center gap-4 px-6 border-b border-gray-200 bg-white">
            <button
              onClick={() => setActiveTab('DATALOGGER')}
              className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
                activeTab === 'DATALOGGER'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              Datalogger Comparativo
            </button>

            <button
              onClick={() => setActiveTab('TUNING')}
              className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
                activeTab === 'TUNING'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Calibração ao Vivo
            </button>

            <button
              onClick={() => setActiveTab('CYLINDERS')}
              className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
                activeTab === 'CYLINDERS'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Saúde das Instâncias ({data?.cylinders?.length ?? 0})
            </button>

            <button
              onClick={() => setActiveTab('BLACKBOX')}
              className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
                activeTab === 'BLACKBOX'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Caixa Preta de Falhas ({data?.recentErrors?.length ?? 0})
            </button>
          </div>

          {/* Conteúdo com Scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
            {loading && !data ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <span className="text-sm font-medium">Carregando telemetria em tempo real...</span>
              </div>
            ) : data ? (
              <>
                {/* ================= ABA 1: DATALOGGER COMPARATIVO ================= */}
                {activeTab === 'DATALOGGER' && (
                  <div className="space-y-4">
                    {/* Barra de Filtros & Comparativo Multicanal */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            Curvas Comparativas de Vazão por Instância
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Selecione quais instâncias deseja comparar simultaneamente na linha do tempo.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAllInstances(true)}
                            className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition"
                          >
                            Marcar Todas
                          </button>
                          <button
                            onClick={() => toggleAllInstances(false)}
                            className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition"
                          >
                            Desmarcar Todas
                          </button>
                          <label className="flex items-center gap-1.5 text-xs text-gray-700 font-medium ml-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showGlobalRpm}
                              onChange={(e) => setShowGlobalRpm(e.target.checked)}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>Vazão Total da Campanha</span>
                          </label>
                        </div>
                      </div>

                      {/* Seletor de Instâncias com Tags Coloridas */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                        {data.cylinders.map(cyl => {
                          const isChecked = !!selectedInstances[cyl.sessionName];
                          const color = instanceColorMap[cyl.sessionName] || '#3b82f6';

                          return (
                            <button
                              key={cyl.sessionName}
                              onClick={() => {
                                setSelectedInstances(prev => ({
                                  ...prev,
                                  [cyl.sessionName]: !prev[cyl.sessionName]
                                }));
                              }}
                              style={{
                                borderColor: isChecked ? color : '#e5e7eb',
                                backgroundColor: isChecked ? `${color}15` : '#ffffff',
                                color: isChecked ? color : '#6b7280'
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition shadow-sm hover:opacity-90"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: isChecked ? color : '#d1d5db' }}
                              />
                              <span className="truncate max-w-[130px]">{cyl.sessionName}</span>
                              <span className="text-[10px] font-mono opacity-80">
                                ({cyl.stats.sent} env)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Gráfico SVG Técnico Estilo Dyno / Datalogger */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm relative overflow-hidden">
                      {datalogger.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-gray-400 text-xs">
                          <svg className="w-8 h-8 mb-2 opacity-50 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Nenhum ponto registrado no período selecionado.
                        </div>
                      ) : (
                        <div className="w-full overflow-x-auto">
                          <svg
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                            className="w-full h-auto min-w-[700px] select-none"
                            onMouseLeave={() => setHoveredPointIndex(null)}
                          >
                            <defs>
                              <linearGradient id="globalRpmGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Linhas de Grade Horizontais */}
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
                                    stroke="#f1f5f9"
                                    strokeDasharray="4 4"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={padLeft - 10}
                                    y={y + 3}
                                    textAnchor="end"
                                    fill="#94a3b8"
                                    fontSize="10"
                                    fontFamily="sans-serif"
                                  >
                                    {val}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Área Sombreada da Vazão Total (se ativada) */}
                            {showGlobalRpm && areaGlobalRpm && (
                              <polygon points={areaGlobalRpm} fill="url(#globalRpmGradient)" />
                            )}

                            {/* Linha da Vazão Total */}
                            {showGlobalRpm && pointsGlobalRpm && (
                              <polyline
                                fill="none"
                                stroke="#64748b"
                                strokeWidth="2"
                                strokeDasharray="3 3"
                                points={pointsGlobalRpm}
                              />
                            )}

                            {/* Curvas Individuais de Cada Instância Selecionada */}
                            {cylinderPolylines.map(line => (
                              <polyline
                                key={line.sessionName}
                                fill="none"
                                stroke={line.color}
                                strokeWidth="2.5"
                                points={line.points}
                              />
                            ))}

                            {/* Pontos de Captura do Mouse */}
                            {datalogger.map((d, i) => {
                              const x = getX(i);
                              return (
                                <g
                                  key={i}
                                  onMouseEnter={() => setHoveredPointIndex(i)}
                                  className="cursor-pointer"
                                >
                                  <rect
                                    x={x - 10}
                                    y={padTop}
                                    width="20"
                                    height={innerH}
                                    fill="transparent"
                                  />
                                </g>
                              );
                            })}

                            {/* Linha Guia Vertical no Ponto Selecionado */}
                            {hoveredPointIndex !== null && (
                              <line
                                x1={getX(hoveredPointIndex)}
                                y1={padTop}
                                x2={getX(hoveredPointIndex)}
                                y2={padTop + innerH}
                                stroke="#2563eb"
                                strokeWidth="1.5"
                                strokeDasharray="2 2"
                              />
                            )}

                            {/* Labels do Eixo de Tempo X */}
                            {datalogger.map((d, i) => {
                              if (datalogger.length > 10 && i % Math.ceil(datalogger.length / 8) !== 0) return null;
                              return (
                                <text
                                  key={i}
                                  x={getX(i)}
                                  y={chartHeight - 8}
                                  textAnchor="middle"
                                  fill="#64748b"
                                  fontSize="10"
                                  fontFamily="sans-serif"
                                >
                                  {d.minuteLabel}
                                </text>
                              );
                            })}
                          </svg>
                        </div>
                      )}

                      {/* Tooltip Detalhado do Cursor com Comparativo de Instâncias */}
                      {hoveredPoint && (
                        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-gray-200">
                            <span className="font-semibold text-gray-800">
                              Horário: {hoveredPoint.minuteLabel} ({new Date(hoveredPoint.timestamp).toLocaleTimeString('pt-BR')})
                            </span>
                            <span className="text-gray-600 font-medium">
                              Vazão Global: <strong className="text-blue-700">{hoveredPoint.rpm} msg/min</strong> ({hoveredPoint.sent} env / {hoveredPoint.failed} err)
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {data.cylinders.map(cyl => {
                              const sent = hoveredPoint.perCylinderStats?.[cyl.sessionName]?.sent ?? hoveredPoint.perCylinderRpm?.[cyl.sessionName] ?? 0;
                              const failed = hoveredPoint.perCylinderStats?.[cyl.sessionName]?.failed ?? 0;
                              const color = instanceColorMap[cyl.sessionName] || '#3b82f6';

                              return (
                                <div key={cyl.sessionName} className="flex items-center justify-between bg-white px-2 py-1 rounded border border-gray-200">
                                  <div className="flex items-center gap-1.5 truncate max-w-[130px]">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="text-gray-700 font-medium truncate">{cyl.sessionName}</span>
                                  </div>
                                  <div className="font-mono text-gray-900 font-bold ml-1">
                                    {sent} <span className="text-[10px] text-gray-400 font-normal">({failed} err)</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Matriz Comparativa em Tabela (Ranking de Instâncias) */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Matriz Comparativa de Desempenho dos Canais
                        </h4>
                        <span className="text-xs text-gray-500">
                          Total de disparos acumulados na campanha
                        </span>
                      </div>

                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-4">Instância</th>
                            <th className="py-2.5 px-3">Status Circuito</th>
                            <th className="py-2.5 px-3 text-right">Enviados</th>
                            <th className="py-2.5 px-3 text-right">Falhas</th>
                            <th className="py-2.5 px-3 text-right">% Entrega</th>
                            <th className="py-2.5 px-3 text-right">Vazão 5m</th>
                            <th className="py-2.5 px-3 text-right">Score Saúde</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700">
                          {data.cylinders
                            .slice()
                            .sort((a, b) => b.stats.sent - a.stats.sent)
                            .map((cyl, idx) => {
                              const isQuarantined = cyl.circuit.state === 'OPEN';
                              const color = instanceColorMap[cyl.sessionName] || '#3b82f6';
                              const total = cyl.stats.sent + cyl.stats.failed;
                              const rate = total > 0 ? ((cyl.stats.sent / total) * 100).toFixed(1) : '100';

                              return (
                                <tr key={cyl.sessionName} className="hover:bg-gray-50/80">
                                  <td className="py-2.5 px-4 font-medium flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="text-gray-900 truncate max-w-[180px]">{cyl.sessionName}</span>
                                    {idx === 0 && cyl.stats.sent > 0 && (
                                      <span className="px-1.5 py-0.2 text-[9px] bg-blue-100 text-blue-700 rounded font-semibold">Top Canal</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isQuarantined
                                        ? 'bg-red-100 text-red-700 border border-red-200'
                                        : 'bg-green-100 text-green-700 border border-green-200'
                                    }`}>
                                      {cyl.circuit.state}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-gray-900">{cyl.stats.sent}</td>
                                  <td className={`py-2.5 px-3 text-right font-medium ${cyl.stats.failed > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                                    {cyl.stats.failed}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-semibold text-green-600">{rate}%</td>
                                  <td className="py-2.5 px-3 text-right font-mono text-gray-700">{cyl.stats.rpm5Min} msg/m</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-blue-600">{cyl.stats.healthScore}%</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ================= ABA 2: CALIBRAÇÃO & REMAP AO VIVO ================= */}
                {activeTab === 'TUNING' && (
                  <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                        <div>
                          <h4 className="text-base font-semibold text-gray-900">
                            Cadência de Injeção & Controle Dinâmico
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Ajuste os parâmetros dinamicamente sem pausar a campanha ou perder a posição na fila.
                          </p>
                        </div>

                        <button
                          onClick={() => handleApplyTuning()}
                          disabled={tuningSaving}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                        >
                          {tuningSaving ? 'Aplicando...' : 'Gravar Novo Mapa'}
                        </button>
                      </div>

                      {/* Slider de Delay */}
                      <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                              Delay Base entre Envios por Instância
                            </span>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Tempo de pausa randômica para mitigar risco de bloqueio nos chips.
                            </p>
                          </div>
                          <div className="flex items-baseline gap-1 bg-white border border-gray-300 px-3 py-1 rounded-md shadow-sm">
                            <span className="text-lg font-bold text-blue-600">{tunedDelay}</span>
                            <span className="text-xs text-gray-500">segundos</span>
                          </div>
                        </div>

                        <input
                          type="range"
                          min="10"
                          max="180"
                          step="5"
                          value={tunedDelay}
                          onChange={(e) => setTunedDelay(parseInt(e.target.value))}
                          className="w-full accent-blue-600 cursor-pointer h-2 bg-gray-200 rounded-lg"
                        />

                        <div className="flex justify-between text-[11px] text-gray-400">
                          <span>10s (Vazão Agressiva)</span>
                          <span>60s (Padrão Equilibrado)</span>
                          <span>180s (Máxima Preservação)</span>
                        </div>

                        <div className="p-2.5 bg-white rounded-md border border-gray-200 text-xs flex justify-between items-center text-gray-600">
                          <span>Vazão Teórica Estimada ({data.activeSessionsCount} instâncias ativas):</span>
                          <strong className="text-blue-600 font-mono">
                            ~{tunedDelay > 0 ? ((60 / tunedDelay) * data.activeSessionsCount).toFixed(1) : 0} mensagens/minuto
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Disjuntores Individuais */}
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                      <div className="mb-4">
                        <h4 className="text-base font-semibold text-gray-900">
                          Disjuntores & Proteção Individual por Instância
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Isole imediatamente canais instáveis ou reabra disjuntores de chips restabelecidos.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.cylinders.map(cyl => {
                          const isQuarantined = cyl.circuit.state === 'OPEN';
                          return (
                            <div
                              key={cyl.sessionName}
                              className={`p-3.5 rounded-lg border flex items-center justify-between gap-3 ${
                                isQuarantined
                                  ? 'bg-red-50/60 border-red-200'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${isQuarantined ? 'bg-red-500' : 'bg-green-500'}`} />
                                  <span className="font-semibold text-xs text-gray-900 truncate max-w-[160px]">
                                    {cyl.sessionName}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
                                  <span>{cyl.stats.sent} enviados</span>
                                  <span>•</span>
                                  <span className={cyl.stats.failed > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                                    {cyl.stats.failed} falhas
                                  </span>
                                  <span>•</span>
                                  <span className="text-blue-600 font-medium">Score {cyl.stats.healthScore}%</span>
                                </div>
                              </div>

                              <div>
                                {isQuarantined ? (
                                  <button
                                    onClick={() => handleApplyTuning({ resetSession: cyl.sessionName })}
                                    disabled={tuningSaving}
                                    className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium text-xs transition disabled:opacity-50"
                                  >
                                    Rearmar Disjuntor
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleApplyTuning({ quarantineSession: cyl.sessionName })}
                                    disabled={tuningSaving}
                                    className="px-3 py-1.5 rounded-md bg-white hover:bg-red-50 border border-red-300 text-red-700 font-medium text-xs transition disabled:opacity-50"
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

                {/* ================= ABA 3: MATRIZ DE CILINDROS ================= */}
                {activeTab === 'CYLINDERS' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {data.cylinders.map(cyl => {
                        const isQuarantined = cyl.circuit.state === 'OPEN';

                        return (
                          <div
                            key={cyl.sessionName}
                            className={`rounded-xl border p-4 flex flex-col justify-between bg-white shadow-sm transition ${
                              isQuarantined
                                ? 'border-red-300 bg-red-50/20'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm text-gray-900 truncate max-w-[170px]" title={cyl.sessionName}>
                                  {cyl.sessionName}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isQuarantined
                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                    : 'bg-green-100 text-green-700 border border-green-200'
                                }`}>
                                  {cyl.circuit.state}
                                </span>
                              </div>

                              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                <span>{cyl.provider}</span>
                                {cyl.mePushName && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate max-w-[120px]">{cyl.mePushName}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                              {/* Barra de Health Score */}
                              <div>
                                <div className="flex justify-between text-[11px] mb-1">
                                  <span className="text-gray-500">Score de Saúde</span>
                                  <span className={`font-bold ${
                                    cyl.stats.healthScore >= 80 ? 'text-green-600' :
                                    cyl.stats.healthScore >= 50 ? 'text-yellow-600' : 'text-red-600'
                                  }`}>
                                    {cyl.stats.healthScore}%
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-500 ${
                                      cyl.stats.healthScore >= 80 ? 'bg-green-500' :
                                      cyl.stats.healthScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${cyl.stats.healthScore}%` }}
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center text-xs bg-gray-50 p-2 rounded-lg border border-gray-100">
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-gray-400">Enviadas</span>
                                  <p className="font-bold text-green-600 text-sm mt-0.5">{cyl.stats.sent}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-gray-400">Falhas</span>
                                  <p className={`font-bold text-sm mt-0.5 ${cyl.stats.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                    {cyl.stats.failed}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-gray-400">Vazão</span>
                                  <p className="font-bold text-blue-600 text-sm mt-0.5">{cyl.stats.rpm5Min}</p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                                <span>Latência: <strong>{cyl.stats.avgLatencyMs || '~'}ms</strong></span>
                                <span>Lambda: <strong className="text-gray-700">{cyl.stats.lambdaRatio ? cyl.stats.lambdaRatio.toFixed(2) : '1.00'}</strong></span>
                              </div>
                            </div>

                            {isQuarantined && cyl.circuit.reopensAt && (
                              <div className="mt-2.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-1.5">
                                Reabertura preventiva: {new Date(cyl.circuit.reopensAt).toLocaleTimeString('pt-BR')}
                              </div>
                            )}

                            {cyl.circuit.lastError && (
                              <div className="mt-1.5 text-[10px] text-gray-500 truncate" title={cyl.circuit.lastError}>
                                Último erro: {cyl.circuit.lastError}
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
                    {(!data.recentErrors || data.recentErrors.length === 0) ? (
                      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-500 text-xs">
                        Nenhuma falha crítica capturada recentemente nesta campanha.
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] border-b border-gray-200">
                            <tr>
                              <th className="py-2.5 px-4">Telefone</th>
                              <th className="py-2.5 px-3">Instância</th>
                              <th className="py-2.5 px-3">Diagnóstico Defensivo</th>
                              <th className="py-2.5 px-3">Retorno Provedor</th>
                              <th className="py-2.5 px-3 text-right">Horário</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-700">
                            {data.recentErrors.map(err => (
                              <tr key={err.id} className="hover:bg-gray-50">
                                <td className="py-2 px-4 font-mono font-medium text-gray-900">{err.contactPhone}</td>
                                <td className="py-2 px-3 text-gray-600 truncate max-w-[140px]" title={err.sessionName || 'N/A'}>
                                  {err.sessionName || 'N/A'}
                                </td>
                                <td className="py-2 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    err.errorClass === 'INFRA'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}>
                                    {err.errorClass === 'INFRA' ? '🛡️ INFRA (PRESERVADO)' : '❌ CLIENTE INVÁLIDO'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-gray-500 truncate max-w-xs font-mono text-[11px]" title={err.errorMessage}>
                                  {err.errorMessage}
                                </td>
                                <td className="py-2 px-3 text-gray-400 text-right">
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

          {/* Footer no Padrão Ruptur */}
          <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
            <span>
              Sincronizado às: {lastFetchedAt ? lastFetchedAt.toLocaleTimeString('pt-BR') : 'Aguardando'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 hidden sm:inline">
                Cockpit de Telemetria • Torre Central Ruptur
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-md transition"
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
