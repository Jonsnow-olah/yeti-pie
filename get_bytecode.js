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
    if (result.error) {
      console.error('RPC Error:', result.error);
      return;
    }

    const bcsData = result.result.data.bcs;
    if (bcsData && bcsData.dataType === 'package') {
      const moduleMap = bcsData.moduleMap;
      const predictBytecodeBase64 = moduleMap['predict'];
      if (predictBytecodeBase64) {
        console.log('Successfully fetched predict module bytecode.');
        // Decode base64 to bytes
        const bytes = Buffer.from(predictBytecodeBase64, 'base64');
        console.log(`Bytecode size: ${bytes.length} bytes.`);
        
        // Scan for push instructions and abort codes
        // In Move bytecode, the opcode for Abort is 0x05
        // Let's print out around abort instructions or search for constant error codes
        // Error codes in Move are usually defined as constants at the beginning of the module.
        // Let's search for the pattern of constant definitions or error codes in the bytecode.
        // Let's print the hex dump of the first 500 bytes (header and constants)
        console.log('Hex dump of header & constant pool:');
        const hex = bytes.toString('hex');
        console.log(hex.substring(0, 800));
      } else {
        console.log('predict module bytecode not found in package');
      }
    } else {
      console.log('Not a package object');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
