import { SuiJsonRpcClient, getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({
  transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') })
});

// Print all methods on client
const methods = [];
let obj = client;
while (obj) {
  methods.push(...Object.getOwnPropertyNames(obj));
  obj = Object.getPrototypeOf(obj);
}
console.log(JSON.stringify([...new Set(methods)].sort(), null, 2));
