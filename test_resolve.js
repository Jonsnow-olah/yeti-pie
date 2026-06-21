async function resolveOnChainPositionSize(
  managerId,
  oracleSviId,
  expiry,
  strike,
  direction
) {
  try {
    if (!managerId) return 0;
    console.log('Querying PredictManager positions table for size:', { managerId, oracleSviId, expiry, strike, direction });
    
    const managerResp = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [managerId, { showContent: true }]
      })
    });
    if (!managerResp.ok) return 0;
    const managerResult = await managerResp.json();
    const positionsTableId = managerResult?.result?.data?.content?.fields?.positions?.fields?.id?.id;
    if (!positionsTableId) return 0;

    const dirVal = direction === 'above' ? 1 : 0;
    const strikeVal = String(Math.floor(strike * 1_000_000_000));
    
    const dfResp = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_getDynamicFieldObject',
        params: [
          positionsTableId,
          {
            type: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::market_key::MarketKey`,
            value: {
              direction: dirVal,
              expiry: String(expiry),
              oracle_id: oracleSviId,
              strike: strikeVal
            }
          }
        ]
      })
    });
    if (!dfResp.ok) return 0;
    const dfResult = await dfResp.json();
    if (dfResult.error) {
      console.warn('RPC Dynamic field lookup failed:', dfResult.error);
      return 0;
    }
    
    const rawValue = dfResult.result?.data?.content?.fields?.value;
    if (!rawValue) return 0;
    
    return Number(rawValue) / 1_000_000;
  } catch (err) {
    console.error('Error in resolveOnChainPositionSize:', err);
    return 0;
  }
}

async function run() {
  const size = await resolveOnChainPositionSize(
    '0xf7a7e0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4ebe0eb',
    '0x5169649f6bf3ba756bbbef3a90a8e0da60883bbd7f0bb0fcb8acc2321ef6d63d',
    '1782460800000',
    60395,
    'above'
  );
  console.log('Resolved size:', size);
}

run();
