async function main() {
  const predictId = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
  try {
    const response = await fetch(`https://predict-server.testnet.mystenlabs.com/predicts/${predictId}/state`);
    if (response.ok) {
      const data = await response.json();
      console.log('State data:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('Response status:', response.status);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

main();
