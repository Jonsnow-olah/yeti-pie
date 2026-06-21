export interface ParsedIntent {
  rawText: string;
  success: boolean;
  action: 'mint' | 'supply' | 'redeem' | 'withdraw' | 'withdraw_manager' | 'vault_balance' | 'unknown';
  asset: string;
  amount: number;
  wagerAsset?: string; // The asset being wagered or supplied (SUI vs LOFI)
  strike?: number;
  direction?: 'above' | 'below' | 'range';
  lowerStrike?: number;
  upperStrike?: number;
  expiry?: string;
  error?: string;
  correctedText?: string;
  autocorrected?: boolean;
  positionId?: string;
  mappedStrike?: number;
  oracleSviId?: string;
  oracleExpiry?: number;
}

/**
 * Standard rule-based parsing using Regex to enable quick, API-free parsing.
 */
function parseRuleBased(text: string): ParsedIntent | null {
  const normalized = text.toLowerCase().trim();

  // Pattern 0: Query LP Vault Balance
  if (/vault\s*balance/i.test(normalized)) {
    return {
      rawText: text,
      success: true,
      action: 'vault_balance',
      asset: 'BTC',
      amount: 0
    };
  }

  // Pattern 1: Mint binary option
  // e.g. "bet 50 sui on btc above 72000" or "mint 10 lofi btc below 68500" or "bet 100 sui on lofi above 0.005"
  // Captures: amount, amount_multiplier, wagerAsset, asset, direction, strike, strike_multiplier
  const mintRegex = /(?:bet|mint|trade|place|put)?\s*(\d+(?:\.\d+)?)\s*(k|m)?\s*(sui|dusdc|usdc|lofi)?\s*(?:on|for)?\s*(btc|eth|lofi)\s*(above|below|over|under|up|down)\s*(?:\$)?\s*(\d+(?:\.\d+)?)\s*(k|m)?/i;
  const matchMint = normalized.match(mintRegex);

  if (matchMint) {
    let amount = parseFloat(matchMint[1]);
    const amountMult = matchMint[2] ? matchMint[2].toLowerCase() : '';
    if (amountMult === 'k') amount *= 1000;
    if (amountMult === 'm') amount *= 1000000;

    const wagerAsset = matchMint[3] ? matchMint[3].toUpperCase() : 'LOFI';
    const asset = matchMint[4].toUpperCase();
    let direction: 'above' | 'below' = 'above';
    if (['below', 'under', 'down'].includes(matchMint[5])) {
      direction = 'below';
    }

    let strike = parseFloat(matchMint[6]);
    const strikeMult = matchMint[7] ? matchMint[7].toLowerCase() : '';
    if (strikeMult === 'k') strike *= 1000;
    if (strikeMult === 'm') strike *= 1000000;

    return {
      rawText: text,
      success: true,
      action: 'mint',
      asset,
      wagerAsset: wagerAsset,
      amount,
      strike,
      direction,
      expiry: '1h' // Default rolling hourly expiry
    };
  }

  // Pattern 2: Supply liquidity to LP vault
  // e.g. "supply 100 sui" or "supply 50 lofi" or "provide 50 sui liquidity"
  const supplyRegex = /(?:supply|provide|deposit|add)\s+(\d+(?:\.\d+)?)\s*(k|m)?\s*(sui|dusdc|usdc|lofi)?\s*(?:liquidity|lp|vault)?/i;
  const matchSupply = normalized.match(supplyRegex);
  if (matchSupply) {
    let amount = parseFloat(matchSupply[1]);
    const amountMult = matchSupply[2] ? matchSupply[2].toLowerCase() : '';
    if (amountMult === 'k') amount *= 1000;
    if (amountMult === 'm') amount *= 1000000;

    const wagerAsset = matchSupply[3] ? matchSupply[3].toUpperCase() : 'LOFI';

    return {
      rawText: text,
      success: true,
      action: 'supply',
      asset: 'BTC', // Default underlying index
      wagerAsset: wagerAsset,
      amount
    };
  }

  // Pattern 2.7: Withdraw SUI/LOFI/USDC from Predict Manager
  // e.g. "withdraw 50 sui from manager" or "withdraw 50 lofi from manager"
  const withdrawManagerRegex = /(?:withdraw|remove|claim)\s+(\d+(?:\.\d+)?)\s*(k|m)?\s*(sui|dusdc|usdc|lofi)\s*(?:from\s*(?:manager|account))?/i;
  const matchWithdrawManager = normalized.match(withdrawManagerRegex);
  if (matchWithdrawManager) {
    let amount = parseFloat(matchWithdrawManager[1]);
    const amountMult = matchWithdrawManager[2] ? matchWithdrawManager[2].toLowerCase() : '';
    if (amountMult === 'k') amount *= 1000;
    if (amountMult === 'm') amount *= 1000000;

    const wagerAsset = matchWithdrawManager[3].toUpperCase();

    return {
      rawText: text,
      success: true,
      action: 'withdraw_manager',
      asset: 'BTC',
      wagerAsset: wagerAsset,
      amount
    };
  }

  // Pattern 2.5: Withdraw liquidity from LP vault (must go before generic redeem/withdraw)
  // e.g. "withdraw 100 lp" or "withdraw 100 plp" or "remove 100 liquidity"
  const withdrawRegex = /(?:withdraw|unstake|remove)\s+(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:lp|plp|liquidity)?/i;
  const matchWithdraw = normalized.match(withdrawRegex);
  if (matchWithdraw) {
    let amount = parseFloat(matchWithdraw[1]);
    const amountMult = matchWithdraw[2] ? matchWithdraw[2].toLowerCase() : '';
    if (amountMult === 'k') amount *= 1000;
    if (amountMult === 'm') amount *= 1000000;

    return {
      rawText: text,
      success: true,
      action: 'withdraw',
      asset: 'BTC',
      amount
    };
  }

  // Pattern 3: Redeem settled options
  // e.g. "redeem all" or "claim payout"
  const redeemRegex = /(?:redeem|claim|settle|withdraw)/i;
  if (redeemRegex.test(normalized)) {
    return {
      rawText: text,
      success: true,
      action: 'redeem',
      asset: 'BTC',
      amount: 0
    };
  }

  return null;
}

const TYPO_MAP: Record<string, string> = {
  // withdraw
  'withdra': 'withdraw',
  'withdrw': 'withdraw',
  'withdrawl': 'withdraw',
  'witdraw': 'withdraw',
  'whitdraw': 'withdraw',
  'wthdraw': 'withdraw',
  // unstake
  'unstak': 'unstake',
  'unstk': 'unstake',
  // supply
  'suplly': 'supply',
  'suply': 'supply',
  'suplay': 'supply',
  // deposit
  'depost': 'deposit',
  'deposite': 'deposit',
  'depositl': 'deposit',
  // redeem
  'redem': 'redeem',
  'redeme': 'redeem',
  // claim
  'calim': 'claim',
  'clam': 'claim',
  // bet
  'bte': 'bet',
  'betts': 'bet',
  // mint
  'mitn': 'mint',
  'mnt': 'mint',
  // remove
  'remov': 'remove',
  'removl': 'remove'
};

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,    // deletion
          matrix[i][j - 1] + 1,    // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

function autocorrectText(text: string): { corrected: string, changed: boolean, originalWord?: string, correctedWord?: string } {
  const words = text.split(/\s+/);
  const targetWords = ['bet', 'mint', 'trade', 'place', 'put', 'supply', 'provide', 'deposit', 'add', 'withdraw', 'unstake', 'remove', 'redeem', 'claim', 'settle'];
  
  let changed = false;
  let originalWord = '';
  let correctedWord = '';

  const correctedWords = words.map(word => {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    
    if (cleanWord.length < 3 || targetWords.includes(cleanWord) || ['btc', 'eth', 'sui', 'usdc', 'dusdc', 'lofi', 'lp', 'plp'].includes(cleanWord)) {
      return word;
    }

    // 1. Direct typo map check
    if (TYPO_MAP[cleanWord]) {
      changed = true;
      originalWord = word;
      correctedWord = TYPO_MAP[cleanWord];
      return word.replace(new RegExp(cleanWord, 'i'), TYPO_MAP[cleanWord]);
    }

    // 2. Levenshtein check
    let bestMatch = '';
    let minDistance = 999;
    
    for (const target of targetWords) {
      const dist = getLevenshteinDistance(cleanWord, target);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = target;
      }
    }

    const threshold = cleanWord.length <= 4 ? 1 : 2;
    if (minDistance <= threshold) {
      changed = true;
      originalWord = word;
      correctedWord = bestMatch;
      return word.replace(new RegExp(cleanWord, 'i'), bestMatch);
    }

    return word;
  });

  return {
    corrected: correctedWords.join(' '),
    changed,
    originalWord,
    correctedWord
  };
}

/**
 * Parses user input text into a structured trading intent.
 * Automatically falls back to rule-based parsing if no API key is set.
 */
export async function parseIntent(text: string, apiKey?: string): Promise<ParsedIntent> {
  const autocorrectResult = autocorrectText(text);
  const textToParse = autocorrectResult.corrected;

  const localParsed = parseRuleBased(textToParse);
  if (localParsed) {
    if (autocorrectResult.changed) {
      localParsed.correctedText = autocorrectResult.corrected;
      localParsed.autocorrected = true;
      localParsed.error = `corrected "${autocorrectResult.originalWord}" to "${autocorrectResult.correctedWord}"`;
    }
    return localParsed;
  }

  if (!apiKey) {
    // If no API key and rule-based fails, return a informative error
    return {
      rawText: text,
      success: false,
      action: 'unknown',
      asset: 'BTC',
      amount: 0,
      error: 'Could not understand intent. Try formats like: "bet 100 LOFI on BTC above 70000", "bet 100 LOFI on BTC below 65000", "supply 100 LOFI", or "withdraw 50 LOFI from manager". Add a Gemini API key in settings for advanced conversational parsing.'
    };
  }

  try {
    const systemPrompt = `You are a specialized parser for a DeFi prediction market called Yeti Predict.
Your task is to parse a plain-English trading instruction into a structured JSON format.

Available Actions:
- "mint": Mints a binary option (betting on price going above or below a strike) or range.
- "supply": Supplies quote currency (SUI or LOFI) to the liquidity provider vault (PLP).
- "withdraw": Withdraws quote currency (SUI or LOFI) from the liquidity provider vault (PLP) by burning PLP shares.
- "withdraw_manager": Withdraws quote currency (SUI or LOFI) from the user's Predict Manager account to their wallet.
- "redeem": Claims payouts for expired and won positions.
- "vault_balance": Queries or requests the total LP Vault balance.

Strict JSON format to return:
{
  "action": "mint" | "supply" | "withdraw" | "withdraw_manager" | "redeem" | "vault_balance" | "unknown",
  "asset": "BTC" | "ETH" | "LOFI" (default is "BTC"),
  "amount": number (parsed quote token amount),
  "strike": number (only for "mint", target strike price),
  "direction": "above" | "below" (only for "mint", direction relative to strike),
  "expiry": "1h" | "15m" | "24h" (default is "1h"),
  "wagerAsset": "SUI" | "LOFI" (default is "LOFI", which asset is being wagered or supplied),
  "error": string (only if action is "unknown", explain what went wrong in plain English)
}

Provide ONLY raw JSON. Do not include markdown code block formatting or backticks.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `User request: "${text}"` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('Empty response from Gemini API');
    }

    const parsed = JSON.parse(resultText);
    let parsedWagerAsset = parsed.wagerAsset || 'LOFI';
    if (parsedWagerAsset.toUpperCase() === 'USDC' || parsedWagerAsset.toUpperCase() === 'DUSDC') {
      parsedWagerAsset = 'LOFI';
    }
    return {
      rawText: text,
      success: parsed.action !== 'unknown',
      action: parsed.action || 'unknown',
      asset: parsed.asset || 'BTC',
      amount: parsed.amount || 0,
      wagerAsset: parsedWagerAsset,
      strike: parsed.strike,
      direction: parsed.direction,
      expiry: parsed.expiry || '1h',
      error: parsed.error
    };
  } catch (err: any) {
    console.error('Gemini parsing failed, falling back to basic matching:', err);
    return {
      rawText: text,
      success: false,
      action: 'unknown',
      asset: 'BTC',
      amount: 0,
      error: `Gemini AI failed to parse: ${err.message}. Try typing: "bet 100 LOFI on BTC above 70000"`
    };
  }
}
