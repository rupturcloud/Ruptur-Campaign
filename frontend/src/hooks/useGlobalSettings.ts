import { useState, useEffect } from 'react';

interface Settings {
  logoUrl?: string;
  faviconUrl?: string;
  pageTitle?: string;
  iconUrl?: string;
  companyName?: string;
}

export function useGlobalSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadSettings = async () => {
    try {
      // Usar rota pública que não requer autenticação com cache busting
      const response = await fetch('/api/settings/public?v=' + Date.now(), {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSettings({
          logoUrl: data.logoUrl,
          faviconUrl: data.faviconUrl,
          pageTitle: data.pageTitle,
          iconUrl: data.iconUrl,
          companyName: data.companyName
        });
      }
    } catch (err) {
      console.log('Não foi possível carregar configurações globais:', err);
    }
  };

  useEffect(() => {
    loadSettings();

    // Recarregar configurações a cada 30 segundos para detectar mudanças
    const interval = setInterval(loadSettings, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    settings,
    refetch: loadSettings
  };
}
