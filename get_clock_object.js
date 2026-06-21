async function main() {
  const objectId = '0x0000000000000000000000000000000000000000000000000000000000000006';
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getObject',
    params: [objectId, { showOwner: true }]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    console.log(JSON.stringify(result.result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}
main();
