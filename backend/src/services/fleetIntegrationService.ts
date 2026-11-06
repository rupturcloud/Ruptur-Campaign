import fs from 'fs';

interface MaturityInfo {
  phase: 'COLD' | 'WARMING' | 'WARM' | 'MATURE';
  score: number;
  label: string;
  maxDailyCap: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  recommendedDelaySeconds: number;
}

interface CapacityInfo {
  cap: number;
  used24h: number;
  reserved: number;
  available: number;
  buffer: number;
}

interface DispatchInfo {
  isLocked: boolean;
  campaignId: string | null;
  inCooldown: boolean;
  cooldownRemainingMinutes: number;
  status: 'READY' | 'DISPATCHING' | 'COOLDOWN' | 'RESTRICTED';
}

export interface InstanceFleetTelemetry {
  id: string;
  name: string;
  displayName: string;
  phone: string;
  canonicalState: string;
  healthScore: number;
  maturity: MaturityInfo;
  capacity: CapacityInfo;
  dispatch: DispatchInfo;
}

export interface FleetCapacityOverviewResponse {
  instances: InstanceFleetTelemetry[];
  fleetSummary: {
    totalChips: number;
    connectedChips: number;
    totalCapacityCap: number;
    totalCapacityAvailable: number;
    safeAvgDelaySeconds: number;
  };
}

class FleetIntegrationService {
  private cache: { data: FleetCapacityOverviewResponse; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 6000;
  private bridgeToken: string | null = null;

  private getBridgeToken(): string {
    if (this.bridgeToken) return this.bridgeToken;
    try {
      if (fs.existsSync('/run/secrets/ruptur_chatwoot_bridge_token')) {
        this.bridgeToken = fs.readFileSync('/run/secrets/ruptur_chatwoot_bridge_token', 'utf8').trim();
      } else if (process.env.RUPTUR_BRIDGE_TOKEN) {
        this.bridgeToken = process.env.RUPTUR_BRIDGE_TOKEN.trim();
      }
    } catch {
      this.bridgeToken = '';
    }
    return this.bridgeToken || '';
  }

  async getFleetCapacityOverview(tenantId: string = 'default'): Promise<FleetCapacityOverviewResponse | null> {
    const now = Date.now();
    if (this.cache && (now - this.cache.timestamp) < this.CACHE_TTL_MS) {
      return this.cache.data;
    }

    try {
      const token = this.getBridgeToken();
      const res = await fetch('http://aquecedor_control_plane:8787/api/fleet/capacity-overview', {
        headers: {
          'x-ruptur-bridge-token': token,
          'x-ruptur-actor-role': 'ADMIN',
          'x-ruptur-actor-id': 'campaign-backend',
          'x-ruptur-tenant-id': tenantId
        },
        signal: AbortSignal.timeout(3000)
      });

      if (!res.ok) {
        console.warn(`[FleetIntegration] Erro ao consultar aquecedor: HTTP ${res.status}`);
        return this.cache?.data || null;
      }

      const data = await res.json() as FleetCapacityOverviewResponse;
      this.cache = { data, timestamp: now };
      return data;
    } catch (err: any) {
      console.warn(`[FleetIntegration] Falha de conexão com aquecedor_control_plane: ${err?.message || err}`);
      return this.cache?.data || null;
    }
  }

  async notifyCampaignLock(
    action: 'start' | 'heartbeat' | 'finish',
    campaignId: string,
    sessionNames: string[] = [],
    phones: string[] = [],
    tenantId: string = 'default'
  ): Promise<boolean> {
    try {
      const token = this.getBridgeToken();
      const res = await fetch('http://aquecedor_control_plane:8787/api/fleet/campaign-lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ruptur-bridge-token': token,
          'x-ruptur-actor-role': 'ADMIN',
          'x-ruptur-actor-id': 'campaign-backend',
          'x-ruptur-tenant-id': tenantId
        },
        body: JSON.stringify({ action, campaignId, sessionNames, phones }),
        signal: AbortSignal.timeout(3000)
      });

      if (res.ok) {
        this.cache = null;
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn(`[FleetIntegration] Handshake lock falhou (${action}): ${err?.message || err}`);
      return false;
    }
  }
}

export const fleetIntegrationService = new FleetIntegrationService();
