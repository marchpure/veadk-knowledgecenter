import { useRouter } from 'next/router';
import { createContext, useContext, useEffect, useState } from 'react';
import { getUserConfig, UserConfig } from '@/utils/env';
import { trackUserTelemetry } from '@/utils/telemetry';

type ContextProps = {
  config?: UserConfig | null;
};

const GlobalConfigContext = createContext<ContextProps>({});

const fallbackConfig: UserConfig = {
  isTelemetryEnabled: false,
  telemetryKey: '',
  telemetryHost: '',
  userUUID: '',
};

export const GlobalConfigProvider = ({ children }) => {
  const router = useRouter();
  const [config, setConfig] = useState<UserConfig | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;

    getUserConfig()
      .then((config) => {
        if (disposed) return;
        setConfig(config);
        // telemetry setup
        cleanup = trackUserTelemetry(router, config);
      })
      .catch(() => {
        if (!disposed) setConfig(fallbackConfig);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [router]);

  const value = {
    config,
  };

  return (
    <GlobalConfigContext.Provider value={value}>
      {children}
    </GlobalConfigContext.Provider>
  );
};

export default function useGlobalConfig() {
  return useContext(GlobalConfigContext);
}
