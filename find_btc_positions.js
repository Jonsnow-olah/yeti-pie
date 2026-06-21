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
  
  console.log('Total fields:', fields.length);
  
  // Find fields matching the oracle SVI
  const matchingFields = [];
  for (const f of fields) {
    const val = f.name?.value;
    if (val && val.oracle_id === '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4') {
      matchingFields.push(f);
    }
  }
  
  console.log('Matching fields for BTC oracle:', matchingFields.length);
  
  for (const f of matchingFields) {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [f.objectId, { showContent: true }]
      })
    });
    const objResult = await response.json();
    const content = objResult.result?.data?.content;
    if (content && content.fields) {
      console.log('------------------------------------------');
      console.log('MarketKey:', JSON.stringify(content.fields.name, null, 2));
      console.log('Value (Size):', content.fields.value);
    }
  }
}
main();
