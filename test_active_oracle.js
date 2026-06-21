import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x195833aeee071530d2bdcd2e03916b7458d57c81ed540b82d6e1cb594bdf41f2';
const EXPIRY = 1781251200000n;

async function fetchSpotPrice() {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getObject',
    params: [
      ORACLE_SVI_ID,
      { showContent: true }
    ]
  };

  const response = await fetch(getJsonRpcFullnodeUrl('testnet'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  const fields = result.result?.data?.content?.fields;
  const spot = Number(fields.prices.fields.spot) / 1_000_000_000;
  return spot;
}

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
    initialSharedVersion: 870314324,
    mutable: false
  });

  const clockArg = tx.sharedObjectRef({
    objectId: '0x0000000000000000000000000000000000000000000000000000000000000006',
    initialSharedVersion: 1,
    mutable: false
  });

  const oracleIdArg = tx.pure(bcs.Address.serialize(ORACLE_SVI_ID).toBytes());
  const expiryArg = tx.pure(bcs.u64().serialize(EXPIRY).toBytes());
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
  const spot = await fetchSpotPrice();
  console.log(`Current Spot Price of active oracle ${ORACLE_SVI_ID} is: $${spot}`);
  
  // Test strikes around spot
  const strikes = [Math.floor(spot) - 1000];
  for (const strike of strikes) {
    const res = await queryTradeAmounts(strike, false, 1000000n);
    console.log('Response:', JSON.stringify(res, null, 2));
  }
}

main();
