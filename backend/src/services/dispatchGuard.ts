/**
 * Dispatch Guard — proteção de leads e de instâncias no scheduler de campanhas.
 *
 * Regras (ver docs/architecture/PRD_SDD_TORRE_CENTRAL_DINAMOMETRO_DISPAROS.md no repo ruptur):
 *  - Falha de infraestrutura/sessão ANTES do envio (ex.: /chat/check com HTTP 503) não queima o lead:
 *    a mensagem volta para PENDING, com orçamento limitado de re-tentativas.
 *  - Falha de infraestrutura NO envio só é re-enfileirada quando o provedor respondeu explicitamente
 *    com erro (HTTP 5xx/429/401/403) e o conteúdo não é sequência (evita duplicar itens já entregues).
 *  - Resultado incerto (timeout sem resposta) NUNCA é repetido automaticamente (guardrail UNKNOWN_OUTCOME).
 *  - Circuit breaker por instância: N falhas consecutivas abrem o circuito; após cooldown, uma única
 *    tentativa de prova (half-open) decide se fecha ou reabre com cooldown maior.
 *
 * Estado em memória: válido enquanto o backend roda com replicas: 1. Ao escalar horizontalmente,
 * mover este estado para Redis/Postgres (Centralina do Kernel).
 */

export type DispatchErrorClass = 'INFRA' | 'UNKNOWN_OUTCOME' | 'PERMANENT';
export type DispatchPhase = 'CHECK' | 'SEND';

const INFRA_PATTERNS: RegExp[] = [
  /retornou HTTP (5\d\d|429)/i,
  /Token Uazapi inv[aá]lido ou sem permiss[aã]o/i,
  /N[aã]o foi poss[ií]vel acessar o servidor Uazapi/i,
  /Credenciais Uazapi n[aã]o configuradas/i,
  /Conex[aã]o Uazapi n[aã]o encontrada/i,
  /\b(502|503|504)\b/,
  /service unavailable|bad gateway|gateway time-?out/i,
  /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i,
  /session (is )?(not connected|disconnected|closed)|not logged in|logged ?out/i,
];

const UNKNOWN_OUTCOME_PATTERNS: RegExp[] = [
  /Sem confirma[cç][aã]o do Uazapi/i,
  /\btimed? ?out\b|ETIMEDOUT|aborted|AbortError/i,
];

export function classifyDispatchError(message: string | undefined | null): DispatchErrorClass {
  const text = String(message || '');
  if (!text) return 'PERMANENT';
  // Ordem importa: "Sem confirmação" deve vencer qualquer padrão genérico.
  if (UNKNOWN_OUTCOME_PATTERNS.some(p => p.test(text))) return 'UNKNOWN_OUTCOME';
  if (INFRA_PATTERNS.some(p => p.test(text))) return 'INFRA';
  return 'PERMANENT';
}

export interface RequeueDecision {
  requeue: boolean;
  strike: boolean; // conta como falha da instância para o circuit breaker
  reason: string;
}

/**
 * Decide o destino da mensagem após uma falha.
 * @param attempts re-tentativas já consumidas por esta mensagem
 */
export function decideOnFailure(
  error: string | undefined | null,
  phase: DispatchPhase,
  messageType: string,
  attempts: number,
  maxAttempts = 5
): RequeueDecision {
  const cls = classifyDispatchError(error);
  if (cls === 'PERMANENT') return { requeue: false, strike: false, reason: 'PERMANENT' };
  if (cls === 'UNKNOWN_OUTCOME') {
    // Na checagem nada foi enviado ainda: seguro re-tentar. No envio: nunca repetir.
    if (phase === 'CHECK' && attempts < maxAttempts) return { requeue: true, strike: true, reason: 'CHECK_TIMEOUT' };
    return { requeue: false, strike: true, reason: 'UNKNOWN_OUTCOME' };
  }
  // INFRA
  if (attempts >= maxAttempts) return { requeue: false, strike: true, reason: 'RETRY_BUDGET_EXHAUSTED' };
  if (phase === 'SEND' && messageType === 'sequence') {
    return { requeue: false, strike: true, reason: 'SEQUENCE_PARTIAL_RISK' };
  }
  return { requeue: true, strike: true, reason: phase === 'CHECK' ? 'CHECK_INFRA' : 'SEND_INFRA' };
}

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerEntry {
  consecutiveFailures: number;
  state: BreakerState;
  openedAt?: number;
  cooldownMs: number;
  trips: number;
  lastError?: string;
  lastFailureAt?: number;
  lastSuccessAt?: number;
}

export interface BreakerSnapshot {
  session: string;
  state: BreakerState;
  consecutiveFailures: number;
  trips: number;
  lastError?: string;
  lastFailureAt?: string;
  lastSuccessAt?: string;
  reopensAt?: string;
}

export class SessionCircuitBreaker {
  private entries = new Map<string, BreakerEntry>();
  readonly threshold: number;
  readonly baseCooldownMs: number;
  readonly maxCooldownMs: number;

  constructor(
    threshold = 2,
    baseCooldownMs = 10 * 60_000,
    maxCooldownMs = 60 * 60_000
  ) {
    this.threshold = threshold;
    this.baseCooldownMs = baseCooldownMs;
    this.maxCooldownMs = maxCooldownMs;
  }

  private entry(session: string): BreakerEntry {
    let e = this.entries.get(session);
    if (!e) {
      e = { consecutiveFailures: 0, state: 'CLOSED', cooldownMs: this.baseCooldownMs, trips: 0 };
      this.entries.set(session, e);
    }
    return e;
  }

  /** true quando a instância pode receber uma tentativa agora (CLOSED ou prova HALF_OPEN). */
  canUse(session: string, now = Date.now()): boolean {
    const e = this.entries.get(session);
    if (!e || e.state === 'CLOSED') return true;
    if (e.state === 'OPEN' && e.openedAt !== undefined && now - e.openedAt >= e.cooldownMs) {
      e.state = 'HALF_OPEN';
      return true;
    }
    return e.state === 'HALF_OPEN';
  }

  recordSuccess(session: string, now = Date.now()): void {
    const e = this.entry(session);
    e.consecutiveFailures = 0;
    e.state = 'CLOSED';
    e.cooldownMs = this.baseCooldownMs;
    e.openedAt = undefined;
    e.lastSuccessAt = now;
  }

  /** @returns true quando esta falha abriu (ou reabriu) o circuito. */
  recordFailure(session: string, error?: string, now = Date.now()): boolean {
    const e = this.entry(session);
    e.consecutiveFailures += 1;
    e.lastError = error ? String(error).slice(0, 300) : undefined;
    e.lastFailureAt = now;
    if (e.state === 'HALF_OPEN') {
      e.cooldownMs = Math.min(e.cooldownMs * 2, this.maxCooldownMs);
      e.state = 'OPEN';
      e.openedAt = now;
      e.trips += 1;
      return true;
    }
    if (e.state === 'CLOSED' && e.consecutiveFailures >= this.threshold) {
      e.state = 'OPEN';
      e.openedAt = now;
      e.trips += 1;
      return true;
    }
    return false;
  }

  snapshot(session: string): BreakerSnapshot {
    const e = this.entries.get(session);
    if (!e) return { session, state: 'CLOSED', consecutiveFailures: 0, trips: 0 };
    return {
      session,
      state: e.state,
      consecutiveFailures: e.consecutiveFailures,
      trips: e.trips,
      lastError: e.lastError,
      lastFailureAt: e.lastFailureAt ? new Date(e.lastFailureAt).toISOString() : undefined,
      lastSuccessAt: e.lastSuccessAt ? new Date(e.lastSuccessAt).toISOString() : undefined,
      reopensAt: e.state === 'OPEN' && e.openedAt !== undefined ? new Date(e.openedAt + e.cooldownMs).toISOString() : undefined,
    };
  }

  allSnapshots(): BreakerSnapshot[] {
    const list: BreakerSnapshot[] = [];
    for (const session of this.entries.keys()) {
      list.push(this.snapshot(session));
    }
    return list;
  }
}

/** Orçamento de re-tentativas por mensagem (em memória). */
export class RetryBudget {
  private attempts = new Map<string, number>();
  get(messageId: string): number { return this.attempts.get(messageId) || 0; }
  consume(messageId: string): number {
    const next = this.get(messageId) + 1;
    this.attempts.set(messageId, next);
    if (this.attempts.size > 50_000) {
      const oldest = this.attempts.keys().next().value;
      if (oldest !== undefined) this.attempts.delete(oldest);
    }
    return next;
  }
  clear(messageId: string): void { this.attempts.delete(messageId); }
}

export const sessionBreaker = new SessionCircuitBreaker();
export const retryBudget = new RetryBudget();
