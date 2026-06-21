async function main() {
  const objectId = '0x195833aeee071530d2bdcd2e03916b7458d57c81ed540b82d6e1cb594bdf41f2';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getObject',
    params: [
      objectId,
      {
        showContent: true,
        showOwner: true,
        showType: true
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
    console.log('Oracle fields:');
    console.log(JSON.stringify(result.result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
