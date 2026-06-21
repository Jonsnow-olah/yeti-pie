async function main() {
  const objectId = '0xf7a7e0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4ebe0eb';
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
    console.log(JSON.stringify(result.result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}
main();
