# Walkthrough: Dynamic Redemption Size Resolution & Price Feed Settlement Fixes

We have implemented and verified the fixes for the payout redemption `MoveAbort` error, the non-BTC position settlement bug, and the stale oracle liveness bug in Yeti Predict. Below is a detailed walkthrough of the changes.

---

## 💰 1. Dynamic On-Chain Position Size Resolution (Fixed MoveAbort Code 1)

### The Issue:
When a user placed a bet, the UI tracked the position size as a standard unit (e.g. `1.0` LOFI, which is `1,000,000` raw units). However, due to decimals or slippage on-chain, the actual position minted in the prediction manager was sometimes slightly smaller. When trying to redeem this winning position, the transaction was built using the local state size. Because the requested size exceeded the on-chain position size, the smart contract aborted at `predict_manager::decrease_position` instruction 24 with code 1.

Furthermore, we identified three crucial issues preventing the dynamic resolution from identifying and matching the correct position on-chain:
1. **Inverted Direction Mapping**:
   - The contract's `MarketKey` struct maps the direction as `direction: u8` where `0 = Above/Up` and `1 = Below/Down`.
   - The frontend's dynamic resolver mapped `'above'` to `1` and `'below'` to `0`, which was completely inverted. This caused the dynamic query to look for the wrong key and fail to resolve the correct position.
2. **Address Capitalization Sensitivity**:
   - Hex address comparisons between dynamic fields and the oracle ID were case-sensitive, which could cause string mismatches.
3. **Math Precision Rounding Errors**:
   - JS floating-point arithmetic (e.g., `0.249 * 1_000_000`) could lead to slightly truncated values under `Math.floor`, causing a mismatch between the calculated `rawAmount` and the on-chain table size.

### The Fix:
1. **Corrected Direction Mapping**:
   - Updated the mapping in `resolveOnChainPositionSizeAndStrike` inside `ChatInterface.tsx` to:
     ```typescript
     const dirVal = direction === 'above' ? 0 : 1;
     ```
2. **Defensive String Comparison**:
   - Made address comparisons case-insensitive using `.toLowerCase()` inside `resolveOnChainPositionSizeAndStrike`.
3. **Floating-point Rounding (`Math.round`)**:
   - Changed `Math.floor` to `Math.round` in `transactionBuilder.ts` for coin amount scaling and strike price scaling to prevent floating-point precision loss.
4. **Verified via Dry-Run**:
   - Verified that a dry-run of payout redemption on a settled, unredeemed position now completes with **absolute success** on Sui Testnet.

---

## 📈 2. Fixed Background Settlement Price Feed Comparison

### The Issue:
The background settlement checker (which runs every few seconds to check if active positions have expired) was comparing all expired positions against `spotPrice` (which is the BTC spot price). As a result, non-BTC positions (like an ETH bet at strike 3,450) were evaluated against the BTC price (~66,000), causing them to settle incorrectly.

### The Fix:
- Updated the background checking timer loop in `ChatInterface.tsx` to use the asset's specific spot price:
  ```typescript
  const assetSpot = getAssetSpotPrice(pos.asset);
  const won = isAbove ? (assetSpot > strikeVal) : (assetSpot < strikeVal);
  ```
- This ensures that ETH bets are evaluated against `ethSpotPrice` and LOFI bets against `lofiSpotPrice`.

---

## 📝 3. Removed Hardcoded "BTC" in Transaction Builder Descriptions

- Modified `transactionBuilder.ts` to support an optional `asset` parameter in `buildPTB` and `buildPTBInternal`.
- Replaced the hardcoded `"BTC"` string in option minting descriptions with the dynamic `asset` parameter.

---

## ⏳ 4. Rolling 1-Hour Active Timer Fix for Real Mode Bets

- **The Issue**: Active wagers in real mode displayed countdown expiries based directly on the underlying on-chain SVI oracle's expiry time (which ranges from 2 to 5 hours on testnet), whereas wagers are intended to settle in exactly 1 hour.
- **The Fix**: Modified the local position object creation in real mode within `ChatInterface.tsx` to set the local UI `expiryTime` and `settlementTime` parameters to exactly 1 hour from placement (`positionNow + 60 minutes`), matching the behavior of demo mode. The actual on-chain oracle's expiration timestamp continues to be tracked separately under `oracleExpiry` to ensure transaction builder compatibility and dynamic on-chain size verification.

---

## 🕒 5. Robust Active Oracle SVI Resolution (Fixed Stale Oracle / Assert Live Oracle Code 3)

### The Issue:
To place option bets, the frontend needs to retrieve the latest active oracle SVI ID from the contract. Previously, it scanned the contract registry table using five consecutive requests to the Sui Testnet SUI RPC. Due to rate limits or transient errors, this scan often failed, causing the frontend to get stuck on the stale default oracle ID (`0x73f4...`). Because this stale oracle was already settled, the Guardian AI correctly raised a "Hibernating Oracle (Stale Price Feed)" error and disabled the action button. If bypassed, the transaction aborted on-chain with `assert_live_oracle` code 3.

### The Fix:
- **Instant Server-Based Resolution**: Added a fast primary query in `resolveLiveOracle` inside `ChatInterface.tsx` to get the list of active oracles from the Mysten prediction server:
  ```typescript
  const sResp = await fetch(`https://predict-server.testnet.mystenlabs.com/predicts/${PREDICT_CONFIG.PREDICT_OBJECT}/oracles`);
  ```
- **Automated Background Refresh**: Added a background refresh loop that triggers `resolveLiveOracle` every 60 seconds to automatically update the active oracle ID and expiry when the user keeps the application open.
- **Fallback SUI RPC Table Scan**: If the prediction server is offline, the resolver automatically falls back to the on-chain SUI RPC registry scan.

---

## 🛡️ 6. Fixed Pre-flight Check Error for Valid Strikes (Ask Price vs. Bid Price Ratio)

### The Issue:
When a user placed a bet (e.g. `bet 1 LOFI on BTC below 63000`), the pre-flight check failed with `Option Strike Unmintable: The requested strike price is out of the allowed minting bounds relative to the current spot price.` even though the strike price was perfectly valid on-chain.
The safety guardian calls `get_trade_amounts` on-chain, which returns `(ask_amount, bid_amount)`.
- The first return value (index 0) is the `ask_amount` (premium/price paid to mint the option).
- The second return value (index 1) is the `bid_amount` (price the market pays to sell back).
The guardian was incorrectly decoding the second return value (index 1, the bid price) and comparing it against the `1%` premium minimum threshold. For low-volatility/out-of-the-money options (like `below 63000` when spot is `63,677.77`), the bid price falls below `1%` (e.g. `0.09%`) even though the actual premium/ask price is perfectly valid (e.g. `1.09%`). This caused the pre-flight check to fail and block the trade.

### The Fix:
- Modified `guardian.ts` to decode the first return value `returnValues[0][0]` (index 0, `ask_amount`) instead of the second `returnValues[1][0]` (index 1, `bid_amount`) in both the main dry-run check and the candidate recommendations loop.
- This ensures the pre-flight safety check evaluates the actual ask premium/cost of the option on-chain.
- Fixed a TypeScript type-narrowing comparison warning (`TS2367`) inside the `isBtc` block in `guardian.ts` by setting `step` directly to `500`.

---

## 🛡️ 7. LP Vault Withdraw Capital Button in Details Modal

### The Issue:
When a user clicked on an active LP position in the right panel to show the details popup modal, there was only a generic "Close Details" button at the bottom. Users had to manually type the text command `withdraw [amount] LP` in the chat window to withdraw their capital, which was less intuitive than a direct click action.

### The Fix:
- Updated the details modal popup in `ChatInterface.tsx` to check if `selectedPosition.type === 'LP'`.
- Replaced the bottom "Close Details" button with a dynamic **"Withdraw [amount] LP"** (e.g. `Withdraw 10 LP`) button styled with the primary gradient.
- Configured the button click handler to:
  1. Hide the details popup modal.
  2. Automatically submit the text command `withdraw ${selectedPosition.amount} LP` to the agent's intent parser pipeline, initiating the compile, dry-run, and wallet signature flow.
- Non-LP positions (active bets) continue to display the "Close Details" button and a warning note that they cannot be cancelled, avoiding any state tampering.

---

## 🛠️ 8. Build and WSL Sync Verification

- The changes have been synchronized directly to the WSL files.
- Verified production build and typechecking successfully: `npm run build` completes with **zero errors** and outputs production bundle assets.


