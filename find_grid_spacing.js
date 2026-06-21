const F = 63749.914369124;
const strikes = [60996, 61600, 63532, 63798, 64067, 64208];

console.log('Forward Price F =', F);

const logs = strikes.map(K => ({
  strike: K,
  k: Math.log(K / F)
}));

console.log('\nLog-moneyness k = ln(K/F):');
logs.forEach(item => {
  console.log(`K = ${item.strike} -> k = ${item.k.toFixed(8)}`);
});

// Let's compute differences between all pairs of k to see if they are multiples of some base step
console.log('\nDifferences between consecutive log-strikes:');
const sorted = logs.map(item => item.k).sort((a, b) => a - b);
for (let i = 1; i < sorted.length; i++) {
  const diff = sorted[i] - sorted[i-1];
  console.log(`Diff ${i}: ${diff.toFixed(8)}`);
}

// Let's check if there is a common divisor for these differences
// Possible step sizes in log space (e.g. 0.001, 0.0005, 0.0001, etc.)
const candidateSteps = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.00021988, 0.0021988, 0.0002747, 0.002747];
for (const step of candidateSteps) {
  console.log(`\nTesting step size: ${step}`);
  let maxError = 0;
  for (const k of sorted) {
    // k = i * step + offset
    // Let's assume offset = 0
    const i = Math.round(k / step);
    const expected = i * step;
    const error = Math.abs(k - expected);
    if (error > maxError) maxError = error;
    console.log(`  k = ${k.toFixed(6)} -> index = ${i}, expected = ${expected.toFixed(6)}, error = ${error.toFixed(6)}`);
  }
}
