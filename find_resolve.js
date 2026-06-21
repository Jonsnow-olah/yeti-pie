import fs from 'fs';
import path from 'path';

function searchDir(dir, term) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath, term);
    } else if (file.endsWith('.mjs') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(term)) {
        console.log(`Found "${term}" in: ${fullPath}`);
      }
    }
  }
}

searchDir('node_modules/@mysten/sui/dist', 'resolveTransactionPlugin');
