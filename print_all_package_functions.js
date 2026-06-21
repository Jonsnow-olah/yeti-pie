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
    
    for (const [moduleName, moduleDef] of Object.entries(modules)) {
      console.log(`\nModule: ${moduleName}`);
      for (const [funcName, funcDef] of Object.entries(moduleDef.exposedFunctions)) {
        if (funcDef.visibility === 'Public' || funcDef.isEntry) {
          console.log(`  - ${funcName}: visibility=${funcDef.visibility}, isEntry=${funcDef.isEntry}`);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
