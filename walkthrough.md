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

## 🛡️ 8. Dynamic Oracle Resolution Fallback for Position Redemption

### The Issue:
When a user placed a bet, the transaction builder resolved the latest active oracle SVI ID and expiry dynamically from on-chain state to compile the PTB. However, when writing the new position into the frontend's local `positions` list state, the code was saving the parameters using the local state variables `oracleSviId` and `oracleExpiry` (which could be stale default fallbacks rather than the actual values resolved for that transaction).
Consequently, when the user tried to redeem their winning position, the dynamic lookup inside `resolveOnChainPositionSizeAndStrike` was querying the Sui node under the stale oracle ID, returning `size = 0` and failing the pre-flight check with a `Position Not Found On-Chain` error.

### The Fix:
1. **Dynamic Intent Parameters Mapping**:
   Updated the post-execution handlers (both in demo-mode and real-mode paths) inside `ChatInterface.tsx` to read the exact oracle ID and expiry from the transaction's message intent:
   - `oracleSviId: (msg.intent as any).oracleSviId || oracleSviId`
   - `oracleExpiry: (msg.intent as any).oracleExpiry || oracleExpiry`
2. **Defensive On-Chain Query Fallback**:
   Added a fallback checking hook inside both compilation (`executeCommandText`) and execution (`handleExecutePTB`) workflows. If querying the Sui node under the saved position parameters returns a size of `0`, the lookup retries using the current active oracle state variables. If this fallback query succeeds:
   - It retrieves the correct size and strike.
   - It automatically updates and corrects the saved `oracleSviId` and `oracleExpiry` parameters of that position inside the local state array.
   - This allows existing active bets placed prior to this patch to be successfully resolved and redeemed without losing state.

---

## 🛡️ 10. Automatic Oracle Settlement Status Polling (Fixed Pre-flight check abort code 9)

### The Issue:
When a user placed a bet and it expired, they would attempt to redeem it. However, if the admin price feed bot had not yet posted the final price and deactivated the oracle on-chain, the transaction dry-run simulation (devInspect) would return `MoveAbort` code 9 ("Oracle Not Settled Yet").
Due to the frontend's local `settledOracles` state never being populated, the frontend could not dynamically detect when an expired oracle was settled on-chain. As a result:
- Expired winning bets remained permanently in the `Settled (Won - Pending)` status.
- The "Redeem Payout" button in the position details modal remained disabled, showing a perpetual "Waiting for On-Chain Settlement..." status.
- If the user bypassed the UI by typing "redeem payouts", the transaction would trigger the dry-run, fail with `MoveAbort 9`, and trigger a pre-flight error warning block in the chat.

### The Fix:
- Added a background polling effect in `ChatInterface.tsx` that triggers every 15 seconds.
- It scans the user's active/settled positions, extracts all unique `oracleSviId`s, and queries their on-chain state via a batch RPC request (`sui_multiGetObjects`).
- If an oracle's fields show a `settlement_price` is present or its `active` status is `false`, the resolver caches it as settled in `settledOracles`.
- This automatically transitions positions from `Settled (Won - Pending)` to `Settled (Won)` and instantly enables the "Redeem Payout" action button as soon as the oracle is settled on-chain, preventing users from executing failing transaction blocks.

---

## 🛠️ 11. Build and WSL Sync Verification

- The changes have been synchronized directly to the WSL files.
- Verified production build and typechecking successfully: `npm run build` completes with **zero errors** and outputs production bundle assets.



