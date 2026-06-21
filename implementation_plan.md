# Implementation Plan: Predict Intent Engine

The **Predict Intent Engine** is a modern, chat-based interface that translates plain-English trading requests into **Sui Programmable Transaction Blocks (PTBs)** targeting **DeepBook Predict** on the Sui Testnet. It features a security **Guardian Layer** that checks for risks (such as oracle staleness and high slippage) before prompting the user for approval.

---

## User Review Required

> [!IMPORTANT]
> **API Keys for AI Parsing:** 
> For the hackathon demo, we provide a dual-mode parser:
> 1. **Rule-Based Engine (Default):** Runs locally in the browser to instantly parse common structures (e.g., *"bet 50 USDC on BTC above 72000"*).
> 2. **Gemini API Engine (Optional):** If the user enters a Gemini API key in the UI settings, the app makes real API requests to parse complex, conversational trading intents.
>
> **PredictManager Account ID:**
> If a user does not have a `PredictManager` shared object on-chain, the application compiles a PTB that **automatically initializes a new manager** in the first step and passes it directly as a chained input to subsequent steps. If the user already has one, they can paste its ID into the settings panel.

---

## Proposed Changes

We will build the application using **React, Vite, TypeScript, and Vanilla CSS**. We will install the official Mysten Labs SDKs and build a custom, glassmorphic UI design system.

### Project Configurations & Dependencies

#### [MODIFY] [package.json](file:///C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/package.json)
We will add required dependencies:
- `@mysten/sui` (Sui TS SDK for PTBs and RPC client)
- `@mysten/dapp-kit` (Wallet connection and hook providers)
- `@tanstack/react-query` (Required by dapp-kit for state queries)
- `lucide-react` (For premium UI icons)

---

### Core Service Layer

#### [NEW] [intentParser.ts](file:///C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/src/services/intentParser.ts)
Contains the natural language parser logic:
- Extracts target asset (e.g., BTC), strike price (e.g., $70,000), amount (e.g., 50 USDC), direction (Above/Below), and expiry time.
- Implements fallback/simulated AI responses.
- Implements Gemini SDK call if API key is provided.

#### [NEW] [transactionBuilder.ts](file:///C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/src/services/transactionBuilder.ts)
Builds the Programmable Transaction Block (PTB) using `@mysten/sui/transactions`:
- Connects to DeepBook Predict Testnet package: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`
- Constructs a transaction block that:
  1. Creates a new `PredictManager` object (if `userManagerId` is undefined) and chains its returned reference as the argument to deposit/mint commands.
  2. Deposits quote asset (`dUSDC`) into the manager.
  3. Mints binary call/put options or supplies LP to the vault.

#### [NEW] [guardian.ts](file:///C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/src/services/guardian.ts)
Calculates trading risks by calling the public predict server `https://predict-server.testnet.mystenlabs.com`:
- **Stale Oracle Guard:** Compares the timestamp of the last `oracle::OracleSVI` feed with the current time. If older than 5 minutes, it flags a warning.
- **Slippage Guard:** Compares the user's strike target with the current spot price. If the transaction margin or option price deviates excessively, it flags a warning.

---

### UI Component Layer

#### [NEW] [index.css](file:///C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/src/index.css)
Establish the premium visual design system using vanilla CSS:
- Harmonious dark-mode color scheme (cyan, violet, deep obsidian background, frosted glass).
- Subtle glow effects, hover micro-animations, and smooth chat transitions.

#### [NEW] [WalletProvider.tsx](file:///C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/src/components/WalletProvider.tsx)
Integrates `@mysten/dapp-kit` to connect standard Sui wallets (Sui Wallet, Suiet, zkLogin) configured with new `JsonRpcHTTPTransport` transports to align with Sui SDK 2.0+ exports.

#### [NEW] [ChatInterface.tsx](file:///C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/src/components/ChatInterface.tsx)
The primary user interaction flow:
- Left Panel: Chat input for text commands.
- Center Panel: The "PTB Preview Panel" showing the compiled transaction steps in plain English and the Guardian's safety checks.
- Right Panel: A simple portfolio panel showing active testnet positions and wallet balances.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify there are no TypeScript compilation errors.
- Run `npm run dev` to verify the application loads and runs locally.

### Manual Verification
1. Open the local web app in the browser.
2. Enter a trading prompt like *"Put 20 dUSDC on BTC above 72000"*.
3. Verify the system successfully:
   - Parses the intent.
   - Shows the visual PTB step list (e.g. *Step 1: Create Account*, *Step 2: Split Quote Coin*, *Step 3: Deposit Funds*, *Step 4: Mint Predict Option*).
   - Displays Guardian safety checks (e.g., checking if the oracle is active).
4. Connect a testnet wallet and verify it prompts the user to sign the constructed transaction.
