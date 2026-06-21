async function main() {
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  const response = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getNormalizedMoveModule',
      params: [packageId, 'market_key']
    })
  });
  const data = await response.json();
  console.log('Structs:', JSON.stringify(data.result?.structs, null, 2));
  console.log('Functions:', JSON.stringify(data.result?.exposedFunctions, null, 2));
}
main().catch(console.error);
