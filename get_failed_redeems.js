import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });

async function main() {
  try {
    console.log('Querying transaction blocks for redeem_permissionless...');
    const txBlocks = await client.queryTransactionBlocks({
      query: {
        filter: {
          MoveFunction: {
            package: PACKAGE_ID,
            module: 'predict',
            function: 'redeem_permissionless'
          }
        }
      },
      limit: 20,
      order: 'descending'
    });

    console.log(`Found ${txBlocks.data.length} transactions. Fetching details...`);
    
    for (const tx of txBlocks.data) {
      const details = await client.getTransactionBlock({
        digest: tx.digest,
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true
        }
      });

      const status = details.effects?.status;
      const sender = details.transaction?.data?.sender;
      
      console.log(`\nDigest: ${tx.digest}`);
      console.log(`Sender: ${sender}`);
      console.log(`Status: ${status?.status}`);
      if (status?.error) {
        console.log(`Error: ${status.error}`);
      }

      // Check transactions details
      const transactions = details.transaction?.data?.transaction?.transactions;
      const inputs = details.transaction?.data?.transaction?.inputs;
      
      if (transactions) {
        console.log('PTB transactions:');
        console.log(JSON.stringify(transactions, null, 2));
      }
      if (inputs) {
        console.log('PTB inputs:');
        console.log(JSON.stringify(inputs, null, 2));
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
