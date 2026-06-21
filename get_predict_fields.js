async function main() {
  const objectId = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
  
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
    console.log('Predict Object fields:');
    console.log(JSON.stringify(result.result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
