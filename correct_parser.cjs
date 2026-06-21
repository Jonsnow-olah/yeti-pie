const fs = require('fs');

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

function parseBytecode(moduleName, bytes, outLines) {
  let pos = 0;
  const magic = bytes.readUInt32LE(pos); pos += 4;
  const version = bytes.readUInt32LE(pos); pos += 4;
  const tableCount = bytes[pos]; pos += 1;
  
  let constantTableOffset = 0;
  let constantTableLen = 0;
  
  for (let i = 0; i < tableCount; i++) {
    const tableType = bytes[pos]; pos += 1;
    const [offset, offsetBytes] = readUleb128(bytes, pos); pos += offsetBytes;
    const [length, lengthBytes] = readUleb128(bytes, pos); pos += lengthBytes;
    
    if (tableType === 5) { // CONSTANTS
      constantTableOffset = offset;
      constantTableLen = length;
    }
  }
  
  if (constantTableLen === 0) {
    return;
  }
  
  outLines.push(`\nModule: ${moduleName}`);
  
  pos = constantTableOffset;
  const [count, bytesRead] = readUleb128(bytes, pos); pos += bytesRead;
  
  for (let i = 0; i < count; i++) {
    const typeToken = bytes[pos]; pos += 1;
    const [len, lenBytesRead] = readUleb128(bytes, pos); pos += lenBytesRead;
    
    const rawVal = bytes.subarray(pos, pos + len); pos += len;
    
    let decoded = '';
    if (len === 1) {
      decoded = `U8: ${rawVal[0]}`;
    } else if (len === 8) {
      decoded = `U64: ${rawVal.readBigUInt64LE(0).toString()}`;
    } else if (len === 16) {
      decoded = `U128: ${rawVal.toString('hex')} (LE bigint)`;
    } else {
      const str = rawVal.toString('utf8');
      decoded = `String: "${str.replace(/[^a-zA-Z0-9_\-\s:\/]/g, '.')}" (len: ${len})`;
    }
    outLines.push(`  Constant #${i}: Type Token: ${typeToken}, ${decoded}`);
  }
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
    
    const outLines = [];
    for (const [moduleName, bytecodeBase64] of Object.entries(bcsData.moduleMap)) {
      const bytes = Buffer.from(bytecodeBase64, 'base64');
      parseBytecode(moduleName, bytes, outLines);
    }
    
    fs.writeFileSync('constants_output.txt', outLines.join('\n'));
    console.log('Saved constants to constants_output.txt');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
