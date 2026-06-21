async function main() {
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getObject',
    params: [packageId, { showBcs: true }]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    const bytecodeBase64 = result.result.data.bcs.moduleMap['oracle_config'];
    const bytes = Buffer.from(bytecodeBase64, 'base64');
    
    console.log('First 64 bytes of bytecode (hex):');
    console.log(bytes.subarray(0, 64).toString('hex'));
  } catch (error) {
    console.error('Error:', error);
  }
}
main();
