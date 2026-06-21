import { SuiJsonRpcClient, JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});

async function main() {
  try {
    const eventType = `${PACKAGE_ID}::predict::PositionMinted`;
    const events = await client.queryEvents({
      query: {
        MoveEventType: eventType
      },
      limit: 50,
      order: 'descending'
    });

    console.log('Timestamp (Local Time) | Strike | Tx Digest');
    console.log('------------------------------------------------');
    for (const event of events.data) {
      const parsed = event.parsedJson;
      const ms = parseInt(event.timestampMs);
      const dateStr = new Date(ms).toLocaleString();
      const strike = parsed ? (Number(parsed.strike) / 1_000_000_000) : 'N/A';
      console.log(`${dateStr} | ${strike} | ${event.id.txDigest}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
