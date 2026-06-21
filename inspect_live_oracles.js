async function main() {
  const tableId = '0x5f8c40ec8a5056c8f1dbb0b2d3dee8bb1565cc38a1c261b647aedcdc025f5208'; // oracle_ids table
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  
  // 1. Get dynamic fields of registry table
  const dfResp = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getDynamicFields',
      params: [tableId]
    })
  });
  const dfResult = await dfResp.json();
  const fields = dfResult.result?.data;
  if (!Array.isArray(fields)) {
    console.log('No dynamic fields found.');
    return;
  }
  
  const targetKey = '0x0b8fb5c4514337dbd300ff2a49185a99433d8369670a23329126388364119817';
  let activeFieldObjId = null;
  for (const field of fields) {
    if (field.name?.value === targetKey) {
      activeFieldObjId = field.objectId;
      break;
    }
  }
  if (!activeFieldObjId && fields.length > 0) {
    activeFieldObjId = fields[0].objectId;
  }
  if (!activeFieldObjId) {
    console.log('No active field object ID found.');
    return;
  }
  
  // 2. Fetch the active field object to get oracle list
  const fieldResp = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: [activeFieldObjId, { showContent: true }]
    })
  });
  const fieldResult = await fieldResp.json();
  const oracleIds = fieldResult.result?.data?.content?.fields?.value;
  if (!Array.isArray(oracleIds) || oracleIds.length === 0) {
    console.log('No oracle IDs in vector.');
    return;
  }
  
  // 3. Fetch clock
  const clockResp = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: ['0x6', { showContent: true }]
    })
  });
  const clockResult = await clockResp.json();
  const blockchainTime = Number(clockResult.result?.data?.content?.fields?.timestamp_ms || Date.now());
  console.log('Blockchain Time:', blockchainTime, new Date(blockchainTime).toISOString());
  
  // 4. Fetch details of candidate oracles
  const candidates = oracleIds.slice(-15).reverse();
  const multiResp = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_multiGetObjects',
      params: [candidates, { showContent: true }]
    })
  });
  const multiResult = await multiResp.json();
  const resultsList = multiResult.result;
  
  if (Array.isArray(resultsList)) {
    for (const item of resultsList) {
      const oFields = item.data?.content?.fields;
      if (oFields) {
        const oid = item.data.objectId;
        const expiry = Number(oFields.expiry);
        const timestamp = Number(oFields.timestamp);
        
        const isLive = expiry > blockchainTime;
        const isFresh = Math.abs(blockchainTime - timestamp) < 7200 * 1000;
        
        console.log(`Oracle: ${oid}`);
        console.log(`  Expiry: ${expiry} (${new Date(expiry).toISOString()}) - isLive: ${isLive}`);
        console.log(`  Timestamp: ${timestamp} (${new Date(timestamp).toISOString()}) - isFresh: ${isFresh}`);
        console.log(`  Active: ${oFields.active}`);
        console.log(`  Settlement Price: ${oFields.settlement_price}`);
      }
    }
  }
}
main().catch(console.error);
