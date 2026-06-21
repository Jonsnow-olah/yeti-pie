async function main() {
  const tableId = '0x3d39708b0ea8b028e9b26a7912b345928bb3b3db20fb489936fcb46824b949d6';
  
  // 1. Fetch all dynamic fields
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
  
  console.log(`Found ${fields.length} positions in table. Querying details...`);
  
  // 2. Query details for the first 20 fields (or all of them if small)
  const targetFields = fields.slice(0, 30);
  for (const f of targetFields) {
    const objPayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: [f.objectId, { showContent: true }]
    };
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(objPayload)
    });
    const objResult = await response.json();
    const content = objResult.result?.data?.content;
    if (content && content.fields) {
      console.log('------------------------------------------');
      console.log('Name (Key):', JSON.stringify(content.fields.name, null, 2));
      console.log('Value (Size):', content.fields.value);
    }
  }
}

main().catch(console.error);
