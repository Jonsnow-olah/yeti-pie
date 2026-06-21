const PREDICT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const URL = `https://predict-server.testnet.mystenlabs.com/predicts/${PREDICT_ID}/oracles`;

async function main() {
  try {
    const response = await fetch(URL);
    if (!response.ok) {
      throw new Error(`Failed: status ${response.status}`);
    }
    const oracles = await response.json();
    console.log(`Total oracles found: ${oracles.length}`);
    
    const active = oracles.filter(o => o.status !== 'settled');
    console.log('\nActive Oracles:');
    console.log(JSON.stringify(active, null, 2));

    const activeBtc = active.filter(o => o.underlying_asset === 'BTC');
    console.log('\nActive BTC Oracles:');
    console.log(JSON.stringify(activeBtc, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
