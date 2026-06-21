async function main() {
  const PREDICT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
  const URL = `https://predict-server.testnet.mystenlabs.com/predicts/${PREDICT_ID}/oracles`;
  const response = await fetch(URL);
  const oracles = await response.json();
  const assets = new Set(oracles.map(x => x.underlying_asset));
  console.log('Supported assets:', Array.from(assets));
  console.log('Oracle status counts:', oracles.reduce((acc, x) => {
    acc[x.status] = (acc[x.status] || 0) + 1;
    return acc;
  }, {}));
  console.log('Oracle count per asset:', oracles.reduce((acc, x) => {
    acc[x.underlying_asset] = (acc[x.underlying_asset] || 0) + 1;
    return acc;
  }, {}));
}
main().catch(console.error);
