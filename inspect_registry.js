async function main() {
  const registryId = '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64';
  const response = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getObject',
      params: [registryId, { showContent: true }]
    })
  });
  const data = await response.json();
  console.log('Registry content:', JSON.stringify(data.result?.data, null, 2));
}
main().catch(console.error);
