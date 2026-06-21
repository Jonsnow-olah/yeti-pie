import { SuiJsonRpcClient, getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});
const USER_ADDRESS = '0xd6b744a7f0a6609c2ae90ec656e9f2851ec030382e9a0ddff5001973ed21e4eb';

async function main() {
  try {
    console.log(`Querying transaction blocks for user: ${USER_ADDRESS}...`);
    const txBlocks = await client.queryTransactionBlocks({
      query: {
        filter: {
          FromAddress: USER_ADDRESS
        }
      },
      limit: 50,
      order: 'descending'
    });

    console.log(`Found ${txBlocks.data.length} transactions. Searching for mint transactions...`);
    
    for (const tx of txBlocks.data) {
      const details = await client.getTransactionBlock({
        digest: tx.digest,
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true
        }
      });

      const transactions = details.transaction?.data?.transaction?.transactions;
      if (!transactions) continue;

      const hasMint = transactions.some(t => {
        if (t.MoveCall) {
          return t.MoveCall.function === 'mint';
        }
        return false;
      });

      if (hasMint) {
        console.log(`\n--- Found Mint Transaction: ${tx.digest} ---`);
        console.log(`Status: ${details.effects?.status?.status}`);
        const inputs = details.transaction?.data?.transaction?.inputs;
        console.log('Inputs:', JSON.stringify(inputs, null, 2));
        console.log('Transactions:', JSON.stringify(transactions, null, 2));
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
