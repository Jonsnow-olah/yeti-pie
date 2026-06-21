async function main() {
  const managerId = '0xf7a7e0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4ebe0eb';
  const response = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: [managerId, { showContent: true }]
    })
  });
  const data = await response.json();
  const tableId = data.result?.data?.content?.fields?.positions?.fields?.id?.id;
  console.log('Table ID:', tableId);
}
main().catch(console.error);
