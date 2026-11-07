import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  role: string;
  current: boolean;
}

export function useTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setToken } = useAuth();

  // Fetch available tenants for the current user
  const fetchTenants = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/user-tenants/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar empresas');
      }

      const data = await response.json();
      if (data.success) {
        setTenants(data.tenants);
        const current = data.tenants.find((t: Tenant) => t.current);
        setCurrentTenant(current || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Switch to a different tenant
  const switchTenant = async (tenantId: string) => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/user-tenants/switch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId }),
      });

      if (!response.ok) {
        throw new Error('Erro ao trocar empresa');
      }

      const data = await response.json();
      if (data.success) {
        // Update token with new tenant context
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('selected_tenant_id', tenantId);
        localStorage.setItem('superadmin_selected_tenant', tenantId);
        setToken(data.token);

        // Update current tenant
        setCurrentTenant(data.tenant);

        // Refresh tenants list to update current status
        await fetchTenants();

        // Reload page to refresh all tenant-specific data
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Fetch current tenant details
  const fetchCurrentTenant = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/user-tenants/current', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar empresa atual');
      }

      const data = await response.json();
      if (data.success) {
        setCurrentTenant(data.tenant);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  return {
    tenants,
    currentTenant,
    loading,
    error,
    fetchTenants,
    switchTenant,
    fetchCurrentTenant,
  };
}