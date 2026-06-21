import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';
const USER_MANAGER_ID = '0xf7a7e0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4ebe0eb';
const TRADER_ADDRESS = '0x6f52dc69d50bcebc5f3f0126bb3de15c2dcc5fa5e49fdf401d687ddde996e3c2';
const QUOTE_TYPE = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';

async function testMint(strike, isAbove) {
  const tx = new Transaction();
  tx.setSender(TRADER_ADDRESS);

  // 1. Reference PredictManager as shared object
  const managerArg = tx.sharedObjectRef({
    objectId: USER_MANAGER_ID,
    initialSharedVersion: 850638593,
    mutable: true
  });

  // 2. Prepare mock dUSDC coins (split from a large coin object or create virtual coin)
  // To simulate having balance in the manager, let's deposit 10 USDC (10,000,000)
  // Let's create a coin of 10 USDC using devinspect (normally requires real coin, but in dry-run we can mock it)
  // Wait, let's just deposit 10 USDC. We need a real coin for deposit or we can construct it if we are checking validation.
  // Wait, since we are doing dry-run, we can use 0x2::coin::mint_for_testing
  const [mockCoin] = tx.moveCall({
    target: '0x2::coin::mint_for_testing',
    typeArguments: [QUOTE_TYPE],
    arguments: [tx.pure.u64(10000000n)] // 10 USDC
  });

  tx.moveCall({
    target: `${PACKAGE_ID}::predict_manager::deposit`,
    typeArguments: [QUOTE_TYPE],
    arguments: [managerArg, mockCoin]
  });

  // 3. Construct MarketKey
  const oracleIdArg = tx.pure(bcs.Address.serialize(ORACLE_SVI_ID).toBytes());
  const expiryArg = tx.pure(bcs.u64().serialize(1780992000000n).toBytes());
  const strikeArg = tx.pure(bcs.u64().serialize(BigInt(Math.floor(strike * 1_000_000_000))).toBytes());
  const isUpArg = tx.pure(bcs.bool().serialize(isAbove).toBytes());

  const marketKey = tx.moveCall({
    target: `${PACKAGE_ID}::market_key::new`,
    arguments: [
      oracleIdArg,
      expiryArg,
      strikeArg,
      isUpArg
    ]
  });

  // 4. Reference other shared objects
  const predictArg = tx.sharedObjectRef({
    objectId: PREDICT_OBJECT_ID,
    initialSharedVersion: 829857685,
    mutable: true
  });

  const oracleArg = tx.sharedObjectRef({
    objectId: ORACLE_SVI_ID,
    initialSharedVersion: 891314392,
    mutable: false
  });

  const clockArg = tx.sharedObjectRef({
    objectId: '0x0000000000000000000000000000000000000000000000000000000000000006',
    initialSharedVersion: 1,
    mutable: false
  });

  // 5. Call predict::mint
  tx.moveCall({
    target: `${PACKAGE_ID}::predict::mint`,
    typeArguments: [QUOTE_TYPE],
    arguments: [
      predictArg,
      managerArg,
      oracleArg,
      marketKey,
      tx.pure(bcs.u64().serialize(10000000n).toBytes()), // 10 USDC size
      clockArg
    ]
  });

  try {
    const bcsBytes = await tx.build({ onlyTransactionKind: true });
    const txBytes = Buffer.from(bcsBytes).toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_devInspectTransactionBlock',
      params: [
        TRADER_ADDRESS,
        txBytes,
        null,
        null
      ]
    };

    const response = await fetch(getJsonRpcFullnodeUrl('testnet'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.error) {
      return { success: false, error: result.error.message };
    }

    const inspectResult = result.result;
    if (inspectResult.effects.status.status === 'success') {
      return { success: true };
    } else {
      return { success: false, error: inspectResult.effects.status.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('Testing mint with positive size...');
  
  // Test 68000 Above
  console.log('Testing 68000 Above...');
  const res1 = await testMint(68000, true);
  console.log(`68000 Above -> Success: ${res1.success}${res1.success ? '' : `, Error: ${res1.error}`}`);

  // Test 68000 Below
  console.log('Testing 68000 Below...');
  const res2 = await testMint(68000, false);
  console.log(`68000 Below -> Success: ${res2.success}${res2.success ? '' : `, Error: ${res2.error}`}`);

  // Test 65000 Above
  console.log('Testing 65000 Above...');
  const res3 = await testMint(65000, true);
  console.log(`65000 Above -> Success: ${res3.success}${res3.success ? '' : `, Error: ${res3.error}`}`);
}

main();
