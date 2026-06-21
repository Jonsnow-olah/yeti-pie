import { SuiJsonRpcClient, JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});

async function main() {
  try {
    console.log('Querying PositionMinted events...');
    const eventType = `${PACKAGE_ID}::predict::PositionMinted`;
    const events = await client.queryEvents({
      query: {
        MoveEventType: eventType
      },
      limit: 50,
      order: 'descending'
    });

    console.log(`Found ${events.data.length} events.`);
    
    const successfulStrikes = new Set();
    const allMints = [];

    for (const event of events.data) {
      const parsed = event.parsedJson;
      // Let's print one to see structure
      if (allMints.length === 0) {
        console.log('Sample Event Data:', JSON.stringify(parsed, null, 2));
      }
      
      // Look for strike or market key fields in event
      if (parsed) {
        // Event might contain a market_key or strike
        // Let's extract strike from parsed event fields
        // In Move, PositionMinted event fields could have `strike` or `market_key`
        let strikeNum = null;
        if (parsed.strike !== undefined) {
          strikeNum = Number(parsed.strike) / 1_000_000_000;
        } else if (parsed.market_key && parsed.market_key.strike !== undefined) {
          strikeNum = Number(parsed.market_key.strike) / 1_000_000_000;
        }

        if (strikeNum !== null) {
          successfulStrikes.add(strikeNum);
          allMints.push({
            txDigest: event.id.txDigest,
            strike: strikeNum,
            parsed
          });
        }
      }
    }

    console.log('\nAll Successful Mints from Events:');
    console.log(JSON.stringify(allMints.map(m => ({ txDigest: m.txDigest, strike: m.strike })), null, 2));

    console.log('\nUnique Successful Strike Prices:');
    console.log(Array.from(successfulStrikes).sort((a, b) => a - b));

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
