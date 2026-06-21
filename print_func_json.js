async function main() {
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getNormalizedMoveModulesByPackage',
    params: [packageId]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    const modules = result.result;
    const predictModule = modules['predict'];
    
    console.log('compact_settled_oracle Function Full JSON:');
    console.log(JSON.stringify(predictModule.exposedFunctions['compact_settled_oracle'], null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
