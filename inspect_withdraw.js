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
    const predictManagerModule = modules['predict_manager'];
    
    console.log('predict_manager module:');
    for (const [funcName, funcDef] of Object.entries(predictManagerModule.exposedFunctions)) {
      console.log(`\nFunction: ${funcName}`);
      console.log(JSON.stringify(funcDef, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
