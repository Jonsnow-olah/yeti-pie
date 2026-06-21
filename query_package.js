import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl('testnet'),
  network: 'testnet'
});

async function main() {
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  console.log('Fetching modules...');
  const modules = await client.getNormalizedMoveModulesByPackage({ package: packageId });
  
  console.log('\nExposed Functions in registry:');
  if (modules.registry) {
    for (const [name, func] of Object.entries(modules.registry.exposedFunctions)) {
      if (func.visibility === 'Public') {
        console.log(`- registry::${name}: isEntry=${func.isEntry}, parameters=${func.parameters.length}, returns=${JSON.stringify(func.return)}`);
      }
    }
  }

  console.log('\nExposed Functions in predict containing new/create/open:');
  if (modules.predict) {
    for (const [name, func] of Object.entries(modules.predict.exposedFunctions)) {
      if (func.visibility === 'Public' && (name.includes('new') || name.includes('create') || name.includes('open') || name.includes('manager'))) {
        console.log(`- predict::${name}: isEntry=${func.isEntry}, parameters=${func.parameters.length}, returns=${JSON.stringify(func.return)}`);
      }
    }
  }
}

main().catch(console.error);
