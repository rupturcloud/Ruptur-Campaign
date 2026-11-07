import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

interface TenantContextType {
  tenants: Tenant[];
  selectedTenantId: string;
  selectedTenant: Tenant | null;
  setSelectedTenantId: (id: string) => void;
  loading: boolean;
  refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Helper para fazer requisições autenticadas
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('auth_token');
    const savedTenantId = localStorage.getItem('selected_tenant_id');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }

    // Adicionar tenant ID no header para SuperAdmin
    if (savedTenantId) {
      (headers as Record<string, string>)['X-Tenant-Id'] = savedTenantId;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  const loadTenants = async () => {
    if (user?.role !== 'SUPERADMIN') {
      // Para usuários ADMIN/USER, usar o tenantId do próprio usuário
      if (user?.tenantId) {
        setSelectedTenantId(user.tenantId);
        localStorage.setItem('selected_tenant_id', user.tenantId);
      } else {
        // Se não tem tenantId, limpar localStorage antigo
        localStorage.removeItem('selected_tenant_id');
      }
      setLoading(false);
      return;
    }

    try {
      const response = await authenticatedFetch('/api/tenants');
      if (response.ok) {
        const data = await response.json();
        const tenantsArray = data.tenants || [];
        setTenants(tenantsArray);

        // Carregar tenant selecionado do localStorage ou selecionar primeiro
        const savedTenantId = localStorage.getItem('selected_tenant_id') || localStorage.getItem('superadmin_selected_tenant');
        if (savedTenantId && tenantsArray.some((t: Tenant) => t.id === savedTenantId)) {
          setSelectedTenantId(savedTenantId);
          localStorage.setItem('selected_tenant_id', savedTenantId);
          localStorage.setItem('superadmin_selected_tenant', savedTenantId);
        } else {
          if (savedTenantId) {
            console.warn('TenantId salvo no localStorage é inválido, limpando:', savedTenantId);
            localStorage.removeItem('selected_tenant_id');
            localStorage.removeItem('superadmin_selected_tenant');
          }

          if (tenantsArray.length > 0) {
            const defaultTenant = tenantsArray.find((t: Tenant) => t.slug === 'ruptur' || t.name === 'Ruptur') || tenantsArray[0];
            setSelectedTenantId(defaultTenant.id);
            localStorage.setItem('selected_tenant_id', defaultTenant.id);
            localStorage.setItem('superadmin_selected_tenant', defaultTenant.id);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const refreshTenants = async () => {
    setLoading(true);
    await loadTenants();
  };

  useEffect(() => {
    loadTenants();
  }, [user]);

  // Salvar tenant selecionado no localStorage
  useEffect(() => {
    if (selectedTenantId) {
      localStorage.setItem('selected_tenant_id', selectedTenantId);
      localStorage.setItem('superadmin_selected_tenant', selectedTenantId);
    }
  }, [selectedTenantId]);

  const selectedTenant = tenants.find(t => t.id === selectedTenantId) || null;

  const value: TenantContextType = {
    tenants,
    selectedTenantId,
    selectedTenant,
    setSelectedTenantId,
    loading,
    refreshTenants,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant deve ser usado dentro de um TenantProvider');
  }
  return context;
}
