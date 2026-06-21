import { CoreClient } from '@mysten/sui/client';
import { JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';

console.log('CoreClient methods:', Object.getOwnPropertyNames(CoreClient.prototype));
console.log('CoreClient constructor properties:', Object.keys(CoreClient));
