import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0xa5c6338b0068da3171578be6b0db5ebab283da59e81928ffa30f5348134535c0';
const ORACLE_EXPIRY = 1781960400000n;

async function queryTrade(strike, isAbove) {
  const tx = new Transaction();
  tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');

  const predictArg = tx.sharedObjectRef({ objectId: PREDICT_OBJECT_ID, initialSharedVersion: 829857685, mutable: true });
  const oracleArg = tx.sharedObjectRef({ objectId: ORACLE_SVI_ID, initialSharedVersion: 910012412, mutable: false });
  const clockArg = tx.sharedObjectRef({ objectId: '0x6', initialSharedVersion: 1, mutable: false });

  const marketKey = tx.moveCall({
    target: PACKAGE_ID + '::market_key::new',
    arguments: [
      tx.pure(bcs.Address.serialize(ORACLE_SVI_ID).toBytes()),
      tx.pure(bcs.u64().serialize(ORACLE_EXPIRY).toBytes()),
      tx.pure(bcs.u64().serialize(BigInt(Math.floor(strike * 1_000_000_000))).toBytes()),
      tx.pure(bcs.bool().serialize(isAbove).toBytes())
    ]
  });

  tx.moveCall({
    target: PACKAGE_ID + '::predict::get_trade_amounts',
    arguments: [predictArg, oracleArg, marketKey, tx.pure(bcs.u64().serialize(1000000n).toBytes()), clockArg]
  });

  try {
    const bcsBytes = await tx.build({ onlyTransactionKind: true });
    const txBytes = Buffer.from(bcsBytes).toString('base64');

    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_devInspectTransactionBlock',
        params: ['0x0000000000000000000000000000000000000000000000000000000000000000', txBytes, null, null]
      })
    });
    const res = await response.json();
    if (res.error) {
      return { error: res.error.message };
    }
    return res.result;
  } catch (err) {
    return { error: err.stack || err.message };
  }
}

async function run() {
  const cases = [
    { strike: 63000, isAbove: false }, // below 63000
    { strike: 63500, isAbove: false }, // below 63500
    { strike: 63000, isAbove: true },  // above 63000
    { strike: 63500, isAbove: true }   // above 63500
  ];
  for (const c of cases) {
    const inspect = await queryTrade(c.strike, c.isAbove);
    if (!inspect || inspect.error) {
      console.log(`${c.strike} ${c.isAbove ? 'Above' : 'Below'} -> Fetch Error:`, inspect?.error || inspect);
    } else if (inspect.effects.status.status === 'success') {
      const returnValues = inspect.results[1].returnValues;
      // Decode return values
      const premiumBytes = returnValues[0][0];
      const payoutBytes = returnValues[1][0];
      let premium = 0;
      let payout = 0;
      for (let i = 0; i < premiumBytes.length; i++) premium += premiumBytes[i] * Math.pow(256, i);
      for (let i = 0; i < payoutBytes.length; i++) payout += payoutBytes[i] * Math.pow(256, i);
      console.log(`${c.strike} ${c.isAbove ? 'Above' : 'Below'} -> Success: premium=${premium}, payout=${payout}, price=${(premium/1000000).toFixed(4)}`);
    } else {
      console.log(`${c.strike} ${c.isAbove ? 'Above' : 'Below'} -> Failed inside Move:`, inspect.effects.status.error);
    }
  }
}

run();
