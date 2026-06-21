async function main() {
  const tableId = '0x3d39708b0ea8b028e9b26a7912b345928bb3b3db20fb489936fcb46824b949d6';
  const name = {
    type: "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::market_key::MarketKey",
    value: {
      direction: true,
      expiry: "1781445600000",
      oracle_id: "0x5b5fdad2a40e11894d3eb475908e27c1a8433ec09bb1cf82bc4e57bf0076a086",
      strike: "3450000000000"
    }
  };

  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getDynamicFieldObject',
    params: [tableId, name]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}
main();
