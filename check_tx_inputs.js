import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
tx.sharedObjectRef({
  objectId: '0x0000000000000000000000000000000000000000000000000000000000000006',
  initialSharedVersion: '6',
  mutable: false
});

console.log('inputs:', JSON.stringify(tx.getData().inputs, null, 2));
