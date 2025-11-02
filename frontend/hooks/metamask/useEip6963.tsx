import { useEffect, useState } from "react";

export type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns?: string;
  };
  provider: any;
};

declare global {
  interface WindowEventMap {
    eip6963: CustomEvent<Eip6963ProviderDetail>;
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
    "eip6963:requestProvider": CustomEvent;
  }
}

export function useEip6963() {
  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>([]);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    const add = (providerDetail: Eip6963ProviderDetail) => {
      setProviders((prev) => {
        if (prev.some((p) => p.info.uuid === providerDetail.info.uuid)) {
          return prev;
        }
        return [...prev, providerDetail];
      });
    };
    const onAnnounce = (event: WindowEventMap["eip6963:announceProvider"]) =>
      add(event.detail);
    const onAnnounceLegacy = (event: WindowEventMap["eip6963"]) =>
      add(event.detail);

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.addEventListener("eip6963", onAnnounceLegacy);

    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.removeEventListener("eip6963", onAnnounceLegacy);
    };
  }, []);

  return { providers, error } as const;
}


