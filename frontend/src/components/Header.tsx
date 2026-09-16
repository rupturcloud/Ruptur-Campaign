import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../contexts/AuthContext';
import { TenantSelector } from './TenantSelector';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { settings, loading } = useSettings();
  const { user } = useAuth();

  const getUserRoleText = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'Administrador';
      case 'USER':
        return 'Usuário';
      default:
        return 'Usuário';
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-3 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:justify-between">
        {/* Título e Subtítulo */}
        <div className="flex min-w-0 flex-1 items-center space-x-2 sm:space-x-4">
          {/* Logo da empresa no header */}
          <div className="flex min-w-0 items-center space-x-2 sm:space-x-3">
            {!loading && (
              <img
                src={settings?.logoUrl || '/assets/default-logo.png'}
                alt={settings?.companyName || 'Astra Online'}
                className="h-8 max-w-12 shrink-0 object-contain sm:max-w-none"
              />
            )}
            {loading && (
              <div className="h-8 w-24 bg-gray-200 animate-pulse rounded"></div>
            )}
            <div className="min-w-0 border-l border-gray-300 pl-2 sm:pl-3">
              <h1 className="truncate text-lg font-semibold text-gray-900 sm:text-xl">{title}</h1>
              {subtitle && (
                <p className="truncate text-xs text-gray-500 sm:text-sm">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Ações da direita */}
        <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-end sm:space-x-4">
          {/* Tenant Selector */}
          <TenantSelector />

          {/* Avatar do usuário */}
          <div className="flex shrink-0 items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--astra-dark-blue)' }}>
              <span className="text-white text-sm font-medium">
                {user?.nome?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.nome || 'Usuário'}</p>
              <p className="text-xs text-gray-500">{getUserRoleText(user?.role || 'USER')}</p>
            </div>
          </div>

          {/* Ações customizadas */}
          {actions && (
            <div className="flex min-w-0 items-center space-x-2 border-l border-gray-200 pl-2 sm:pl-4">
              {actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
