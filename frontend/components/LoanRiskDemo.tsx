"use client";

import { ethers } from "ethers";
import { useCallback, useMemo, useRef, useState } from "react";
import type { FhevmInstance } from "@/fhevm/fhevmTypes";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { GenericStringInMemoryStorage } from "@/fhevm/GenericStringStorage";
import { LoanRiskAddresses } from "@/abi/LoanRiskAddresses";
import { LoanRiskABI } from "@/abi/LoanRiskABI";

type Props = {
  instance: FhevmInstance | undefined;
  chainId: number | undefined;
  signer: ethers.JsonRpcSigner | undefined;
  readonlyProvider: ethers.ContractRunner | undefined;
  sameChain: React.RefObject<(chainId: number | undefined) => boolean>;
  sameSigner: React.RefObject<
    (ethersSigner: ethers.JsonRpcSigner | undefined) => boolean
  >;
};

type ClearValue = { handle: string; clear: string | bigint | boolean };

const storage = new GenericStringInMemoryStorage();

export default function LoanRiskDemo({
  instance,
  chainId,
  signer,
  readonlyProvider,
  sameChain,
  sameSigner,
}: Props) {
  const [message, setMessage] = useState<string>("");
  const [borrower, setBorrower] = useState<string>("");
  const [lender, setLender] = useState<string>("");
  const [creditScore, setCreditScore] = useState<string>("");
  const [income, setIncome] = useState<string>("");
  const [debtRatio, setDebtRatio] = useState<string>("");

  const [riskLevelHandle, setRiskLevelHandle] = useState<string | undefined>(
    undefined
  );
  const [rateHandle, setRateHandle] = useState<string | undefined>(undefined);
  const [riskFactorHandle, setRiskFactorHandle] = useState<string | undefined>(
    undefined
  );
  const [riskLevelClear, setRiskLevelClear] = useState<ClearValue | undefined>(
    undefined
  );
  const [rateClear, setRateClear] = useState<ClearValue | undefined>(undefined);
  const [riskFactorClear, setRiskFactorClear] = useState<
    ClearValue | undefined
  >(undefined);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);

  const isReady = useMemo(() => {
    return Boolean(instance && signer && chainId && readonlyProvider);
  }, [instance, signer, chainId, readonlyProvider]);

  const contractInfo = useMemo(() => {
    if (!chainId) return undefined;
    const entry = LoanRiskAddresses[chainId.toString() as keyof typeof LoanRiskAddresses];
    return {
      address: entry?.address as `0x${string}` | undefined,
      chainId: entry?.chainId ?? chainId,
      chainName: entry?.chainName,
      abi: LoanRiskABI.abi,
    };
  }, [chainId]);

  const canSubmit = useMemo(() => {
    return (
      isReady &&
      contractInfo?.address &&
      creditScore !== "" &&
      income !== "" &&
      debtRatio !== ""
    );
  }, [isReady, contractInfo?.address, creditScore, income, debtRatio]);

  const canFetch = useMemo(() => {
    return isReady && contractInfo?.address && borrower !== "";
  }, [isReady, contractInfo?.address, borrower]);

  const submit = useCallback(async () => {
    if (!instance || !signer || !contractInfo?.address) return;

    try {
      setMessage("🔐 Encrypting your sensitive financial data...");
      await new Promise((r) => setTimeout(r, 50));

      const input = instance.createEncryptedInput(
        contractInfo.address,
        await signer.getAddress()
      );
      input.add16(Number(creditScore));
      const incomeWei = ethers.parseEther(income || "0");
      // Prevent overflow in contract (euint64 -> div 1e5 -> cast to euint32)
      // Pre-scale here by 1e9 so that after contract division by 1e5 the net is 1e14
      const SCALE_1E9 = 1_000_000_000n;
      const incomeForContract = incomeWei / SCALE_1E9; // floor
      input.add64(incomeForContract);
      input.add32(Number(debtRatio));
      const enc = await input.encrypt();

      const contract = new ethers.Contract(
        contractInfo.address,
        contractInfo.abi,
        signer
      );

      setMessage("📤 Submitting encrypted data to blockchain...");
      const tx = await contract.submitAndCompute(
        enc.handles[0],
        enc.handles[1],
        enc.handles[2],
        enc.inputProof,
        lender && ethers.isAddress(lender) ? lender : ethers.ZeroAddress
      );

      setMessage(`⏳ Processing transaction: ${tx.hash.substring(0, 10)}...${tx.hash.substring(tx.hash.length - 8)}`);
      await tx.wait();
      setMessage("✅ Success! Your loan risk has been computed securely.");
    } catch (e) {
      setMessage("❌ Submission failed: " + String(e));
    }
  }, [instance, signer, contractInfo?.address, creditScore, income, debtRatio, lender]);

  const refreshHandles = useCallback(async () => {
    if (!readonlyProvider || !contractInfo?.address || !borrower) return;
    try {
      setMessage("📡 Fetching encrypted data handles from blockchain...");
      const contract = new ethers.Contract(
        contractInfo.address,
        contractInfo.abi,
        readonlyProvider
      );
      const rl = await contract.getRiskLevel(borrower);
      const rt = await contract.getLoanRateBps(borrower);
      const rf = await contract.getRiskFactor(borrower);
      setRiskLevelHandle(rl);
      setRateHandle(rt);
      setRiskFactorHandle(rf);
      setMessage("✅ Successfully retrieved encrypted handles!");
    } catch (e) {
      setMessage("❌ Failed to fetch data: " + String(e));
    }
  }, [readonlyProvider, contractInfo?.address, borrower]);

  const canDecrypt = useMemo(() => {
    return (
      isReady &&
      contractInfo?.address &&
      riskLevelHandle &&
      rateHandle &&
      riskFactorHandle &&
      riskLevelHandle !== ethers.ZeroHash &&
      rateHandle !== ethers.ZeroHash &&
      riskFactorHandle !== ethers.ZeroHash
    );
  }, [isReady, contractInfo?.address, riskLevelHandle, rateHandle, riskFactorHandle]);

  const decrypt = useCallback(async () => {
    if (!instance || !signer || !contractInfo?.address) return;

    const isStale = () =>
      !(sameChain.current?.(chainId) ?? true) ||
      !(sameSigner.current?.(signer) ?? true);

    try {
      setIsDecrypting(true);
      setMessage("🔑 Preparing decryption signature...");
      const sig = await FhevmDecryptionSignature.loadOrSign(
        instance,
        [contractInfo.address],
        signer,
        storage
      );
      if (!sig) {
        setMessage("❌ Unable to build decryption signature. Please try again.");
        return;
      }

      if (!riskLevelHandle || !rateHandle || !riskFactorHandle) return;

      setMessage("🔓 Decrypting your results securely...");

      const decryptionPromise = instance.userDecrypt(
        [
          { handle: riskLevelHandle, contractAddress: contractInfo.address },
          { handle: rateHandle, contractAddress: contractInfo.address },
          { handle: riskFactorHandle, contractAddress: contractInfo.address },
        ],
        sig.privateKey,
        sig.publicKey,
        sig.signature,
        sig.contractAddresses,
        sig.userAddress,
        sig.startTimestamp,
        sig.durationDays
      );

      const timeoutMs = 45000; // 45s timeout to avoid indefinite hang
      const res = await Promise.race([
        decryptionPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Decryption timeout")), timeoutMs)
        ),
      ]);

      if (isStale()) {
        setMessage("⚠️ Session changed. Please refresh and try again.");
        return;
      }

      const mapRes = res as Record<string, string | bigint | boolean>;
      setRiskLevelClear({ handle: riskLevelHandle, clear: mapRes[riskLevelHandle] });
      setRateClear({ handle: rateHandle, clear: mapRes[rateHandle] });
      setRiskFactorClear({ handle: riskFactorHandle, clear: mapRes[riskFactorHandle] });
      setMessage("✅ Decryption successful! Your results are ready.");
    } catch (e) {
      const errMsg = String(e);
      if (errMsg.includes("timeout")) {
        setMessage(
          "⏱️ Decryption took too long. Ensure you're decrypting your own data or that the lender permission is granted, then try again."
        );
      } else {
        setMessage("❌ Decryption failed: " + errMsg);
      }
    }
    finally {
      setIsDecrypting(false);
    }
  }, [instance, signer, contractInfo?.address, riskLevelHandle, rateHandle, sameChain, sameSigner, chainId]);

  const getRiskLevelLabel = (level: string | bigint | boolean) => {
    const levelNum = Number(level);
    if (levelNum === 0) return "A (Excellent)";
    if (levelNum === 1) return "B (Good)";
    if (levelNum === 2) return "C (Fair)";
    return String(level);
  };

  const formatRate = (rate: string | bigint | boolean) => {
    const rateNum = Number(rate);
    return `${(rateNum / 100).toFixed(2)}%`;
  };

  const expectedLevelFromRisk = (risk: number) => {
    if (risk < 10000) return "A (Expected)";
    if (risk < 50000) return "B (Expected)";
    return "C (Expected)";
  };

  return (
    <>
      <div className="card">
        <h3>📝 Submit Financial Information (Encrypted)</h3>
        <p className="muted" style={{ marginBottom: "20px" }}>
          Your financial data will be encrypted before submission. No one can see your actual values on the blockchain.
        </p>
        
        <div className="row">
          <input
            placeholder="Credit Score (e.g., 750)"
            value={creditScore}
            onChange={(e) => setCreditScore(e.target.value)}
            type="number"
          />
          <input
            placeholder="Annual Income in ETH (e.g., 1.5)"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            type="number"
            step="any"
            min="0"
          />
          <input
            placeholder="Debt Ratio in bps (e.g., 1500 = 15%)"
            value={debtRatio}
            onChange={(e) => setDebtRatio(e.target.value)}
            type="number"
          />
        </div>
        
        <div className="row">
          <input
            placeholder="Lender Address (optional - leave empty if not applicable)"
            value={lender}
            onChange={(e) => setLender(e.target.value)}
          />
        </div>
        
        <div className="row">
          <button disabled={!canSubmit} onClick={submit}>
            🔐 Submit & Compute Risk Assessment
          </button>
        </div>
      </div>

      <div className="section-divider"></div>

      <div className="card">
        <h3>🔍 View Loan Risk Results</h3>
        <p className="muted" style={{ marginBottom: "20px" }}>
          Enter a borrower address to fetch and decrypt their encrypted loan risk assessment.
        </p>
        
        <div className="row">
          <input
            placeholder="Enter Borrower Wallet Address"
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
          />
        </div>
        
        <div className="row">
          <button 
            disabled={!canFetch} 
            onClick={refreshHandles}
            className="secondary"
          >
            📡 Fetch Encrypted Data
          </button>
          <button 
            disabled={!canDecrypt || isDecrypting} 
            onClick={decrypt}
          >
            {isDecrypting ? "🔄 Decrypting..." : "🔓 Decrypt Results"}
          </button>
        </div>

        {(riskLevelHandle || rateHandle || riskFactorHandle) && (
          <div style={{ marginTop: "20px" }}>
            <p className="muted" style={{ fontSize: "11px", marginBottom: "8px" }}>
              Encrypted Data Handles (for reference):
            </p>
            {riskLevelHandle && (
              <p className="muted" style={{ fontSize: "11px", wordBreak: "break-all" }}>
                Risk Level: {riskLevelHandle}
              </p>
            )}
            {rateHandle && (
              <p className="muted" style={{ fontSize: "11px", wordBreak: "break-all" }}>
                Loan Rate: {rateHandle}
              </p>
            )}
            {riskFactorHandle && (
              <p className="muted" style={{ fontSize: "11px", wordBreak: "break-all" }}>
                Risk Factor: {riskFactorHandle}
              </p>
            )}
          </div>
        )}

        {(riskLevelClear || rateClear || riskFactorClear) && (
          <div className="result-box">
            <h4 style={{ color: "#1e3a8a", marginTop: 0, marginBottom: "12px" }}>
              📊 Decrypted Results
            </h4>
            {riskLevelClear && (
              <p>
                <span className="result-label">Risk Level:</span>
                {getRiskLevelLabel(riskLevelClear.clear)}
              </p>
            )}
            {rateClear && (
              <p>
                <span className="result-label">Loan Interest Rate:</span>
                {formatRate(rateClear.clear)}
              </p>
            )}
            {riskFactorClear && (
              <p>
                <span className="result-label">Risk Factor (raw):</span>
                {String(riskFactorClear.clear)} {"  "}
                <span className="muted" style={{ marginLeft: 8 }}>
                  {expectedLevelFromRisk(Number(riskFactorClear.clear))}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {message && (
        <div className="card" style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", border: "2px solid #fbbf24" }}>
          <p style={{ margin: 0, color: "#78350f", fontWeight: "500" }}>
            {message}
          </p>
        </div>
      )}
    </>
  );
}


