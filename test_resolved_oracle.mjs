import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';


const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';

async function run() {
  try {
    const sResp = await fetch(`https://predict-server.testnet.mystenlabs.com/predicts/${PREDICT_OBJECT_ID}/oracles`);
    if (!sResp.ok) throw new Error('Failed to fetch oracles');
    const oraclesList = await sResp.json();
    const activeBtcOracles = oraclesList
      .filter(o => o.status === 'active' && o.underlying_asset === 'BTC' && o.oracle_id && o.expiry > Date.now())
      .sort((a, b) => a.expiry - b.expiry);
    
    if (activeBtcOracles.length === 0) {
      console.log('No active BTC oracles found.');
      return;
    }
    
    const bestOracle = activeBtcOracles[0];
    console.log('Resolved active BTC oracle:', bestOracle);

    const oResp = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [bestOracle.oracle_id, { showOwner: true, showContent: true }]
      })
    });
    const oRes = await oResp.json();
    const data = oRes.result?.data;
    const owner = data?.owner;
    const fields = data?.content?.fields;
    const initialSharedVersion = owner?.Shared?.initial_shared_version || 910012412;
    const spot = Number(fields?.prices?.fields?.spot) / 1_000_000_000;
    
    console.log(`Spot Price: $${spot}, Initial Shared Version: ${initialSharedVersion}`);

    const strikes = [63000, 62500, 62000, 63500];
    for (const strike of strikes) {
      for (const isAbove of [true, false]) {
        const tx = new Transaction();
        tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');

        const predictArg = tx.sharedObjectRef({ objectId: PREDICT_OBJECT_ID, initialSharedVersion: 829857685, mutable: true });
        const oracleArg = tx.sharedObjectRef({ objectId: bestOracle.oracle_id, initialSharedVersion, mutable: false });
        const clockArg = tx.sharedObjectRef({ objectId: '0x6', initialSharedVersion: 1, mutable: false });

        const marketKey = tx.moveCall({
          target: PACKAGE_ID + '::market_key::new',
          arguments: [
            tx.pure(bcs.Address.serialize(bestOracle.oracle_id).toBytes()),
            tx.pure(bcs.u64().serialize(BigInt(bestOracle.expiry)).toBytes()),
            tx.pure(bcs.u64().serialize(BigInt(Math.floor(strike * 1_000_000_000))).toBytes()),
            tx.pure(bcs.bool().serialize(isAbove).toBytes())
          ]
        });

        tx.moveCall({
          target: PACKAGE_ID + '::predict::get_trade_amounts',
          arguments: [predictArg, oracleArg, marketKey, tx.pure(bcs.u64().serialize(1000000n).toBytes()), clockArg]
        });

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
          console.log(`strike ${strike} ${isAbove ? 'Above' : 'Below'} -> RPC error:`, res.error);
        } else if (res.result.effects.status.status === 'success') {
          const returnValues = res.result.results[1].returnValues;
          const premiumBytes = returnValues[0][0];
          let premium = 0;
          for (let i = 0; i < premiumBytes.length; i++) premium += premiumBytes[i] * Math.pow(256, i);
          console.log(`strike ${strike} ${isAbove ? 'Above' : 'Below'} -> Success: price=${(premium/1000000).toFixed(4)}`);
        } else {
          console.log(`strike ${strike} ${isAbove ? 'Above' : 'Below'} -> Failed:`, res.result.effects.status.error);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
