import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';

async function testStrike(strike, isAbove) {
  const tx = new Transaction();
  tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');

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

  const oracleIdArg = tx.pure(bcs.Address.serialize(ORACLE_SVI_ID).toBytes());
  const expiryArg = tx.pure(bcs.u64().serialize(1780992000000n).toBytes());
  const strikeArg = tx.pure(bcs.u64().serialize(BigInt(Math.floor(strike * 1_000_000_000))).toBytes());
  const isAboveArg = tx.pure(bcs.bool().serialize(isAbove).toBytes());
  const sizeArg = tx.pure(bcs.u64().serialize(1000000n).toBytes()); // 1 USDC

  const marketKey = tx.moveCall({
    target: `${PACKAGE_ID}::market_key::new`,
    arguments: [
      oracleIdArg,
      expiryArg,
      strikeArg,
      isAboveArg
    ]
  });

  tx.moveCall({
    target: `${PACKAGE_ID}::predict::get_trade_amounts`,
    arguments: [
      predictArg,
      oracleArg,
      marketKey,
      sizeArg,
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
        '0x0000000000000000000000000000000000000000000000000000000000000000', // sender
        txBytes,
        null, // gasPrice
        null  // epoch
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
  console.log('Testing strike 65000 above...');
  const resAbove = await testStrike(65000, true);
  console.log(`Result: Success: ${resAbove.success}${resAbove.success ? '' : `, Error: ${resAbove.error}`}`);

  console.log('Testing strike 65000 below...');
  const resBelow = await testStrike(65000, false);
  console.log(`Result: Success: ${resBelow.success}${resBelow.success ? '' : `, Error: ${resBelow.error}`}`);
}

main();
