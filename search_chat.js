const fs = require('fs');
const filePath = 'C:/Users/Spectre/.gemini/antigravity/scratch/predict-intent-engine/predict_disassembly.txt';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let startIndex = -1;
lines.forEach((line, index) => {
  if (line.includes('public redeem_permissionless')) {
    startIndex = index;
  }
});

if (startIndex !== -1) {
  for (let i = startIndex; i < startIndex + 60; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
} else {
  console.log('redeem_permissionless not found');
}
