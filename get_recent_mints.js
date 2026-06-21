import { SuiJsonRpcClient, JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});

async function main() {
  try {
    console.log('Querying transaction blocks...');
    const txBlocks = await client.queryTransactionBlocks({
      query: {
        filter: {
          MoveFunction: {
            package: PACKAGE_ID,
            module: 'predict',
            function: 'mint'
          }
        }
      },
      limit: 50,
      order: 'descending'
    });

    console.log(`Found ${txBlocks.data.length} mint transactions. Fetching details...`);
    
    const successfulStrikes = new Set();
    const allMints = [];

    for (const tx of txBlocks.data) {
      const details = await client.getTransactionBlock({
        digest: tx.digest,
        options: {
          showInput: true,
          showEffects: true
        }
      });

      const status = details.effects?.status?.status;
      if (status !== 'success') {
        continue;
      }

      // Parse the programmable transaction block inputs
      const transactions = details.transaction?.data?.transaction?.transactions;
      const inputs = details.transaction?.data?.transaction?.inputs;

      if (!transactions || !inputs) continue;

      // Find the market_key::new call
      const marketKeyCall = transactions.find(t => 
        t.MoveCall && 
        t.MoveCall.module === 'market_key' && 
        t.MoveCall.function === 'new'
      );

      if (marketKeyCall) {
        // Find the strike argument in inputs
        // Arguments are usually formatted like { Kind: 'Input', index: N }
        const strikeArgIdx = marketKeyCall.MoveCall.arguments[2];
        if (strikeArgIdx && strikeArgIdx.Input !== undefined) {
          const inputObj = inputs[strikeArgIdx.Input];
          // inputObj is usually { type: 'pure', value: '...' }
          if (inputObj && inputObj.value) {
            const rawStrike = BigInt(inputObj.value);
            const strikeNum = Number(rawStrike) / 1_000_000_000;
            successfulStrikes.add(strikeNum);
            allMints.push({
              digest: tx.digest,
              strike: strikeNum,
              raw: inputObj.value
            });
          }
        }
      }
    }

    console.log('\nAll Successful Mints found:');
    console.log(JSON.stringify(allMints, null, 2));

    console.log('\nUnique Successful Strike Prices:');
    console.log(Array.from(successfulStrikes).sort((a, b) => a - b));

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
