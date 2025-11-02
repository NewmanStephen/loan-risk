"use client";

export default function GuidePage() {
  return (
    <main className="container">
      <h1>📘 How Loan Risk Assessment Works</h1>

      <div className="card">
        <h3>Inputs (Encrypted on-chain)</h3>
        <ul>
          <li>
            <strong>Credit Score (uint16)</strong>: Typical range 0–850. Higher score lowers risk.
          </li>
          <li>
            <strong>Income (ETH, uint64)</strong>: Entered in ETH on the UI, converted to wei. Contract scales it by 100000 before using. Higher income lowers risk.
          </li>
          <li>
            <strong>Debt Ratio (bps, uint32)</strong>: Basis points of debt ratio, 1500 = 15%. Typical range 0–10000. Higher ratio increases risk.
          </li>
          <li>
            <strong>Lender Address (optional)</strong>: If provided, this address can decrypt your results in addition to you.
          </li>
        </ul>
        <p className="muted">
          All inputs are imported as ciphertexts and never revealed in plaintext on-chain.
        </p>
      </div>

      <div className="card">
        <h3>Outputs (Encrypted, decrypted client-side)</h3>
        <ul>
          <li>
            <strong>Risk Level (euint8)</strong>: 0 = A (Low), 1 = B (Medium), 2 = C (High).
          </li>
          <li>
            <strong>Loan Interest Rate (bps, euint32)</strong>: Displayed as percentage on the UI, e.g., 3800 bps = 38.00%.
          </li>
          <li>
            <strong>Risk Factor (euint32)</strong>: Internal scaled metric used to derive both Risk Level and Loan Interest Rate.
          </li>
        </ul>
        <p className="muted">
          You (and optionally your lender) can decrypt these values via a user decryption signature.
        </p>
      </div>

      <div className="card">
        <h3>Computation Formula</h3>
        <p>
          Risk Factor is computed homomorphically on-chain using your encrypted inputs:
        </p>
        <div className="result-box">
          <p>
            <span className="result-label">Risk Factor:</span>
            risk = 2 × (1000 − creditScore) + 3 × debtRatio(bps) − (incomeWei / 100000), clamped at 0
          </p>
          <p>
            <span className="result-label">Loan Rate (bps):</span>
            loanRateBps = 500 + risk × 1
          </p>
        </div>
        <ul>
          <li><strong>MAX_SCORE</strong> = 1000</li>
          <li><strong>Weights</strong>: W1 = 2, W2 = 3, W3 = 1</li>
          <li><strong>Income scaling</strong>: INCOME_DIV = 100000</li>
          <li><strong>Base Rate</strong>: BASE_RATE_BPS = 500 (5.00%)</li>
          <li><strong>Thresholds</strong>: THRESHOLD_A = 10000, THRESHOLD_B = 50000</li>
        </ul>
      </div>

      <div className="card">
        <h3>Risk Level Thresholds</h3>
        <ul>
          <li>A (0): risk &lt; 10000</li>
          <li>B (1): 10000 ≤ risk &lt; 50000</li>
          <li>C (2): risk ≥ 50000</li>
        </ul>
        <p className="muted">
          Note: With current parameters and non-negative income, Level C is not reachable because the maximum risk is 32000.
        </p>
      </div>

      <div className="card">
        <h3>Units & Ranges</h3>
        <ul>
          <li>Credit Score: uint16 (typ. 300–850)</li>
          <li>Income: ETH input → wei (uint64), scaled by 100000 in formula</li>
          <li>Debt Ratio: basis points (uint32), 0–10000 (e.g., 1500 = 15%)</li>
          <li>Loan Rate: basis points (bps) → displayed as percentage (bps ÷ 100)</li>
        </ul>
      </div>

      <div className="card">
        <h3>Privacy & Access Control</h3>
        <p>
          All computations are performed over ciphertexts (FHE). The borrower can decrypt results, and an optional lender can be granted decryption rights. No plaintext inputs or outputs are stored on-chain.
        </p>
      </div>
    </main>
  );
}


