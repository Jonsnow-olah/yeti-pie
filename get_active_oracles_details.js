async function main() {
  const PREDICT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
  const URL = `https://predict-server.testnet.mystenlabs.com/predicts/${PREDICT_ID}/oracles`;
  const response = await fetch(URL);
  const oracles = await response.json();
  const active = oracles.filter(x => x.status === 'active');
  console.log(`Found ${active.length} active oracles:`);
  for (const o of active) {
    console.log(`- ID: ${o.id}, Expiry: ${o.expiry}, Underlying: ${o.underlying_asset}, Status: ${o.status}`);
  }
}
main().catch(console.error);
