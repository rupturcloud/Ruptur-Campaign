import React, { useState, useEffect, useRef } from 'react';
import { Portal } from './Portal';

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDynoData = async (silent = false) => {
    if (!campaignId) return;
    if (!silent) setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenantId');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (tenantId) headers['X-Tenant-Id'] = tenantId;

      const res = await fetch(`/api/campaigns/${campaignId}/dyno`, { headers });
      if (res.ok) {
        const json: DynoData = await res.json();
        setData(json);
        setLastFetchedAt(new Date());
      }
    } catch (err) {
      console.error('Falha ao obter telemetria do dinamômetro:', err);
    } finally {
      if (!silent) setLoading(false);
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

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
        <div className="bg-slate-900 text-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header do Dinamômetro */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white">
                <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-100 tracking-tight">
                    Dinamômetro da Campanha
                  </h3>
                  {data && (
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider ${
                      data.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      data.status === 'PAUSED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      data.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {data.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate max-w-md">
                  {data?.campaignName || 'Carregando campanha...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition ${
                  autoRefresh
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Atualização automática a cada 3s"
              >
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                {autoRefresh ? 'Live (3s)' : 'Pausado'}
              </button>

              <button
                onClick={() => fetchDynoData(false)}
                disabled={loading}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 disabled:opacity-50 transition"
                title="Recarregar telemetria"
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

          {/* Conteúdo com scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading && !data ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Conectando ao dinamômetro...</span>
              </div>
            ) : data ? (
              <>
                {/* Tacômetro e Relógio Central */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs uppercase font-medium text-slate-400 tracking-wider">RPM Instantâneo (5m)</span>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-amber-400">{p?.rpm5Min ?? 0}</span>
                      <span className="text-xs text-slate-500">msg/min</span>
                    </div>
                    <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-500"
                        style={{ width: `${Math.min(((p?.rpm5Min || 0) / 30) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs uppercase font-medium text-slate-400 tracking-wider">RPM Médio (15m)</span>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-slate-200">{p?.rpm15Min ?? 0}</span>
                      <span className="text-xs text-slate-500">msg/min</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-2">Delay Médio: {p?.configuredRandomDelay || 30}s</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs uppercase font-medium text-slate-400 tracking-wider">ETA (Previsão)</span>
                    <div className="mt-2">
                      <span className="text-2xl font-bold text-slate-100">
                        {p?.etaMinutes !== null ? `~${p?.etaMinutes} min` : 'Calculando...'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-2">{c?.pending ?? 0} pendentes</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs uppercase font-medium text-slate-400 tracking-wider">Taxa de Sucesso</span>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className={`text-3xl font-extrabold ${
                        (p?.successRatePercent || 0) >= 90 ? 'text-emerald-400' :
                        (p?.successRatePercent || 0) >= 70 ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {p?.successRatePercent ?? 100}%
                      </span>
                    </div>
                    <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          (p?.successRatePercent || 0) >= 90 ? 'bg-emerald-500' :
                          (p?.successRatePercent || 0) >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${p?.successRatePercent ?? 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between col-span-2 md:col-span-1">
                    <span className="text-xs uppercase font-medium text-slate-400 tracking-wider">Placar Global</span>
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-emerald-400">Enviadas:</span>
                        <span className="font-bold text-slate-200">{c?.sent ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-rose-400">Falhas:</span>
                        <span className="font-bold text-slate-200">{c?.failed ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total:</span>
                        <span className="font-bold text-slate-400">{c?.total ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Banner de Quarentena / Disjuntores */}
                {data.quarantinedSessionsCount > 0 && (
                  <div className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                        !
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-rose-200">
                          {data.quarantinedSessionsCount} {data.quarantinedSessionsCount === 1 ? 'instância' : 'instâncias'} em Quarentena Defensiva (Circuit Breaker OPEN)
                        </h4>
                        <p className="text-xs text-rose-300/80">
                          O scheduler pausou envios comerciais nessas instâncias após falhas de conexão repetidas. Os leads foram protegidos e preservados como PENDING.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Banco de Cilindros (Instâncias) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                        Cilindros de Disparo ({data.cylinders.length} instâncias alocadas)
                      </h4>
                    </div>
                    <span className="text-xs text-slate-400">
                      {data.activeSessionsCount} ativas / {data.quarantinedSessionsCount} em proteção
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.cylinders.map(cyl => {
                      const isQuarantined = cyl.circuit.state === 'OPEN';
                      const isHalfOpen = cyl.circuit.state === 'HALF_OPEN';

                      return (
                        <div
                          key={cyl.sessionName}
                          className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                            isQuarantined
                              ? 'bg-rose-950/20 border-rose-800/70 shadow-lg shadow-rose-950/50'
                              : isHalfOpen
                              ? 'bg-amber-950/20 border-amber-800/70'
                              : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-slate-100 truncate max-w-[180px]" title={cyl.sessionName}>
                                {cyl.sessionName}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isQuarantined
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                                  : isHalfOpen
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}>
                                {cyl.circuit.state}
                              </span>
                            </div>

                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                              <span>{cyl.provider}</span>
                              {cyl.mePushName && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[120px]" title={cyl.mePushName}>{cyl.mePushName}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
                            <div>
                              <span className="text-[10px] uppercase text-slate-500">Enviadas</span>
                              <p className="font-bold text-emerald-400 text-sm mt-0.5">{cyl.stats.sent}</p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-slate-500">Falhas</span>
                              <p className={`font-bold text-sm mt-0.5 ${cyl.stats.failed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                {cyl.stats.failed}
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-slate-500">RPM (5m)</span>
                              <p className="font-bold text-amber-400 text-sm mt-0.5">{cyl.stats.rpm5Min}</p>
                            </div>
                          </div>

                          {isQuarantined && cyl.circuit.reopensAt && (
                            <div className="mt-2 text-[10px] text-rose-300 bg-rose-950/60 rounded px-2 py-1">
                              Reabertura de teste prevista para: {new Date(cyl.circuit.reopensAt).toLocaleTimeString('pt-BR')}
                            </div>
                          )}

                          {cyl.circuit.lastError && (
                            <div className="mt-1.5 text-[10px] text-slate-400 truncate" title={cyl.circuit.lastError}>
                              Último erro: {cyl.circuit.lastError}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Caixa Preta / Sensoriamento de Erros Recentes */}
                {data.recentErrors && data.recentErrors.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Sensoriamento da Caixa Preta (Últimas Falhas Capturadas)
                    </h4>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">Telefone</th>
                            <th className="py-2.5 px-3">Instância</th>
                            <th className="py-2.5 px-3">Diagnóstico</th>
                            <th className="py-2.5 px-3">Mensagem do Provedor</th>
                            <th className="py-2.5 px-3 text-right">Horário</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {data.recentErrors.map(err => (
                            <tr key={err.id} className="hover:bg-slate-900/40">
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
                                  {err.errorClass === 'INFRA' ? '🛡️ INFRA (RETRY)' : '❌ PERMANENTE'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-400 truncate max-w-xs" title={err.errorMessage}>
                                {err.errorMessage}
                              </td>
                              <td className="py-2 px-3 text-slate-500 text-right">
                                {new Date(err.atualizadoEm).toLocaleTimeString('pt-BR')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer do Dinamômetro */}
          <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-500">
            <span>
              Última sincronização: {lastFetchedAt ? lastFetchedAt.toLocaleTimeString('pt-BR') : 'Nunca'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Torre Central • Proteção Ativa</span>
              <button
                onClick={onClose}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition"
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
