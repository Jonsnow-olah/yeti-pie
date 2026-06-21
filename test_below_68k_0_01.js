import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SuiClient } from '@mysten/sui/client';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';

async function main() {
  const client = new SuiClient({ url: getJsonRpcFullnodeUrl('testnet') });
  const tx = new Transaction();
  tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');

  const oracleIdArg = tx.pure(bcs.Address.serialize(ORACLE_SVI_ID).toBytes());
  const expiryArg = tx.pure(bcs.u64().serialize(1780992000000n).toBytes());
  const strikeArg = tx.pure(bcs.u64().serialize(BigInt(Math.floor(68000 * 1_000_000_000))).toBytes());
  const isAboveArg = tx.pure(bcs.bool().serialize(false).toBytes()); // Below
  const sizeArg = tx.pure(bcs.u64().serialize(10000n).toBytes()); // 0.01 USDC

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
      tx.object(PREDICT_OBJECT_ID),
      tx.object(ORACLE_SVI_ID),
      marketKey,
      sizeArg,
      tx.object('0x6')
    ]
  });

  try {
    const bcsBytes = await tx.build({ client, onlyTransactionKind: true });
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_devInspectTransactionBlock',
      params: [
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        Buffer.from(bcsBytes).toString('base64'),
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
    if (result.result && result.result.effects.status.status === 'success') {
      const returnValues = result.result.results[1].returnValues;
      console.log('Return values:', JSON.stringify(returnValues, null, 2));
      const payoutBytes = returnValues[1][0];
      let payout = 0;
      for (let i = 0; i < payoutBytes.length; i++) {
        payout += payoutBytes[i] * Math.pow(256, i);
      }
      console.log('Decoded payout amount:', payout);
    } else {
      console.log('Failed:', result.result?.effects.status.error || result.error);
    }
  } catch (err) {
    console.error(err);
  }
}

main();
