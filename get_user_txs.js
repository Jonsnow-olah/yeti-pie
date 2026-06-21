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

    console.log(`Found ${txBlocks.data.length} transactions. Listing digests and statuses:`);
    
    for (const tx of txBlocks.data) {
      const details = await client.getTransactionBlock({
        digest: tx.digest,
        options: {
          showEffects: true
        }
      });
      const status = details.effects?.status?.status;
      const error = details.effects?.status?.error;
      console.log(`Digest: ${tx.digest} | Status: ${status} ${error ? '| Error: ' + error : ''}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
