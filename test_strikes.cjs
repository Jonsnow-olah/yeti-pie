const { Transaction } = require('@mysten/sui/transactions');
const { SuiClient } = require('@mysten/sui/client');

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';

const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });

async function testStrike(strike) {
  const tx = new Transaction();
  
  // Construct MarketKey
  const marketKey = tx.moveCall({
    target: `${PACKAGE_ID}::market_key::new`,
    arguments: [
      tx.pure.address(ORACLE_SVI_ID),
      tx.pure.u64(1780992000000), // Expiry
      tx.pure.u64(BigInt(Math.floor(strike * 1_000_000_000))), // Strike scaled
      tx.pure.bool(true)
    ]
  });

  // Call get_trade_amounts
  tx.moveCall({
    target: `${PACKAGE_ID}::predict::get_trade_amounts`,
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(ORACLE_SVI_ID),
      marketKey,
      tx.pure.u64(1000000), // 1 USDC size
      tx.object('0x6') // Clock
    ]
  });

  try {
    const bcs = await tx.build({ client });
    const txBytes = Buffer.from(bcs).toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_devInspectTransactionBlock',
      params: [
        '0x0000000000000000000000000000000000000000000000000000000000000000', // sender
        txBytes,
        null, // gasPrice
        null  // epoch
      ]
    };

    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.error) {
      return { success: false, error: result.error.message };
    }

    const inspectResult = result.result;
    if (inspectResult.effects.status.status === 'success') {
      return { success: true };
    } else {
      return { success: false, error: inspectResult.effects.status.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  const strikesToTest = [65000, 63798, 63532, 60996, 63750, 64000, 63000];
  console.log('Testing strikes...');
  for (const strike of strikesToTest) {
    const res = await testStrike(strike);
    console.log(`Strike: ${strike} -> Success: ${res.success}${res.success ? '' : `, Error: ${res.error}`}`);
  }
}

main();
