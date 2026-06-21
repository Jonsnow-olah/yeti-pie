const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('node_modules/@mysten/sui/package.json', 'utf8'));
console.log('exports:', JSON.stringify(pkg.exports, null, 2));
