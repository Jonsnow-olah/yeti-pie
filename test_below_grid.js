import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';

async function queryTradeAmounts(strike, isAbove, sizeAmount = 10000n) {
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
  const sizeArg = tx.pure(bcs.u64().serialize(sizeAmount).toBytes());

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
        '0x0000000000000000000000000000000000000000000000000000000000000000',
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
    return result;
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  const strikes = [60000, 61000, 62000, 62500, 63000, 63500, 64000, 64500, 65000, 66000, 68000];
  console.log('Testing Below (Put) strikes at size 0.01 USDC (10000 units):');
  for (const strike of strikes) {
    const res = await queryTradeAmounts(strike, false, 10000n);
    if (res.result && res.result.effects.status.status === 'success') {
      const returnValues = res.result.results[1].returnValues;
      const payoutBytes = returnValues[1][0];
      let payout = 0;
      for (let i = 0; i < payoutBytes.length; i++) {
        payout += payoutBytes[i] * Math.pow(256, i);
      }
      console.log(`Strike: ${strike} Below -> Payout: ${payout} (Success)`);
    } else {
      const err = res.result ? res.result.effects.status.error : res.error;
      console.log(`Strike: ${strike} Below -> Error: ${err}`);
    }
  }

  console.log('\nTesting Above (Call) strikes at size 0.01 USDC (10000 units):');
  for (const strike of strikes) {
    const res = await queryTradeAmounts(strike, true, 10000n);
    if (res.result && res.result.effects.status.status === 'success') {
      const returnValues = res.result.results[1].returnValues;
      const payoutBytes = returnValues[1][0];
      let payout = 0;
      for (let i = 0; i < payoutBytes.length; i++) {
        payout += payoutBytes[i] * Math.pow(256, i);
      }
      console.log(`Strike: ${strike} Above -> Payout: ${payout} (Success)`);
    } else {
      const err = res.result ? res.result.effects.status.error : res.error;
      console.log(`Strike: ${strike} Above -> Error: ${err}`);
    }
  }
}

main();
