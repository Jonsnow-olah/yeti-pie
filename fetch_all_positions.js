async function main() {
  const tableId = '0x3d39708b0ea8b028e9b26a7912b345928bb3b3db20fb489936fcb46824b949d6';
  let cursor = null;
  let hasNextPage = true;
  let allFields = [];

  while (hasNextPage) {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getDynamicFields',
      params: [tableId, cursor]
    };

    try {
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.error) {
        console.error('RPC Error:', result.error);
        break;
      }
      const data = result.result.data;
      allFields = allFields.concat(data);
      hasNextPage = result.result.hasNextPage;
      cursor = result.result.nextCursor;
    } catch (error) {
      console.error('Fetch Error:', error);
      break;
    }
  }

  // Filter for oracle_id ending with a086
  const matches = allFields.filter(f => {
    if (f.name && f.name.value) {
      const val = f.name.value;
      return String(val.oracle_id).endsWith('a086');
    }
    return false;
  });

  console.log(`Found ${matches.length} matches ending with a086:`);
  console.log(JSON.stringify(matches, null, 2));

  // Query each match to get the size
  for (const m of matches) {
    console.log(`Querying object details for field ID: ${m.objectId}`);
    const objPayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: [m.objectId, { showContent: true }]
    };
    try {
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objPayload)
      });
      const resData = await response.json();
      console.log('Object details:', JSON.stringify(resData.result, null, 2));
    } catch (err) {
      console.error(`Error fetching object ${m.objectId}:`, err);
    }
  }
}

main();
