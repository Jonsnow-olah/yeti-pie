async function main() {
  const PREDICT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
  const URL = `https://predict-server.testnet.mystenlabs.com/predicts/${PREDICT_ID}/oracles`;
  const response = await fetch(URL);
  const oracles = await response.json();
  if (oracles.length > 0) {
    console.log('Sample Oracle fields:', JSON.stringify(oracles[0], null, 2));
  } else {
    console.log('No oracles found.');
  }
}
main().catch(console.error);
