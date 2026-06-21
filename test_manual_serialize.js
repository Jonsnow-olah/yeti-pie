import { bcs } from '@mysten/sui/bcs';
console.log('bcs keys:', Object.keys(bcs));

try {
  const serializedU64 = bcs.u64().serialize(1780992000000n).toBytes();
  console.log('serialized U64:', Buffer.from(serializedU64).toString('hex'));
} catch (e) {
  console.log('failed to serialize U64:', e.message);
}

try {
  const serializedAddress = bcs.Address.serialize('0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4').toBytes();
  console.log('serialized Address:', Buffer.from(serializedAddress).toString('hex'));
} catch (e) {
  console.log('failed to serialize Address:', e.message);
}

try {
  const serializedBool = bcs.bool().serialize(true).toBytes();
  console.log('serialized Bool:', Buffer.from(serializedBool).toString('hex'));
} catch (e) {
  console.log('failed to serialize Bool:', e.message);
}
