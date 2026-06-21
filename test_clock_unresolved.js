import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PREDICT_OBJECT_ID = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const ORACLE_SVI_ID = '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4';

async function main() {
  try {
    const tx = new Transaction();
    tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');
    
    // Resolved shared object references
    const predictArg = tx.sharedObjectRef({
      objectId: PREDICT_OBJECT_ID,
      initialSharedVersion: 829857685,
      mutable: true
    });

    const oracleArg = tx.sharedObjectRef({
      objectId: ORACLE_SVI_ID,
      initialSharedVersion: 891314392,
      mutable: false
    });

    // clock as tx.object('0x6')
    const clockArg = tx.object('0x6');

    // Resolved pure arguments
    const oracleIdArg = tx.pure(bcs.Address.serialize(ORACLE_SVI_ID).toBytes());
    const expiryArg = tx.pure(bcs.u64().serialize(1780992000000n).toBytes());
    const strikeArg = tx.pure(bcs.u64().serialize(65000000000000n).toBytes());
    const isAboveArg = tx.pure(bcs.bool().serialize(true).toBytes());
    const sizeArg = tx.pure(bcs.u64().serialize(1000000n).toBytes());

    // Move Calls
    const marketKey = tx.moveCall({
      target: `${PACKAGE_ID}::market_key::new`,
      arguments: [
        oracleIdArg,
        expiryArg,
        strikeArg,
        isAboveArg
      ]
    });

    tx.moveCall({
      target: `${PACKAGE_ID}::predict::get_trade_amounts`,
      arguments: [
        predictArg,
        oracleArg,
        marketKey,
        sizeArg,
        clockArg
      ]
    });

    console.log('Building transaction Kind...');
    const bcsBytes = await tx.build({ onlyTransactionKind: true });
    console.log('Successfully built! BCS length:', bcsBytes.length);
  } catch (error) {
    console.error('Error:', error.stack || error.message);
  }
}

main();
