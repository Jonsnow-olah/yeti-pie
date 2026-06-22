const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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
  
  console.log(`Found ${fields.length} positions in table. Querying details for non-zero ones...`);
  
  // Query all fields in batches of 50
  const batchSize = 40;
  for (let i = 0; i < fields.length; i += batchSize) {
    const batch = fields.slice(i, i + batchSize);
    const promises = batch.map(async (f) => {
      const objPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [f.objectId, { showContent: true }]
      };
      try {
        const response = await fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(objPayload)
        });
        const objResult = await response.json();
        const content = objResult.result?.data?.content;
        if (content && content.fields) {
          const value = Number(content.fields.value);
          if (value > 0) {
            console.log('==========================================');
            console.log('Object ID:', f.objectId);
            console.log('MarketKey:', JSON.stringify(content.fields.name, null, 2));
            console.log('Size (Value):', value);
          }
        }
      } catch (err) {
        console.error('Error fetching details for object:', f.objectId, err.message);
      }
    });
    await Promise.all(promises);
  }
}

main().catch(console.error);
