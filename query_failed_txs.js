async function main() {
  const url = 'https://fullnode.testnet.sui.io:443';
  const senderAddress = '0x6f52dc69d50bcebc5f3f0126bb3de15c2dcc5fa5e49fdf401d687ddde996e3c2';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_queryTransactionBlocks',
    params: [
      {
        filter: {
          FromAddress: senderAddress
        },
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true
        }
      },
      null,
      20,
      true
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!result.result || !result.result.data) {
      console.log('No transactions found:', result);
      return;
    }
    
    console.log(`Found ${result.result.data.length} transactions for sender.`);
    for (const tx of result.result.data) {
      const status = tx.effects?.status;
      if (status?.status === 'failure') {
        console.log(`\n==========================================`);
        console.log(`Digest: ${tx.digest}`);
        console.log(`Status: ${status.status}`);
        console.log(`Error: ${status.error}`);
        
        const transactions = tx.transaction?.data?.transaction?.transactions;
        const inputs = tx.transaction?.data?.transaction?.inputs;
        
        if (transactions) {
          console.log('Transactions:', JSON.stringify(transactions, null, 2));
        }
        if (inputs) {
          console.log('Inputs:', JSON.stringify(inputs, null, 2));
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
