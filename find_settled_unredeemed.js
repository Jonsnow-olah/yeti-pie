import { SuiJsonRpcClient, getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const SENDER = '0x6f52dc69d50bcebc5f3f0126bb3de15c2dcc5fa5e49fdf401d687ddde996e3c2';
const MANAGER_ID = '0xf7a7e0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4ebe0eb';

async function main() {
  const tableId = '0x3d39708b0ea8b028e9b26a7912b345928bb3b3db20fb489936fcb46824b949d6';
  
  let hasNextPage = true;
  let cursor = null;
  const fields = [];
  
  while (hasNextPage) {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getDynamicFields',
      params: cursor ? [tableId, cursor] : [tableId]
    };
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (result.result && result.result.data) {
      fields.push(...result.result.data);
      hasNextPage = result.result.hasNextPage;
      cursor = result.result.nextCursor;
    } else {
      hasNextPage = false;
    }
  }

  console.log(`Found ${fields.length} positions. Checking for settled ones with size > 0...`);
  
  for (const f of fields) {
    const objResp = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [f.objectId, { showContent: true }]
      })
    });
    const objResult = await objResp.json();
    const content = objResult.result?.data?.content;
    if (content && content.fields) {
      const value = Number(content.fields.value);
      if (value > 0) {
        const key = content.fields.name.fields;
        if (!key) continue;
        const oracleId = key.oracle_id;
        const expiry = key.expiry;
        const strike = Number(key.strike) / 1_000_000_000;
        const direction = key.direction === 1 || key.direction === true;

        // Check if settled
        const oracleResp = await fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_getObject',
            params: [oracleId, { showContent: true }]
          })
        });
        const oracleResult = await oracleResp.json();
        const oracleContent = oracleResult.result?.data?.content;
        const isSettled = oracleContent?.fields?.is_settled;

        if (isSettled) {
          console.log(`\nFound settled, unredeemed position:`);
          console.log(`Oracle: ${oracleId}`);
          console.log(`Expiry: ${expiry}`);
          console.log(`Strike: ${strike}`);
          console.log(`Direction: ${direction ? 'Above' : 'Below'}`);
          console.log(`Size: ${value}`);

          // Test dry-run
          const tx = new Transaction();
          const marketKey = tx.moveCall({
            target: `${PACKAGE_ID}::market_key::new`,
            arguments: [
              tx.pure.address(oracleId),
              tx.pure.u64(expiry),
              tx.pure.u64(BigInt(Math.floor(strike * 1_000_000_000))),
              tx.pure.bool(direction)
            ]
          });

          tx.moveCall({
            target: `${PACKAGE_ID}::predict::redeem_permissionless`,
            typeArguments: ['0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'],
            arguments: [
              tx.object(PREDICT_OBJECT),
              tx.object(MANAGER_ID),
              tx.object(oracleId),
              marketKey,
              tx.pure.u64(value),
              tx.object('0x6')
            ]
          });

          const [withdrawnCoin] = tx.moveCall({
            target: `${PACKAGE_ID}::predict_manager::withdraw`,
            typeArguments: ['0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'],
            arguments: [
              tx.object(MANAGER_ID),
              tx.pure.u64(value)
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
          break; // just test one
        }
      }
    }
  }
}
main().catch(console.error);
