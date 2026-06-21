async function main() {
  const tableId = '0x14902bc703f699b81095b43009fa35f26206a9ad8a181ef1fd67d464e1bceb49';
  const oracleId = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_getDynamicFieldObject',
    params: [
      tableId,
      {
        type: '0x2::object::ID',
        value: oracleId
      }
    ]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('Raw result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
