// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint16, euint32, euint64, externalEuint8, externalEuint16, externalEuint32, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title LoanRisk - Privacy-preserving loan risk pricing using Zama FHEVM
/// @notice Borrowers upload encrypted credit data; the contract computes encrypted risk and rate
/// @dev Uses FHEVM for homomorphic encryption operations
contract LoanRisk is ZamaEthereumConfig {
    struct BorrowerData {
        euint16 creditScore;      // e.g., 300..850
        euint64 income;           // raw income amount in smallest unit
        euint32 debtRatioBps;     // debt ratio in basis points (0..10000)

        euint32 riskFactor;       // internal computed metric (scaled)
        euint32 loanRateBps;      // loan interest rate in basis points
        euint8 riskLevel;         // 0=A, 1=B, 2=C
    }

    mapping(address => BorrowerData) private _borrowers;

    event Submitted(address indexed borrower, address indexed lender);
    event Computed(address indexed borrower);

    // ---------------------------
    // Parameters (plaintext)
    // ---------------------------
    uint32 private constant MAX_SCORE = 1000;      // normalize credit score
    uint32 private constant W1 = 2;                // weight for credit score term
    uint32 private constant W2 = 3;                // weight for debt ratio term
    uint32 private constant W3 = 1;                // weight for income term (subtracted)
    uint32 private constant INCOME_DIV = 100000;   // scale down income to avoid overflow
    uint32 private constant BASE_RATE_BPS = 500;   // 5.00%
    uint32 private constant RATE_K = 1;            // linear scaling factor
    uint32 private constant THRESHOLD_A = 10000;   // risk thresholds for levels
    uint32 private constant THRESHOLD_B = 50000;

    /// @notice Submit encrypted inputs and compute encrypted outputs in one call
    /// @param encCreditScore external encrypted credit score (euint16 handle)
    /// @param encIncome external encrypted income (euint64 handle)
    /// @param encDebtRatioBps external encrypted debt ratio in bps (euint32 handle)
    /// @param inputProof Relayer SDK input proof corresponding to the provided handles
    /// @param lender Address to grant decryption rights to (optional, use 0x0 to skip)
    function submitAndCompute(
        externalEuint16 encCreditScore,
        externalEuint64 encIncome,
        externalEuint32 encDebtRatioBps,
        bytes calldata inputProof,
        address lender
    ) external {
        // Import external encrypted inputs
        euint16 creditScore = FHE.fromExternal(encCreditScore, inputProof);
        euint64 income = FHE.fromExternal(encIncome, inputProof);
        euint32 debtRatioBps = FHE.fromExternal(encDebtRatioBps, inputProof);

        BorrowerData storage b = _borrowers[msg.sender];
        b.creditScore = creditScore;
        b.income = income;
        b.debtRatioBps = debtRatioBps;

        // ---------------------------
        // Risk factor computation
        // riskFactor = W1*(MAX_SCORE - creditScore) + W2*debtRatioBps - W3*(income/INCOME_DIV)
        // All operations are homomorphic over ciphertexts with scalar (plaintext) multipliers
        // ---------------------------
        euint32 cs32 = FHE.asEuint32(creditScore);
        euint32 maxScore = FHE.asEuint32(MAX_SCORE);
        euint32 creditTerm = FHE.mul(FHE.sub(maxScore, cs32), W1);

        euint32 debtTerm = FHE.mul(debtRatioBps, W2);

        // Scale income down by plaintext divisor then cast to euint32
        euint64 incomeScaled64 = FHE.div(income, INCOME_DIV);
        euint32 incomeScaled32 = FHE.asEuint32(incomeScaled64);
        euint32 incomeTerm = FHE.mul(incomeScaled32, W3);

        // risk = max( creditTerm + debtTerm - incomeTerm, 0 )
        // IMPORTANT: avoid unsigned underflow by selecting 0 if incomeTerm > tmp
        euint32 tmp = FHE.add(creditTerm, debtTerm);
        ebool isNeg = FHE.lt(tmp, incomeTerm);
        euint32 diff = FHE.sub(tmp, incomeTerm);
        euint32 risk = FHE.select(isNeg, FHE.asEuint32(0), diff);
        b.riskFactor = risk;

        // loanRate = BASE + risk * RATE_K
        b.loanRateBps = FHE.add(FHE.asEuint32(BASE_RATE_BPS), FHE.mul(risk, RATE_K));

        // Risk level classification: 0=A, 1=B, 2=C
        ebool isA = FHE.lt(risk, FHE.asEuint32(THRESHOLD_A));
        ebool isB = FHE.lt(risk, FHE.asEuint32(THRESHOLD_B));
        euint8 levelA = FHE.asEuint8(0);
        euint8 levelB = FHE.asEuint8(1);
        euint8 levelC = FHE.asEuint8(2);
        euint8 ab = FHE.select(isB, levelB, levelC);
        b.riskLevel = FHE.select(isA, levelA, ab);

        // Grant ACL permissions for decryption (persistent)
        FHE.allowThis(b.riskFactor);
        FHE.allowThis(b.loanRateBps);
        FHE.allowThis(b.riskLevel);

        // Borrower can decrypt
        FHE.allow(b.riskFactor, msg.sender);
        FHE.allow(b.loanRateBps, msg.sender);
        FHE.allow(b.riskLevel, msg.sender);

        // Lender can decrypt if provided
        if (lender != address(0)) {
            FHE.allow(b.riskFactor, lender);
            FHE.allow(b.loanRateBps, lender);
            FHE.allow(b.riskLevel, lender);
        }

        emit Submitted(msg.sender, lender);
        emit Computed(msg.sender);
    }

    /// @notice Manually grant (persistent) decryption access to a target address for caller's outputs
    function grantAccess(address target) external {
        BorrowerData storage b = _borrowers[msg.sender];
        FHE.allow(b.riskFactor, target);
        FHE.allow(b.loanRateBps, target);
        FHE.allow(b.riskLevel, target);
    }

    /// @notice Get encrypted risk level for a borrower (0=A,1=B,2=C)
    function getRiskLevel(address borrower) external view returns (euint8) {
        return _borrowers[borrower].riskLevel;
    }

    /// @notice Get encrypted loan rate (in basis points) for a borrower
    function getLoanRateBps(address borrower) external view returns (euint32) {
        return _borrowers[borrower].loanRateBps;
    }

    /// @notice Get encrypted risk factor for a borrower (internal scaled metric)
    function getRiskFactor(address borrower) external view returns (euint32) {
        return _borrowers[borrower].riskFactor;
    }
}


