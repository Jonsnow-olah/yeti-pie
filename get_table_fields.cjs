async function main() {
  const tableId = '0x3d39708b0ea8b028e9b26a7912b345928bb3b3db20fb489936fcb46824b949d6';
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_getDynamicFields',
    params: [tableId]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    console.log(JSON.stringify(result.result.data.slice(0, 5), null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}
main();
