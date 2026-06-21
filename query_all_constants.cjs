const fs = require('fs');

function parseBytecode(moduleName, bytes) {
  let pos = 0;
  const magic = bytes.readUInt32LE(pos); pos += 4;
  const version = bytes[pos]; pos += 1;
  const tableCount = bytes[pos]; pos += 1;
  
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
    return;
  }
  
  pos = constantTableOffset;
  const [count, bytesRead] = readUleb128(bytes, pos);
  pos += bytesRead;
  
  for (let i = 0; i < count; i++) {
    const typeToken = bytes[pos]; pos += 1;
    const [len, lenBytesRead] = readUleb128(bytes, pos);
    pos += lenBytesRead;
    
    const rawVal = bytes.subarray(pos, pos + len);
    pos += len;
    
    // Print u64/u8 constants
    if (len === 8) {
      const val = rawVal.readBigUInt64LE(0);
      console.log(`[${moduleName}] Constant #${i}: As U64: ${val.toString()}`);
    } else if (len === 1) {
      console.log(`[${moduleName}] Constant #${i}: As U8: ${rawVal[0]}`);
    } else {
      const str = rawVal.toString('utf8');
      if (/^[a-zA-Z0-9_\-\s:\/]{2,100}$/.test(str)) {
        console.log(`[${moduleName}] Constant #${i}: As String: "${str}"`);
      }
    }
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
    
    for (const [moduleName, bytecodeBase64] of Object.entries(bcsData.moduleMap)) {
      const bytes = Buffer.from(bytecodeBase64, 'base64');
      parseBytecode(moduleName, bytes);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
