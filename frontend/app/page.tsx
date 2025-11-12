"use client";

import { useMemo } from "react";
import { useMetaMaskEthersSigner } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { useFhevm } from "@/fhevm/useFhevm";
import LoanRiskDemo from "@/components/LoanRiskDemo";
import Link from "next/link";

export default function Page() {
  const {
    chainId,
    provider,
    connect,
    accounts,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
    isConnected,
    initialMockChains,
  } = useMetaMaskEthersSigner();

  const enabled = useMemo(() => Boolean(provider && chainId), [provider, chainId]);

  const { instance, status, error } = useFhevm({
    provider: provider,
    chainId,
    enabled,
    initialMockChains,
  });

  const getStatusBadgeClass = () => {
    if (status === "ready") return "status-badge status-success";
    if (status === "loading") return "status-badge status-info";
    if (error) return "status-badge status-error";
    return "status-badge status-warning";
  };

  const getStatusMessage = () => {
    if (status === "ready") return "Ready";
    if (status === "loading") return "Initializing...";
    if (error) return "Connection Error";
    return status;
  };

  // Format address for display
  const formatAddress = (addr?: string) => addr ?? "-";

  return (
    <main className="container">
      <h1>🔐 Privacy-Preserving Loan Risk Assessment</h1>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: "-12px", marginBottom: "12px" }}>
        <Link href="/guide" style={{ textDecoration: "none" }}>
          <button className="secondary">Learn how it works</button>
        </Link>
      </div>
      
      {!isConnected ? (
        <div className="card connect-prompt">
          <p>Welcome! Please connect your MetaMask wallet to get started.</p>
          <button onClick={connect}>Connect Wallet</button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row">
              <div>
                <span className="muted">Connected Wallet:</span>
                <span className="status-badge status-info" style={{ marginLeft: "12px", fontFamily: "monospace" }}>
                  {accounts?.[0] ?? "-"}
                </span>
              </div>
            </div>
            <div className="row">
              <div>
                <span className="muted">Encrypted Computation System Status:</span>
                <span className={getStatusBadgeClass()} style={{ marginLeft: "12px" }}>
                  {getStatusMessage()}
                </span>
              </div>
            </div>
            {error && (
              <div className="row">
                <span className="status-badge status-error">
                  ⚠️ {String(error)}
                </span>
              </div>
            )}
          </div>

          <LoanRiskDemo
            instance={instance}
            chainId={chainId}
            signer={ethersSigner}
            readonlyProvider={ethersReadonlyProvider}
            sameChain={sameChain}
            sameSigner={sameSigner}
          />
        </>
      )}
    </main>
  );
}


