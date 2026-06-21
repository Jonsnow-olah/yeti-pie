import { SuiJsonRpcClient, getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const SENDER = '0x6f52dc69d50bcebc5f3f0126bb3de15c2dcc5fa5e49fdf401d687ddde996e3c2';
const MANAGER_ID = '0xf7a7e0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4ebe0eb';

async function fetchWithRetry(payload, retries = 5, initialDelay = 500) {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`JSON parse error. Response was: ${text.substring(0, 150)}`);
      }
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`[WARN] RPC request failed: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

async function main() {
  const tableId = '0x3d39708b0ea8b028e9b26a7912b345928bb3b3db20fb489936fcb46824b949d6';
  
  let hasNextPage = true;
  let cursor = null;
  const fields = [];
  
  console.log('Retrieving dynamic fields from positions table...');
  while (hasNextPage) {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getDynamicFields',
      params: cursor ? [tableId, cursor] : [tableId]
    };
    const result = await fetchWithRetry(payload);
    if (result.result && result.result.data) {
      fields.push(...result.result.data);
      hasNextPage = result.result.hasNextPage;
      cursor = result.result.nextCursor;
    } else {
      hasNextPage = false;
    }
  }

  console.log(`Found ${fields.length} positions. Querying details in parallel batches...`);
  
  const activePositions = [];
  const batchSize = 10;
  for (let i = 0; i < fields.length; i += batchSize) {
    const batch = fields.slice(i, i + batchSize);
    const promises = batch.map(async (f) => {
      const objResult = await fetchWithRetry({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [f.objectId, { showContent: true }]
      });
      const content = objResult.result?.data?.content;
      if (content && content.fields) {
        const value = Number(content.fields.value);
        if (value > 0) {
          const key = content.fields.name.fields;
          if (key) {
            activePositions.push({
              objectId: f.objectId,
              oracleId: key.oracle_id,
              expiry: key.expiry,
              strike: Number(key.strike) / 1_000_000_000,
              direction: Number(key.direction) === 0,
              size: value
            });
          }
        }
      }
    });
    await Promise.all(promises);
  }

  console.log(`Found ${activePositions.length} active positions (size > 0). Querying oracle statuses...`);

  // Batch query all oracle statuses
  const oracleIds = Array.from(new Set(activePositions.map(p => p.oracleId)));
  const oracleStatuses = {};
  
  for (let i = 0; i < oracleIds.length; i += batchSize) {
    const batch = oracleIds.slice(i, i + batchSize);
    const promises = batch.map(async (id) => {
      const oracleResult = await fetchWithRetry({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [id, { showContent: true }]
      });
      const oracleContent = oracleResult.result?.data?.content;
      const fields = oracleContent?.fields;
      oracleStatuses[id] = fields && fields.settlement_price !== null && fields.settlement_price !== undefined;
    });
    await Promise.all(promises);
  }

  // Find the first active position on a settled oracle
  const targets = activePositions.filter(p => oracleStatuses[p.oracleId] === true);
  if (targets.length === 0) {
    console.log('No active positions found on settled oracles.');
    return;
  }

  console.log(`\nFound ${targets.length} settled, unredeemed position(s):`);
  for (const target of targets) {
    console.log(`- Oracle: ${target.oracleId}, Expiry: ${target.expiry}, Strike: ${target.strike}, Direction: ${target.direction ? 'Above' : 'Below'}, Size: ${target.size}`);
  }

  const target = targets[0];
  console.log(`\nTesting dry-run on first target:`);
  console.log(`Oracle: ${target.oracleId}`);
  console.log(`Expiry: ${target.expiry}`);
  console.log(`Strike: ${target.strike}`);
  console.log(`Direction: ${target.direction ? 'Above' : 'Below'}`);
  console.log(`Size: ${target.size}`);

  // Test dry-run
  const tx = new Transaction();
  const marketKey = tx.moveCall({
    target: `${PACKAGE_ID}::market_key::new`,
    arguments: [
      tx.pure.address(target.oracleId),
      tx.pure.u64(target.expiry),
      tx.pure.u64(BigInt(Math.floor(target.strike * 1_000_000_000))),
      tx.pure.bool(target.direction)
    ]
  });

  tx.moveCall({
    target: `${PACKAGE_ID}::predict::redeem_permissionless`,
    typeArguments: ['0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'],
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(MANAGER_ID),
      tx.object(target.oracleId),
      marketKey,
      tx.pure.u64(target.size),
      tx.object('0x6')
    ]
  });

  const [withdrawnCoin] = tx.moveCall({
    target: `${PACKAGE_ID}::predict_manager::withdraw`,
    typeArguments: ['0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'],
    arguments: [
      tx.object(MANAGER_ID),
      tx.pure.u64(target.size)
    ]
  });
  tx.transferObjects([withdrawnCoin], tx.pure.address(SENDER));

  console.log('Simulating dry-run...');
  const dryRun = await client.devInspectTransactionBlock({
    sender: SENDER,
    transactionBlock: tx
  });

  console.log('Result:', dryRun.effects.status.status);
  if (dryRun.effects.status.status === 'failure') {
    console.log('Error:', dryRun.effects.status.error);
  } else {
    console.log('Dry-run succeeded!');
  }
}
main().catch(console.error);
