async function main() {
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  const response = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: [packageId, { showBcs: true }]
    })
  });
  const data = await response.json();
  const rawBcs = data.result?.data?.bcs;
  if (rawBcs && rawBcs.dataType === 'package' && rawBcs.modules) {
    console.log('Package modules found:', Object.keys(rawBcs.modules));
  }
  
  // Let's also fetch with showContent: true to see if disassembled is there
  const responseContent = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: [packageId, { showContent: true }]
    })
  });
  const dataContent = await responseContent.json();
  const disassembled = dataContent.result?.data?.content?.disassembled;
  if (disassembled) {
    console.log('Disassembly of market_key:', disassembled['market_key']);
  } else {
    console.log('No disassembly field found in content.');
  }
}
main().catch(console.error);
