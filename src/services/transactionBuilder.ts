import { Transaction } from '@mysten/sui/transactions';

// Current Sui Testnet contract configurations for Yeti Predict
export const PREDICT_CONFIG = {
  PACKAGE_ID: '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  REGISTRY_ID: '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64',
  PREDICT_OBJECT: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  DEFAULT_ORACLE_SVI: '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4',
  QUOTE_TYPE: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'
};

export interface PTBStep {
  index: number;
  action: string;
  details: string;
}

export interface CompiledPTB {
  tx: Transaction;
  steps: PTBStep[];
  description: string;
  serializedTx?: string;
  mappedStrike?: number;
}

/**
 * Compiles a new PredictManager creation transaction block.
 */
function buildCreateManagerPTBInternal(): CompiledPTB {
  const tx = new Transaction();
  const steps: PTBStep[] = [
    {
      index: 1,
      action: 'Create Predict Manager',
      details: 'Initialize your shared Predict Manager account on-chain to enable trading.'
    }
  ];
  
  tx.moveCall({
    target: `${PREDICT_CONFIG.PACKAGE_ID}::predict::create_manager`,
    arguments: []
  });

  return {
    tx,
    steps,
    description: 'Creating a new Yeti Predict Manager account.'
  };
}

export function buildCreateManagerPTB(): CompiledPTB {
  const result = buildCreateManagerPTBInternal();
  result.serializedTx = result.tx.serialize();
  return result;
}

/**
 * Compiles a parsed intent into a Sui Programmable Transaction Block (PTB).
 * Also returns a list of human-readable steps for the UI preview.
 */
function buildPTBInternal(
  action: 'mint' | 'supply' | 'redeem' | 'withdraw' | 'withdraw_manager' | 'vault_balance' | 'unknown',
  amount: number,
  strike?: number,
  direction?: 'above' | 'below',
  userManagerId?: string,
  dUsdcCoins: Array<{ coinObjectId: string; balance: string }> = [],
  oracleSviId: string = PREDICT_CONFIG.DEFAULT_ORACLE_SVI,
  userAddress?: string,
  plpCoins: Array<{ coinObjectId: string; balance: string }> = [],
  oracleExpiry: number = 1781445600000,
  btcSpotPrice?: number,
  wagerAsset: string = 'SUI',
  asset?: string
): CompiledPTB {
  const tx = new Transaction();
  const steps: PTBStep[] = [];
  const expiryDateStr = new Date(oracleExpiry).toLocaleString();
  
  // Map non-BTC strikes to a valid BTC strike to prevent MoveAbort on-chain
  let effectiveStrike = strike;
  if (strike !== undefined && strike < 10000) {
    const spot = btcSpotPrice && btcSpotPrice > 0 ? btcSpotPrice : 63500;
    if (direction === 'above') {
      effectiveStrike = Math.floor(spot) + 100;
    } else if (direction === 'below') {
      effectiveStrike = Math.floor(spot) - 100;
    } else {
      effectiveStrike = Math.floor(spot);
    }
  }

  // We deal in standard decimals (6 decimals for USDC/dUSDC under the hood)
  const rawAmount = Math.round(amount * 1_000_000);

  if (action === 'mint' && strike && direction) {
    if (!userManagerId) {
      throw new Error("Sui Yeti Predict requires a Predict Manager account. Please initialize your account first.");
    }
    
    const isAbove = direction === 'above';
    const targetManager = tx.object(userManagerId);
    
    steps.push({
      index: 1,
      action: 'Reference Account',
      details: `Use your existing Predict Manager account object (${userManagerId.substring(0, 8)}...).`
    });

    // Step 2: Merge and split dUSDC coins
    if (dUsdcCoins.length === 0) {
      throw new Error(`No ${wagerAsset} coins found in your wallet. Yeti Predict requires SUI/LOFI to trade. Please request some from the faucet link in the sidebar.`);
    }

    const totalBalance = dUsdcCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    const needed = BigInt(rawAmount);
    if (totalBalance < needed) {
      throw new Error(`Insufficient balance. You are trying to bet ${amount} ${wagerAsset}, but your wallet only contains ${(Number(totalBalance) / 1_000_000).toFixed(2)} ${wagerAsset}.`);
    }

    const primaryCoin = tx.object(dUsdcCoins[0].coinObjectId);
    if (dUsdcCoins.length > 1) {
      tx.mergeCoins(primaryCoin, dUsdcCoins.slice(1).map(c => tx.object(c.coinObjectId)));
    }
    const [coin] = tx.splitCoins(primaryCoin, [tx.pure.u64(rawAmount)]);

    steps.push({
      index: 2,
      action: 'Split Quote Coin',
      details: `Prepare exactly ${amount} ${wagerAsset} from your wallet balance to place the bet.`
    });

    // Step 3: Deposit quote coin into the PredictManager
    tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::predict_manager::deposit`,
      typeArguments: [PREDICT_CONFIG.QUOTE_TYPE],
      arguments: [targetManager, coin]
    });
    steps.push({
      index: 3,
      action: 'Deposit Funds',
      details: `Deposit the ${amount} ${wagerAsset} into your Predict Manager account.`
    });

    // Step 4: Construct MarketKey (pure struct value)
    const marketKey = tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::market_key::new`,
      arguments: [
        tx.pure.address(oracleSviId),
        tx.pure.u64(oracleExpiry), // Expiry timestamp of the active Testnet oracle
        tx.pure.u64(Math.round(effectiveStrike! * 1_000_000_000)), // Strike price scaled to 9 decimals
        tx.pure.bool(isAbove)
      ]
    });
    steps.push({
      index: 4,
      action: 'Construct Market Key',
      details: `Create market identifier for strike $${strike.toLocaleString()} expiring ${expiryDateStr}.`
    });

    // Step 5: Mint option position
    tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::predict::mint`,
      typeArguments: [PREDICT_CONFIG.QUOTE_TYPE],
      arguments: [
        tx.object(PREDICT_CONFIG.PREDICT_OBJECT), // Param 0: &mut Predict
        targetManager, // Param 1: &mut PredictManager
        tx.object(oracleSviId), // Param 2: &OracleSVI
        marketKey, // Param 3: MarketKey
        tx.pure.u64(rawAmount), // Param 4: size / amount (6 decimals)
        tx.object('0x6') // Param 5: &Clock
      ]
    });

    steps.push({
      index: 5,
      action: 'Mint Predict Option',
      details: `Mint binary ${direction.toUpperCase()} option at strike $${strike.toLocaleString()} using deposited ${wagerAsset}.`
    });

    return {
      tx,
      steps,
      description: `Minting a ${direction.toUpperCase()} option on ${asset || 'BTC'} at strike $${strike.toLocaleString()} with ${amount} ${wagerAsset}.`,
      mappedStrike: effectiveStrike
    };
  } 
  
  if (action === 'supply') {
    // Step 1: Merge and split dUSDC coins
    if (dUsdcCoins.length === 0) {
      throw new Error(`No ${wagerAsset} coins found in your wallet. Yeti Predict requires SUI/LOFI to trade. Please request some from the faucet link in the sidebar.`);
    }

    const totalBalance = dUsdcCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    const needed = BigInt(rawAmount);
    if (totalBalance < needed) {
      throw new Error(`Insufficient balance. You are trying to supply ${amount} ${wagerAsset}, but your wallet only contains ${(Number(totalBalance) / 1_000_000).toFixed(2)} ${wagerAsset}.`);
    }

    const primaryCoin = tx.object(dUsdcCoins[0].coinObjectId);
    if (dUsdcCoins.length > 1) {
      tx.mergeCoins(primaryCoin, dUsdcCoins.slice(1).map(c => tx.object(c.coinObjectId)));
    }
    const [coin] = tx.splitCoins(primaryCoin, [tx.pure.u64(rawAmount)]);

    steps.push({
      index: 1,
      action: 'Split Quote Coin',
      details: `Prepare exactly ${amount} ${wagerAsset} from your wallet.`
    });

    // Step 2: Supply Liquidity directly
    if (!userAddress) {
      throw new Error("User wallet address is required to supply liquidity and receive PLP shares.");
    }

    const [plpCoin] = tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::predict::supply`,
      typeArguments: [PREDICT_CONFIG.QUOTE_TYPE],
      arguments: [
        tx.object(PREDICT_CONFIG.PREDICT_OBJECT), // Param 0: &mut Predict
        coin, // Param 1: Coin<QUOTE_TYPE>
        tx.object('0x6') // Param 2: &Clock
      ]
    });

    tx.transferObjects([plpCoin], tx.pure.address(userAddress));

    steps.push({
      index: 2,
      action: 'Supply Liquidity',
      details: `Supply the ${amount} ${wagerAsset} directly to the Predict LP pool and transfer PLP vault shares to your wallet.`
    });

    return {
      tx,
      steps,
      description: `Supplying ${amount} ${wagerAsset} of liquidity to the Predict LP Vault.`
    };
  }

  if (action === 'withdraw') {
    // Step 1: Merge and split PLP coins
    if (plpCoins.length === 0) {
      throw new Error("No PLP vault share coins found in your wallet. You need PLP coins to withdraw your supplied liquidity.");
    }

    const totalBalance = plpCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    const needed = BigInt(rawAmount);
    if (totalBalance < needed) {
      throw new Error(`Insufficient PLP balance. You are trying to withdraw ${amount} LP, but your wallet only contains ${(Number(totalBalance) / 1_000_000).toFixed(2)} LP.`);
    }

    const primaryCoin = plpCoins[0].coinObjectId;
    if (plpCoins.length > 1) {
      tx.mergeCoins(primaryCoin, plpCoins.slice(1).map(c => tx.object(c.coinObjectId)));
    }
    const [coin] = tx.splitCoins(primaryCoin, [tx.pure.u64(rawAmount)]);

    steps.push({
      index: 1,
      action: 'Split LP Shares Coin',
      details: `Prepare exactly ${amount} PLP vault share coins from your wallet.`
    });

    // Step 2: Call predict::withdraw
    if (!userAddress) {
      throw new Error("User wallet address is required to withdraw liquidity.");
    }

    const [dUsdcCoin] = tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::predict::withdraw`,
      typeArguments: [PREDICT_CONFIG.QUOTE_TYPE],
      arguments: [
        tx.object(PREDICT_CONFIG.PREDICT_OBJECT), // Param 0: &mut Predict
        coin, // Param 1: Coin<PLP>
        tx.object('0x6') // Param 2: &Clock
      ]
    });

    tx.transferObjects([dUsdcCoin], tx.pure.address(userAddress));

    steps.push({
      index: 2,
      action: 'Withdraw Liquidity',
      details: `Unstake the PLP shares, claim your ${amount} ${wagerAsset} from the Predict LP pool, and transfer it back to your wallet.`
    });

    return {
      tx,
      steps,
      description: `Withdrawing ${amount} ${wagerAsset} of liquidity from the Predict LP Vault.`
    };
  }

  if (action === 'redeem' && strike && direction) {
    if (!userManagerId) {
      throw new Error("Cannot redeem payouts without an active Predict Manager account");
    }

    const targetManager = tx.object(userManagerId);
    
    // Construct MarketKey
    const marketKey = tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::market_key::new`,
      arguments: [
        tx.pure.address(oracleSviId),
        tx.pure.u64(oracleExpiry), // Expiry timestamp
        tx.pure.u64(Math.round(effectiveStrike! * 1_000_000_000)), // Strike (9 decimals)
        tx.pure.bool(direction === 'above')
      ]
    });
    steps.push({
      index: 1,
      action: 'Construct Market Key',
      details: `Identify option market for strike $${strike.toLocaleString()} expiring ${expiryDateStr}.`
    });

    tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::predict::redeem_permissionless`,
      typeArguments: [PREDICT_CONFIG.QUOTE_TYPE],
      arguments: [
        tx.object(PREDICT_CONFIG.PREDICT_OBJECT), // Param 0: &mut Predict
        targetManager, // Param 1: &mut PredictManager
        tx.object(oracleSviId), // Param 2: &OracleSVI
        marketKey, // Param 3: MarketKey
        tx.pure.u64(rawAmount), // Param 4: size / amount (6 decimals)
        tx.object('0x6') // Param 5: &Clock
      ]
    });
    steps.push({
      index: 2,
      action: 'Redeem Payouts',
      details: `Collect all settled winning binary positions and credit ${wagerAsset} to your Predict Manager.`
    });

    // Step 3: Withdraw the redeemed SUI/LOFI from the PredictManager to the user's wallet
    const [withdrawnCoin] = tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::predict_manager::withdraw`,
      typeArguments: [PREDICT_CONFIG.QUOTE_TYPE],
      arguments: [
        targetManager,
        tx.pure.u64(rawAmount)
      ]
    });

    const targetAddress = userAddress || '0x0000000000000000000000000000000000000000000000000000000000000000';
    tx.transferObjects([withdrawnCoin], tx.pure.address(targetAddress));

    steps.push({
      index: 3,
      action: 'Withdraw to Wallet',
      details: `Withdraw ${amount.toFixed(2)} ${wagerAsset} from Predict Manager and transfer to wallet.`
    });

    return {
      tx,
      steps,
      description: `Claiming settled payout of ${amount} ${wagerAsset} and withdrawing to wallet.`,
      mappedStrike: effectiveStrike
    };
  }

  if (action === 'withdraw_manager') {
    if (!userManagerId) {
      throw new Error("Cannot withdraw from Predict Manager without an active Predict Manager account");
    }
    const targetManager = tx.object(userManagerId);

    const [withdrawnCoin] = tx.moveCall({
      target: `${PREDICT_CONFIG.PACKAGE_ID}::predict_manager::withdraw`,
      typeArguments: [PREDICT_CONFIG.QUOTE_TYPE],
      arguments: [
        targetManager,
        tx.pure.u64(rawAmount)
      ]
    });

    const targetAddress = userAddress || '0x0000000000000000000000000000000000000000000000000000000000000000';
    tx.transferObjects([withdrawnCoin], tx.pure.address(targetAddress));

    steps.push({
      index: 1,
      action: 'Withdraw from Predict Manager',
      details: `Withdraw ${amount.toFixed(2)} ${wagerAsset} from Predict Manager account and transfer to wallet.`
    });

    return {
      tx,
      steps,
      description: `Withdrawing ${amount} ${wagerAsset} from Predict Manager to wallet.`
    };
  }

  // Fallback / Unknown
  steps.push({
    index: 1,
    action: 'Unknown Transaction',
    details: 'Unable to compile intent. Please clarify your command.'
  });

  return {
    tx,
    steps,
    description: 'Empty or un-compilable transaction.'
  };
}

export function buildPTB(
  action: 'mint' | 'supply' | 'redeem' | 'withdraw' | 'withdraw_manager' | 'vault_balance' | 'unknown',
  amount: number,
  strike?: number,
  direction?: 'above' | 'below',
  userManagerId?: string,
  dUsdcCoins: Array<{ coinObjectId: string; balance: string }> = [],
  oracleSviId: string = PREDICT_CONFIG.DEFAULT_ORACLE_SVI,
  userAddress?: string,
  plpCoins: Array<{ coinObjectId: string; balance: string }> = [],
  oracleExpiry: number = 1781445600000,
  btcSpotPrice?: number,
  wagerAsset: string = 'SUI',
  asset?: string
): CompiledPTB {
  const result = buildPTBInternal(
    action,
    amount,
    strike,
    direction,
    userManagerId,
    dUsdcCoins,
    oracleSviId,
    userAddress,
    plpCoins,
    oracleExpiry,
    btcSpotPrice,
    wagerAsset,
    asset
  );
  result.serializedTx = result.tx.serialize();
  return result;
}
