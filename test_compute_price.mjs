import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

const PACKAGE_ID = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const ORACLE_SVI_ID = '0xdb79b5b821e5294f4ac8a30ef894e595b9a1c56381a12131ec5b43e4c19cca6f';
const INITIAL_SHARED_VERSION = 909973096;

async function run() {
  const strikes = [62000, 62500, 63000, 63300, 63400, 63500, 64000];
  
  for (const strike of strikes) {
    const tx = new Transaction();
    tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000000');

    const oracleArg = tx.sharedObjectRef({ objectId: ORACLE_SVI_ID, initialSharedVersion: INITIAL_SHARED_VERSION, mutable: false });
    const strikeArg = tx.pure(bcs.u64().serialize(BigInt(Math.floor(strike * 1_000_000_000))).toBytes());

    tx.moveCall({
      target: PACKAGE_ID + '::oracle::compute_price',
      arguments: [oracleArg, strikeArg]
    });

    try {
      const bcsBytes = await tx.build({ onlyTransactionKind: true });
      const txBytes = Buffer.from(bcsBytes).toString('base64');

      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_devInspectTransactionBlock',
          params: ['0x0000000000000000000000000000000000000000000000000000000000000000', txBytes, null, null]
        })
      });
      const res = await response.json();
      if (res.error) {
        console.log(`strike ${strike} -> RPC error:`, res.error);
      } else if (res.result.effects.status.status === 'success') {
        const returnValues = res.result.results[0].returnValues;
        const valBytes = returnValues[0][0];
        let val = 0n;
        for (let i = 0; i < valBytes.length; i++) {
          val += BigInt(valBytes[i]) * (256n ** BigInt(i));
        }
        console.log(`strike ${strike} -> Success: price=${val} (${(Number(val)/1_000_000_000).toFixed(6)})`);
      } else {
        console.log(`strike ${strike} -> Failed:`, res.result.effects.status.error);
      }
    } catch (err) {
      console.error(`strike ${strike} error:`, err);
    }
  }
}

run();
