import { parseIntent } from './src/services/intentParser.js';

async function test(text) {
  const parsed = await parseIntent(text);
  console.log(`Input: "${text}"`);
  console.log(`  Action: ${parsed.action}`);
  console.log(`  Amount: ${parsed.amount}`);
  console.log(`  Strike: ${parsed.strike}`);
  console.log(`  Direction: ${parsed.direction}`);
  console.log(`  Success: ${parsed.success}`);
  console.log('-----------------------------------');
}

async function main() {
  await test('bet 0.01 usdc on btc below 65k');
  await test('mint 10 dusdc btc above 65.5k');
  await test('supply 10k usdc');
  await test('withdraw 1.5m lp');
  await test('withdra 0.01 lp');
  await test('suplly 100 usdc');
}

main();
