async function main() {
  const url = 'https://fullnode.testnet.sui.io:443';
  const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'suix_queryTransactionBlocks',
    params: [
      {
        filter: {
          MoveFunction: {
            package: PACKAGE_ID,
            module: 'predict',
            function: 'redeem_permissionless'
          }
        },
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true
        }
      },
      null, // cursor
      10, // limit
      true // descending
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
      console.log('No transaction blocks found or error:', result);
      return;
    }
    
    console.log(`Found ${result.result.data.length} transactions.`);
    for (const tx of result.result.data) {
      const status = tx.effects?.status;
      const sender = tx.transaction?.data?.sender;
      console.log(`\n==========================================`);
      console.log(`Digest: ${tx.digest}`);
      console.log(`Sender: ${sender}`);
      console.log(`Status: ${status?.status}`);
      if (status?.error) {
        console.log(`Error: ${status.error}`);
      }
      
      const transactions = tx.transaction?.data?.transaction?.transactions;
      const inputs = tx.transaction?.data?.transaction?.inputs;
      
      if (transactions) {
        console.log('Transactions:', JSON.stringify(transactions, null, 2));
      }
      if (inputs) {
        console.log('Inputs:', JSON.stringify(inputs, null, 2));
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
