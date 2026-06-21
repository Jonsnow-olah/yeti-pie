async function main() {
  const digest = 'E67aTrqVHMyUSfCRxyaoH5bGd8fd1vTQoWjLuNwKPoNt';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getTransactionBlock',
    params: [
      digest,
      {
        showInput: true,
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
        showBalanceChanges: true
      }
    ]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('Transaction details:');
    console.log(JSON.stringify(result.result.transaction, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
