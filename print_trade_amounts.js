import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';

async function queryTradeAmounts(strike, isAbove) {
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
  const sizeArg = tx.pure(bcs.u64().serialize(10000000n).toBytes()); // 10 USDC

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
  const cases = [
    { strike: 65000, isAbove: true },
    { strike: 68000, isAbove: true },
    { strike: 68000, isAbove: false },
    { strike: 63000, isAbove: true }
  ];
  
  for (const c of cases) {
    console.log(`Querying ${c.strike} ${c.isAbove ? 'Above' : 'Below'}...`);
    const res = await queryTradeAmounts(c.strike, c.isAbove);
    if (res.error) {
      console.log(`Error:`, res.error);
    } else {
      const inspect = res.result;
      if (inspect.effects.status.status === 'success') {
        const returnValues = inspect.results[1].returnValues;
        // The return values are: [trade_amount, payout_amount] or similar
        // Let's print the raw return values bytes
        console.log(`Success! Return values:`, JSON.stringify(returnValues, null, 2));
      } else {
        console.log(`Failed inside Move:`, inspect.effects.status.error);
      }
    }
  }
}

main();
