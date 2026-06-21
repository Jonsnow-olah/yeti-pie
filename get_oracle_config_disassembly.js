async function main() {
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
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
  if (disassembled && disassembled['oracle_config']) {
    console.log('Disassembly of oracle_config:', disassembled['oracle_config']);
  } else {
    console.log('No disassembly found for oracle_config.');
  }
}
main().catch(console.error);
