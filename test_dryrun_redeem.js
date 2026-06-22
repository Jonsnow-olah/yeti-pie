import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient, JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const predictObject = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const quoteType = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';

async function main() {
  const client = new SuiJsonRpcClient({
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
  });

  const userAddress = '0x880c8bfe170cf53baeaf82317aa3b74d0ae13dbd994cb62b8d4a114561dac44c';
  const managerId = '0xb90ce5ccc6d7d5dc7f320ed447206c993f0ffb6d69ede2887e0fb9e94372e01b';
  
  const oracleSviId = '0xcb6491439578a4f9c0ee93a13a6a8ba0e223501b3668258b13c2f1b2b7704b72';
  const expiry = 1782068400000;
  const strikeRaw = 64082000000000n; // 64082 * 10^9
  const isAbove = true;
  const rawAmount = 2000000n; // 2 DUSDC

  const tx = new Transaction();
  tx.setSender(userAddress);

  const marketKey = tx.moveCall({
    target: `${packageId}::market_key::new`,
    arguments: [
      tx.pure.address(oracleSviId),
      tx.pure.u64(expiry),
      tx.pure.u64(strikeRaw),
      tx.pure.bool(isAbove)
    ]
  });

  tx.moveCall({
    target: `${packageId}::predict::redeem_permissionless`,
    typeArguments: [quoteType],
    arguments: [
      tx.object(predictObject),
      tx.object(managerId),
      tx.object(oracleSviId),
      marketKey,
      tx.pure.u64(rawAmount),
      tx.object('0x6')
    ]
  });

  const [withdrawnCoin] = tx.moveCall({
    target: `${packageId}::predict_manager::withdraw`,
    typeArguments: [quoteType],
    arguments: [
      tx.object(managerId),
      tx.pure.u64(rawAmount)
    ]
  });

  tx.transferObjects([withdrawnCoin], tx.pure.address(userAddress));

  console.log('Building transaction...');
  const bcsBytes = await tx.build({ client, onlyTransactionKind: true });
  const txBytes = Buffer.from(bcsBytes).toString('base64');

  console.log('Sending devInspectTransactionBlock...');
  const response = await fetch('https://fullnode.testnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_devInspectTransactionBlock',
      params: [userAddress, txBytes, null, null]
    })
  });

  const res = await response.json();
  if (res.error) {
    console.error('RPC Error:', res.error);
    return;
  }
  
  const status = res.result?.effects?.status;
  console.log('Simulation Status:', JSON.stringify(status, null, 2));
}

main().catch(console.error);
