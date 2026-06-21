async function main() {
  const response = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_getDynamicFields',
      params: ['0x3d39708b0ea8b028e9b26a7912b345928bb3b3db20fb489936fcb46824b949d6', null, 2]
    })
  });
  const data = await response.json();
  console.log(JSON.stringify(data.result.data[0], null, 2));
}
main();
