const fs = require('fs');

function parseBytecode(bytes) {
  let pos = 0;
  const magic = bytes.readUInt32LE(pos); pos += 4;
  const version = bytes.readUInt32LE(pos); pos += 4;
  const tableCount = bytes[pos]; pos += 1;
  
  console.log(`Magic: 0x${magic.toString(16).toUpperCase()}`);
  console.log(`Version: ${version}`);
  console.log(`Table Count: ${tableCount}`);
  
  let constantTableOffset = 0;
  let constantTableLen = 0;
  
  for (let i = 0; i < tableCount; i++) {
    const tableType = bytes[pos]; pos += 1;
    const offset = bytes.readUInt32LE(pos); pos += 4;
    const length = bytes.readUInt32LE(pos); pos += 4;
    
    if (tableType === 12) {
      constantTableOffset = offset;
      constantTableLen = length;
    }
  }
  
  if (constantTableLen === 0) {
    console.log('No constant pool found.');
    return;
  }
  
  pos = constantTableOffset;
  const [count, bytesRead] = readUleb128(bytes, pos);
  pos += bytesRead;
  console.log(`Constant pool size: ${count} constants\n`);
  
  for (let i = 0; i < count; i++) {
    const typeToken = bytes[pos]; pos += 1;
    const [len, lenBytesRead] = readUleb128(bytes, pos);
    pos += lenBytesRead;
    
    const rawVal = bytes.subarray(pos, pos + len);
    pos += len;
    
    console.log(`Constant #${i}:`);
    console.log(`  Type Token: ${typeToken}`);
    console.log(`  Length: ${len}`);
    console.log(`  Hex: ${rawVal.toString('hex')}`);
    
    try {
      if (len === 1) {
        console.log(`  As U8: ${rawVal[0]}`);
      } else if (len === 8) {
        console.log(`  As U64: ${rawVal.readBigUInt64LE(0).toString()}`);
      } else if (len === 16) {
        console.log(`  As U128: ${rawVal.toString('hex')} (bigint)`);
      } else {
        const str = rawVal.toString('utf8');
        if (/^[a-zA-Z0-9_\-\s:\/]{2,100}$/.test(str)) {
          console.log(`  As String: "${str}"`);
        }
      }
    } catch (e) {}
  }
}

function readUleb128(buffer, startOffset) {
  let value = 0;
  let shift = 0;
  let offset = startOffset;
  while (true) {
    const byte = buffer[offset];
    offset += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }
  return [value, offset - startOffset];
}

async function main() {
  const packageId = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sui_getObject',
    params: [
      packageId,
      { showBcs: true }
    ]
  };

  try {
    const response = await fetch('https://fullnode.testnet.sui.io:443', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    const bcsData = result.result.data.bcs;
    const bytecodeBase64 = bcsData.moduleMap['oracle_config'];
    const bytes = Buffer.from(bytecodeBase64, 'base64');
    
    parseBytecode(bytes);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
