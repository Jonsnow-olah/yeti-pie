const { SuiClient, getFullnodeUrl } = require('@mysten/sui/client');
const { Transaction } = require('@mysten/sui/transactions');

const client = new SuiClient({ url: getFullnodeUrl('testnet') });

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const SENDER = '0x6f52dc69d50bcebc5f3f0126bb3de15c2dcc5fa5e49fdf401d687ddde996e3c2';
const MANAGER_ID = '0xf7a7e0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4ebe0eb';

async function main() {
  const tx = new Transaction();
  
  // Parameters
  const oracleSviId = '0x5169649f6bf3ba756bbbef3a90a8e0da60883bbd7f0bb0fcb8acc2321ef6d63d';
  const oracleExpiry = 1782460800000;
  const strike = 60395;
  const rawAmount = 1111429;
  
  // Construct MarketKey
  const marketKey = tx.moveCall({
    target: `${PACKAGE_ID}::market_key::new`,
    arguments: [
      tx.pure.address(oracleSviId),
      tx.pure.u64(oracleExpiry),
      tx.pure.u64(BigInt(strike * 1_000_000_000)),
      tx.pure.bool(true) // above
    ]
  });

  // Call redeem_permissionless
  tx.moveCall({
    target: `${PACKAGE_ID}::predict::redeem_permissionless`,
    typeArguments: ['0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'],
    arguments: [
      tx.object(PREDICT_OBJECT),
      tx.object(MANAGER_ID),
      tx.object(oracleSviId),
      marketKey,
      tx.pure.u64(rawAmount),
      tx.object('0x6')
    ]
  });

  // Call withdraw
  const [withdrawnCoin] = tx.moveCall({
    target: `${PACKAGE_ID}::predict_manager::withdraw`,
    typeArguments: ['0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'],
    arguments: [
      tx.object(MANAGER_ID),
      tx.pure.u64(rawAmount)
    ]
  });

  tx.transferObjects([withdrawnCoin], tx.pure.address(SENDER));

  try {
    console.log('Running devInspectTransactionBlock...');
    const result = await client.devInspectTransactionBlock({
      sender: SENDER,
      transactionBlock: tx
    });

    console.log('Status:', result.effects.status.status);
    if (result.effects.status.status === 'failure') {
      console.log('Error:', result.effects.status.error);
    }
  } catch (err) {
    console.error('RPC Error:', err);
  }
}

main();
