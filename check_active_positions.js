import { SuiJsonRpcClient, getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});

async function fetchWithRetry(payload, retries = 5, initialDelay = 500) {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`JSON parse error. Response: ${text.substring(0, 100)}`);
      }
    } catch (error) {
      if (i === retries - 1) throw error;
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
  
  console.log('Retrieving dynamic fields...');
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

  console.log(`Found ${fields.length} positions. Querying details...`);
  
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
              direction: key.direction === 1 || key.direction === true,
              size: value
            });
          }
        }
      }
    });
    await Promise.all(promises);
  }

  console.log(`Found ${activePositions.length} active positions. Inspecting oracles...`);

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
      if (oracleContent) {
        console.log(`Oracle ${id} fields:`, JSON.stringify(oracleContent.fields, null, 2));
      } else {
        console.log(`Oracle ${id} not found or content missing.`);
      }
    });
    await Promise.all(promises);
  }
}
main().catch(console.error);
