const PREDICT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const BASE_URL = 'https://predict-server.testnet.mystenlabs.com';

const endpoints = [
  `/predicts/${PREDICT_ID}/state`,
  `/predicts/${PREDICT_ID}/pricing`,
  `/predicts/${PREDICT_ID}/oracles`,
  `/predicts/${PREDICT_ID}/oracle`,
  `/predicts/${PREDICT_ID}/vaults`,
  `/predicts/${PREDICT_ID}/vault`,
  `/predicts/${PREDICT_ID}/prices`,
  `/predicts/${PREDICT_ID}/strikes`,
  `/oracles/${PREDICT_ID}`,
  `/pricing`,
  `/oracles`
];

async function testEndpoint(path) {
  try {
    const response = await fetch(`${BASE_URL}${path}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`\nSUCCESS: ${path}`);
      console.log(JSON.stringify(data, null, 2).substring(0, 1000));
    } else {
      console.log(`FAILED: ${path} (status: ${response.status})`);
    }
  } catch (err) {
    console.log(`ERROR: ${path} (${err.message})`);
  }
}

async function main() {
  console.log('Testing endpoints...');
  for (const path of endpoints) {
    await testEndpoint(path);
  }
}

main();
