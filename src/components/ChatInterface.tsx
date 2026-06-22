import React, { useState, useEffect, useRef } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient, ConnectButton } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { 
  Send, Cpu, ShieldCheck, AlertTriangle, CheckCircle, 
  Wallet, Settings, RefreshCw, ExternalLink, TrendingUp, 
  User, Info, X, Layers, Play, PlusCircle, Menu, Mic, Bell, History, Headphones
} from 'lucide-react';
import type { ParsedIntent } from '../services/intentParser';
import type { CompiledPTB } from '../services/transactionBuilder';
import type { GuardianReport } from '../services/guardian';
import { parseIntent } from '../services/intentParser';
import { buildPTB, buildCreateManagerPTB, PREDICT_CONFIG } from '../services/transactionBuilder';
import { auditTransaction } from '../services/guardian';

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: Date;
  intent?: ParsedIntent;
  ptb?: CompiledPTB;
  guardian?: GuardianReport;
  executed?: boolean;
  txDigest?: string;
  histId?: string; // Link message to history item
  parentMessageId?: string; // Link agent reply to user message
  isSystemNotification?: boolean; // Link message as system alert
  showSupportButton?: boolean; // Display support help button
}

interface SupportMessage {
  id: string;
  sender: 'user' | 'support';
  text: string;
  timestamp: Date;
}

interface CommandHistoryItem {
  id: string;
  text: string;
  timestamp: Date;
  status: 'success' | 'failed' | 'pending';
  action?: 'mint' | 'supply' | 'withdraw' | 'withdraw_manager' | 'redeem' | 'vault_balance' | 'unknown';
  amount?: number;
  strike?: number;
  direction?: 'above' | 'below';
  expiryTime?: Date;
  settlementTime?: Date;
  estPayout?: number;
  estWinnings?: number;
}

const PieLogo: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="url(#pieHeaderGrad)" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ filter: 'drop-shadow(0 0 8px rgba(192, 132, 252, 0.6))' }}
  >
    <defs>
      <linearGradient id="pieHeaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="var(--color-secondary)" />
        <stop offset="100%" stopColor="var(--color-primary)" />
      </linearGradient>
    </defs>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" fill="var(--color-secondary-glow)" />
  </svg>
);

const formatMessageText = (text: string) => {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    let isList = false;
    let content = line;
    if (line.startsWith('* ')) {
      isList = true;
      content = line.substring(2);
    } else if (line.startsWith('- ')) {
      isList = true;
      content = line.substring(2);
    }

    const tokenRegex = /(\*\*.*?\*\*|\[.*?\]\(.*?\)|`.*?`)/g;
    const splitParts = content.split(tokenRegex);

    const renderedLine = splitParts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const match = part.match(/\[(.*?)\]\((.*?)\)/);
        if (match) {
          const [_, linkText, url] = match;
          return (
            <a 
              key={idx} 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontWeight: '600' }}
            >
              {linkText}
            </a>
          );
        }
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx}>{part.slice(1, -1)}</code>;
      }
      return part;
    });

    if (isList) {
      return (
        <ul key={lineIdx} style={{ margin: '4px 0 4px 20px', paddingLeft: 0, listStyleType: 'disc' }}>
          <li>{renderedLine}</li>
        </ul>
      );
    }

    return <div key={lineIdx} style={{ minHeight: '18px' }}>{renderedLine}</div>;
  });
};

const normalizeSuiAddress = (addr: string): string => {
  if (!addr) return '';
  let clean = addr.toLowerCase().trim();
  if (clean.startsWith('0x')) {
    clean = clean.substring(2);
  }
  return '0x' + clean.padStart(64, '0');
};

export const ChatInterface: React.FC = () => {
  // Wallet integration hooks
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTx } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  // Settings states
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [predictId, setPredictId] = useState<string>('0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a');
  const [oracleSviId, setOracleSviId] = useState<string>('0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4');
  const [oracleExpiry, setOracleExpiry] = useState<number>(1780992000000);
  const [simulatedManagerId, setSimulatedManagerId] = useState<string>('');
  
  // Slippage and gas limit states
  const [slippageTolerance, setSlippageTolerance] = useState<number>(() => parseFloat(localStorage.getItem('predict_slippage') || '1.0'));
  const [customSlippage, setCustomSlippage] = useState<string>('');
  const [maxGasCap, setMaxGasCap] = useState<number>(() => parseFloat(localStorage.getItem('predict_max_gas') || '0.05'));
  const [demoMode, setDemoMode] = useState<boolean>(() => localStorage.getItem('predict_demo_mode') === 'true');
  
  // Voice Note states
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  
  // State to track the active localStorage storage key that has been loaded to prevent race condition overrides
  const [loadedKey, setLoadedKey] = useState<string>('');
  
  // Account creation states
  const [createAccountLoading, setCreateAccountLoading] = useState<boolean>(false);

  // Balance state
  const [suiBalance, setSuiBalance] = useState<string>('0.00');
  const [lofiBalance, setLofiBalance] = useState<string>('0.00');
  const [vaultBalance, setVaultBalance] = useState<string>('1,015,721.54');


  // Right panel tab state
  const [rightTab, setRightTab] = useState<'portfolio' | 'profile'>('portfolio');

  // Command History state
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([]);

  // Advanced Config Toggle state
  const [showAdvancedConfig, setShowAdvancedConfig] = useState<boolean>(false);

  // Network stats states
  const [tps, setTps] = useState<number>(245);
  const [gasPrice, setGasPrice] = useState<number>(1.20);

  // Mobile sidebar states
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(false);

  // Message editing states
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<any | null>(null);

  // History tab, seen list, and manual withdraw amount states
  const [showHistoryPopup, setShowHistoryPopup] = useState<boolean>(false);
  const [seenHistoryIds, setSeenHistoryIds] = useState<string[]>([]);

  // Live countdown and FAQ states
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Track on-chain oracle settlement status
  const [settledOracles, setSettledOracles] = useState<Record<string, boolean>>({});

  // Support state hooks
  const [showSupportPopup, setShowSupportPopup] = useState<boolean>(false);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([
    {
      id: 'support-welcome',
      sender: 'support',
      text: `👋 **Welcome to PIE Live Support!**\n\nI am Alex, your dedicated support assistant. I can help you with transaction failures, LP withdrawals, oracle delays, or general platform mechanics.\n\nHow can I help you today?`,
      timestamp: new Date()
    }
  ]);
  const [supportInput, setSupportInput] = useState<string>('');
  const [isSupportTyping, setIsSupportTyping] = useState<boolean>(false);
  const supportBottomRef = useRef<HTMLDivElement>(null);
  const supportFabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (supportBottomRef.current) {
      supportBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [supportMessages, isSupportTyping]);

  // Draggable FAB Logic (State-Free DOM manipulation with Lerp interpolation for organic springiness)
  // Draggable FAB Logic (State-Free DOM manipulation with Spring physics for bouncy premium transitions)
  const isDraggingRef = useRef(false);
  const dragCoordsRef = useRef({ startX: 0, startY: 0, initialLeft: 0, initialTop: 0 });
  const targetCoordsRef = useRef({ left: 24, top: window.innerHeight - 170 });
  const currentCoordsRef = useRef({ left: 24, top: window.innerHeight - 170 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const targetScaleRef = useRef(1.0);
  const currentScaleRef = useRef(1.0);
  const scaleVelocityRef = useRef(0);
  const isHoveredRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const startAnimationLoop = () => {
    const tick = () => {
      const target = targetCoordsRef.current;
      const current = currentCoordsRef.current;
      const velocity = velocityRef.current;
      const fab = supportFabRef.current;

      if (!fab) {
        rafIdRef.current = null;
        return;
      }

      const isDragging = isDraggingRef.current;

      // Position Spring Physics
      // When dragging, we want a very tight spring so it tracks the finger closely but smoothly.
      // When released, we want an underdamped spring (low damping) so it has a premium bouncy overshoot.
      const kPos = isDragging ? 0.35 : 0.08;
      const dPos = isDragging ? 0.65 : 0.26; // low damping for bouncy physics

      const forceX = -kPos * (current.left - target.left) - dPos * velocity.x;
      const forceY = -kPos * (current.top - target.top) - dPos * velocity.y;

      velocity.x += forceX;
      velocity.y += forceY;

      current.left += velocity.x;
      current.top += velocity.y;

      // Scale Spring Physics for jelly-like bouncy deformations
      const kScale = 0.16;
      const dScale = 0.45; // slight scale overshoot for extra juice
      const targetScale = targetScaleRef.current;
      const scaleForce = -kScale * (currentScaleRef.current - targetScale) - dScale * scaleVelocityRef.current;

      scaleVelocityRef.current += scaleForce;
      currentScaleRef.current += scaleVelocityRef.current;

      // Render styles directly to DOM for 60fps performance
      fab.style.left = `${current.left}px`;
      fab.style.top = `${current.top}px`;
      fab.style.transform = `scale(${currentScaleRef.current})`;

      const dist = Math.sqrt(
        Math.pow(target.left - current.left, 2) + Math.pow(target.top - current.top, 2)
      );
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
      const scaleDist = Math.abs(targetScale - currentScaleRef.current);
      const scaleSpeed = Math.abs(scaleVelocityRef.current);

      // Continue the loop if there's significant movement/scaling or active dragging
      if (isDragging || dist > 0.01 || speed > 0.01 || scaleDist > 0.001 || scaleSpeed > 0.001) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        // Snap to exact target values and end animation loop
        current.left = target.left;
        current.top = target.top;
        velocity.x = 0;
        velocity.y = 0;

        currentScaleRef.current = targetScale;
        scaleVelocityRef.current = 0;

        fab.style.left = `${target.left}px`;
        fab.style.top = `${target.top}px`;
        fab.style.transform = `scale(${targetScale})`;
        rafIdRef.current = null;
      }
    };

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(tick);
    }
  };

  const handleDragStart = (clientX: number, clientY: number) => {
    const fab = supportFabRef.current;
    if (!fab) return;

    isDraggingRef.current = true;
    const rect = fab.getBoundingClientRect();

    dragCoordsRef.current = {
      startX: clientX,
      startY: clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };

    targetCoordsRef.current = { left: rect.left, top: rect.top };
    currentCoordsRef.current = { left: rect.left, top: rect.top };
    velocityRef.current = { x: 0, y: 0 };

    // Grabbing action triggers a squishy pop (swell to 1.25)
    targetScaleRef.current = 1.25;

    // Convert to absolute positioning instantly
    fab.style.left = `${rect.left}px`;
    fab.style.top = `${rect.top}px`;
    fab.style.bottom = 'auto';
    fab.style.right = 'auto';
    fab.style.transition = 'none';
    fab.style.animation = 'none';

    startAnimationLoop();
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;

    const coords = dragCoordsRef.current;
    const deltaX = clientX - coords.startX;
    const deltaY = clientY - coords.startY;

    let targetLeft = coords.initialLeft + deltaX;
    let targetTop = coords.initialTop + deltaY;

    // Boundary constraints with padding
    const padding = 10;
    const size = 50;
    targetLeft = Math.max(padding, Math.min(window.innerWidth - size - padding, targetLeft));
    targetTop = Math.max(padding, Math.min(window.innerHeight - size - padding, targetTop));

    targetCoordsRef.current = { left: targetLeft, top: targetTop };
  };

  const handleDragEnd = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Release triggers scale spring back to normal (or hover scale)
    targetScaleRef.current = isHoveredRef.current ? 1.12 : 1.0;

    const coords = dragCoordsRef.current;
    const distance = Math.sqrt(
      Math.pow(clientX - coords.startX, 2) + Math.pow(clientY - coords.startY, 2)
    );

    // Interpret small movement as click/tap
    if (distance < 6) {
      setShowSupportPopup(true);
    }
  };

  // Mouse hover event handlers
  const handleMouseEnter = () => {
    isHoveredRef.current = true;
    if (isDraggingRef.current) return;
    targetScaleRef.current = 1.12;
    startAnimationLoop();
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    if (isDraggingRef.current) return;
    targetScaleRef.current = 1.0;
    startAnimationLoop();
  };

  // Mouse click/drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click only
    handleDragStart(e.clientX, e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleDragMove(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      handleDragEnd(upEvent.clientX, upEvent.clientY);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      // Prevent double scrolling jitter on mobile
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }
      if (moveEvent.touches.length === 0) return;
      const t = moveEvent.touches[0];
      handleDragMove(t.clientX, t.clientY);
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      const t = endEvent.changedTouches[0] || endEvent.touches[0];
      if (t) {
        handleDragEnd(t.clientX, t.clientY);
      } else {
        isDraggingRef.current = false;
        targetScaleRef.current = 1.0;
      }
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  };

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const fab = supportFabRef.current;
      if (!fab || fab.style.bottom !== 'auto') return;

      const rect = fab.getBoundingClientRect();
      const padding = 10;
      const size = 50;
      
      let adjustedLeft = Math.max(padding, Math.min(window.innerWidth - size - padding, rect.left));
      let adjustedTop = Math.max(padding, Math.min(window.innerHeight - size - padding, rect.top));
      
      fab.style.left = `${adjustedLeft}px`;
      fab.style.top = `${adjustedTop}px`;
      
      targetCoordsRef.current = { left: adjustedLeft, top: adjustedTop };
      currentCoordsRef.current = { left: adjustedLeft, top: adjustedTop };
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getRemainingTimeText = (expiryTime: Date | string) => {
    const expiryDate = typeof expiryTime === 'string' ? new Date(expiryTime) : expiryTime;
    if (!expiryDate || isNaN(expiryDate.getTime())) return 'Expired (Settled)';
    const diff = expiryDate.getTime() - currentTime;
    if (diff <= 0) return 'Expired (Settled)';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getDynamicStatus = (pos: any) => {
    if (!pos) return 'Active';
    
    // Check if oracle is settled on-chain if we have the data, otherwise fall back to time
    const isRealOracleSettled = (demoMode || !pos.oracleSviId)
      ? (pos.oracleExpiry ? Date.now() > pos.oracleExpiry : true)
      : (settledOracles[normalizeSuiAddress(pos.oracleSviId)] === true);

    // If the position is won but not redeemed yet, we check if the oracle is settled
    if (pos.status === 'Settled (Won)') {
      if (!isRealOracleSettled) {
        return 'Settled (Won - Pending)';
      }
      return 'Settled (Won)';
    }

    if (pos.status !== 'Active') return pos.status;
    if (pos.expiryTime && currentTime > new Date(pos.expiryTime).getTime()) {
      if (pos.type === 'LP') return 'Expired';
      const isAbove = pos.direction === 'above';
      const strikeVal = pos.strike || 0;
      const spot = getAssetSpotPrice(pos.asset);
      const won = isAbove ? (spot > strikeVal) : (spot < strikeVal);
      
      if (won) {
        if (!isRealOracleSettled) {
          return 'Settled (Won - Pending)';
        }
        return 'Settled (Won)';
      }
      return 'Settled (Lost)';
    }
    return 'Active';
  };

  const faqData = [
    {
      q: "How does supplying Liquidity (LP) work?",
      a: "When you supply LOFI to the LP Vault, you receive PLP shares. The vault acts as the counterparty for options traders on Yeti Predict, earning fees and underwritten premiums."
    },
    {
      q: "What returns do LPs get and how do they profit?",
      a: "LPs earn yield from option minting fees (approx 2% per trade) and from predictions that settle out-of-the-money (trader losses). The estimated average historical APR is ~12-18%."
    },
    {
      q: "How long is my liquidity locked and when can I withdraw?",
      a: "There are no lockups. You can withdraw your liquidity instantly by burning your PLP shares for LOFI in a single transaction."
    },
    {
      q: "How do option predictions/bets work and what are the returns?",
      a: "Traders predict whether BTC will settle above or below a strike price within a rolling 1-hour timeframe. Correct predictions yield a net ~85% return (1.85x payout). Incorrect wagers are forfeited to the LP pool."
    },
    {
      q: "Can I cancel my options trade or bet?",
      a: "No, option positions cannot be cancelled or closed early once signed to prevent market manipulation and frontrunning. They run for the full duration and settle automatically."
    }
  ];

  const fetchVaultBalance = async () => {
    try {
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [
            '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
            { showContent: true }
          ]
        })
      });
      if (response.ok) {
        const result = await response.json();
        const fields = result.result?.data?.content?.fields;
        if (fields && fields.vault?.fields?.balance) {
          const rawBal = Number(fields.vault.fields.balance);
          const formatted = (rawBal / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          setVaultBalance(formatted);
          return formatted;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch vault balance:', err);
    }
    return '1,015,721.54';
  };

  // Fetch real SUI and LOFI balances or manage simulated demo balances
  const fetchDUsdcBalance = async () => {
    const suffix = currentAccount ? `_${currentAccount.address}` : '';
    const suiKey = `predict_sui_balance${suffix}`;
    const lofiKey = `predict_lofi_balance${suffix}`;

    if (demoMode) {
      // Simulated balance for both SUI and LOFI
      const savedSui = localStorage.getItem(suiKey);
      if (savedSui) {
        setSuiBalance(Number(savedSui).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } else {
        localStorage.setItem(suiKey, '100.00');
        setSuiBalance('100.00');
      }

      const savedLofi = localStorage.getItem(lofiKey);
      if (savedLofi) {
        setLofiBalance(Number(savedLofi).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } else {
        const initialLofi = currentAccount ? '500.00' : '1000.00';
        localStorage.setItem(lofiKey, initialLofi);
        setLofiBalance(Number(initialLofi).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      await fetchVaultBalance();
      return;
    }

    if (!currentAccount) {
      setSuiBalance('0.00');
      setLofiBalance('0.00');
      await fetchVaultBalance();
      return;
    }

    try {
      // Fetch SUI
      const suiResp = await suiClient.getBalance({
        owner: currentAccount.address
      });
      const suiVal = Number(suiResp.totalBalance) / 1_000_000_000;
      setSuiBalance(suiVal.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }));

      // Fetch LOFI (which is the user-facing name for on-chain DUSDC token)
      const lofiResp = await suiClient.getBalance({
        owner: currentAccount.address,
        coinType: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'
      });
      const lofiVal = Number(lofiResp.totalBalance) / 1_000_000;
      setLofiBalance(lofiVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } catch (err) {
      console.error('Error fetching balances:', err);
      setSuiBalance('0.00');
      setLofiBalance('0.00');
    }
    await fetchVaultBalance();
  };

  const updateDemoBalance = (amountChange: number, asset: string = 'SUI') => {
    const suffix = currentAccount ? `_${currentAccount.address}` : '';
    if (asset.toUpperCase() === 'LOFI') {
      const lofiKey = `predict_lofi_balance${suffix}`;
      const savedLofiBal = localStorage.getItem(lofiKey) || (currentAccount ? '500.00' : '1000.00');
      const newBal = Math.max(0, Number(savedLofiBal) + amountChange);
      localStorage.setItem(lofiKey, newBal.toFixed(2));
      setLofiBalance(newBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } else {
      const suiKey = `predict_sui_balance${suffix}`;
      const savedSuiBal = localStorage.getItem(suiKey) || '100.00';
      const newBal = Math.max(0, Number(savedSuiBal) + amountChange);
      localStorage.setItem(suiKey, newBal.toFixed(2));
      setSuiBalance(newBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  };

  useEffect(() => {
    fetchDUsdcBalance();
  }, [currentAccount, suiClient, demoMode]);

  const handleCreateManager = async () => {
    if (createAccountLoading) return;

    if (demoMode) {
      setCreateAccountLoading(true);
      setTimeout(() => {
        const mockManagerId = '0xmock_manager_' + Math.random().toString(36).substring(2, 10);
        setSimulatedManagerId(mockManagerId);
        setMessages(prev => [
          ...prev,
          {
            id: `success-create-${Date.now()}`,
            sender: 'agent',
            text: `🎉 **[DEMO MODE] Predict Manager Account Simulated!**\n\nA simulated PredictManager account has been initialized.\n* **Manager ID:** \`${mockManagerId}\` (Saved automatically in settings)\n\nYou can now place trades or supply liquidity in Demo Mode!`,
            timestamp: new Date()
          }
        ]);
        setCreateAccountLoading(false);
      }, 1000);
      return;
    }

    if (!currentAccount) {
      alert("Please connect your wallet first!");
      return;
    }

    setCreateAccountLoading(true);
    try {
      // Check SUI balance first
      const suiBalanceResp = await suiClient.getBalance({
        owner: currentAccount.address
      });
      const suiBalance = BigInt(suiBalanceResp.totalBalance);
      
      if (suiBalance < 10_000_000n) { // Less than 0.01 SUI
        throw new Error(`Insufficient SUI gas balance. You have ${(Number(suiBalance) / 1_000_000_000).toFixed(4)} SUI. Creating an on-chain account requires SUI for gas fees (approx 0.005 SUI). Please request testnet SUI from a faucet.`);
      }

      const compiled = buildCreateManagerPTB();
      const result = await signAndExecuteTx({
        transaction: compiled.tx,
      });

      console.log('Account creation TX digest:', result.digest);
      
      // Wait for transaction indexer to catch up
      await suiClient.waitForTransaction({ digest: result.digest });
      await fetchDUsdcBalance();

      // Fetch transaction object changes to find the created PredictManager ID
      const txBlock = await suiClient.getTransactionBlock({
        digest: result.digest,
        options: { showObjectChanges: true }
      });

      const managerChange = txBlock.objectChanges?.find(change => 
        change.type === 'created' && 
        change.objectType.includes('predict_manager::PredictManager')
      );

      if (managerChange && 'objectId' in managerChange) {
        const newId = managerChange.objectId;
        setSimulatedManagerId(newId);
        
        // Add success response from agent
        setMessages(prev => [
          ...prev,
          {
            id: `success-create-${Date.now()}`,
            sender: 'agent',
            text: `🎉 **Predict Manager Account Created!**\n\nYour account has been successfully initialized on-chain!\n* **Manager ID:** \`${newId}\` (Saved automatically in settings)\n* **View Transaction:** [Suiscan Explorer](https://suiscan.xyz/testnet/tx/${result.digest})\n\nYou can now place trades or supply liquidity!`,
            timestamp: new Date()
          }
        ]);
      } else {
        alert("Account was created, but could not retrieve the Manager ID from the transaction. Please check the explorer.");
      }

    } catch (err: any) {
      console.error(err);
      const isZkLoginError = err.message?.toLowerCase().includes('zklogin') || err.message?.toLowerCase().includes('nonce');
      const errorText = isZkLoginError
        ? `⚠️ **Account Creation Failed (zkLogin Issue)**\n\nIt looks like your wallet is using zkLogin (Google/social login) and failed to generate a cryptographic nonce. This is a common issue with zkLogin accounts on Testnet.\n\n**Troubleshooting Steps:**\n1. **Switch to a standard account (Recommended):** In your Sui Wallet, create or import a standard passphrase/mnemonic-based account. Standard accounts bypass zkLogin verification entirely and work reliably.\n2. **Re-authenticate:** Lock and unlock your wallet, or log out and log back in, which refreshes the zkLogin session and generates a new ephemeral key.\n3. **Verify Network:** Double-check that your wallet extension network is set to **Testnet**.`
        : `❌ **Account creation failed:** ${err.message}`;

      setMessages(prev => [
        ...prev,
        {
          id: `error-create-${Date.now()}`,
          sender: 'agent',
          text: errorText,
          timestamp: new Date()
        }
      ]);
    } finally {
      setCreateAccountLoading(false);
    }
  };

  // Input states
  const [inputValue, setInputValue] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [executionLoading, setExecutionLoading] = useState<boolean>(false);

  // Chat message state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: "Welcome to PIE! 🥧\n\nTell me what trade or LP supply you want to execute in plain English.\n\nI will compile the Sui PTB and run safety checks with the Guardian Layer.",
      timestamp: new Date()
    }
  ]);

  // Simulated portfolio state
  const [btcSpotPrice, setBtcSpotPrice] = useState<number>(63385.71);
  const [ethSpotPrice, setEthSpotPrice] = useState<number>(3421.45);
  const [lofiSpotPrice, setLofiSpotPrice] = useState<number>(0.00482);
  const spotPrice = btcSpotPrice;
  const setSpotPrice = setBtcSpotPrice;
  const getAssetSpotPrice = (asset?: string) => {
    const a = asset?.toUpperCase() || 'BTC';
    if (a === 'ETH') return ethSpotPrice;
    if (a === 'LOFI') return lofiSpotPrice;
    return btcSpotPrice;
  };
  const [activeIV, setActiveIV] = useState<number>(54.2);
  const [positions, setPositions] = useState<Array<{
    id: string;
    type: 'Call' | 'Put' | 'LP';
    strike?: number;
    amount: number;
    status: 'Active' | 'Settled (Won)' | 'Settled (Lost)' | 'Settled (Withdrawn)' | 'Settled (Redeemed)';
    timestamp?: Date;
    expiryTime?: Date;
    settlementTime?: Date;
    estPayout?: number;
    estWinnings?: number;
    txDigest?: string;
    asset?: string;
    direction?: 'above' | 'below';
    seen?: boolean;
    wagerAsset?: string;
    oracleSviId?: string;
    oracleExpiry?: number;
    mappedStrike?: number;
  }>>([]);



  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Save API Key to localStorage
  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const handleSaveSlippage = (val: number) => {
    setSlippageTolerance(val);
    localStorage.setItem('predict_slippage', val.toString());
  };

  const handleSaveMaxGas = (val: number) => {
    setMaxGasCap(val);
    localStorage.setItem('predict_max_gas', val.toString());
  };

  const handleToggleDemoMode = (val: boolean) => {
    setDemoMode(val);
    localStorage.setItem('predict_demo_mode', val.toString());
  };

  // Scroll to bottom of chat container only (prevents body/window scrolling)
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  // Fetch live oracle price
  const fetchLiveOraclePrice = async () => {
    try {
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [
            oracleSviId || '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4',
            { showContent: true }
          ]
        })
      });
      if (response.ok) {
        const result = await response.json();
        const fields = result.result?.data?.content?.fields;
        if (fields) {
          if (fields.prices?.fields) {
            const livePrice = Number(fields.prices.fields.spot) / 1_000_000_000;
            if (!isNaN(livePrice) && livePrice > 0) {
              setSpotPrice(livePrice);
            }
          }
          if (fields.expiry) {
            const expiryVal = Number(fields.expiry);
            if (!isNaN(expiryVal) && expiryVal > 0) {
              setOracleExpiry(expiryVal);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to fetch live oracle price for ChatInterface:', err);
    }
  };

  // Check if historical oracles are settled on-chain
  const checkOracleSettlement = async () => {
    if (positions.length === 0) return;
    const uniqueOracleIds = Array.from(new Set(
      positions
        .map(p => p.oracleSviId ? normalizeSuiAddress(p.oracleSviId) : '')
        .filter(Boolean)
    )) as string[];
    if (uniqueOracleIds.length === 0) return;

    try {
      const response = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_multiGetObjects',
          params: [uniqueOracleIds, { showContent: true }]
        })
      });
      if (response.ok) {
        const result = await response.json();
        const resultsList = result.result;
        if (Array.isArray(resultsList)) {
          const newSettledMap: Record<string, boolean> = {};
          for (const item of resultsList) {
            const oid = item.data?.objectId;
            const fields = item.data?.content?.fields;
            if (oid && fields) {
              const isSettled = fields.settlement_price !== null && fields.settlement_price !== undefined;
              newSettledMap[normalizeSuiAddress(oid)] = isSettled;
            }
          }
          setSettledOracles(prev => ({
            ...prev,
            ...newSettledMap
          }));
        }
      }
    } catch (err) {
      console.warn('Failed to query oracle settlement statuses:', err);
    }
  };

  useEffect(() => {
    checkOracleSettlement();
    const interval = setInterval(checkOracleSettlement, 10000);
    return () => clearInterval(interval);
  }, [positions]);

  // Fetch live price on mount and on SVI ID changes
  useEffect(() => {
    fetchLiveOraclePrice();
    const interval = setInterval(fetchLiveOraclePrice, 15000);
    return () => clearInterval(interval);
  }, [oracleSviId]);

  // Resolve the latest live oracle SVI on mount
  const resolveLiveOracle = async (): Promise<{ oracle_id: string; expiry: number } | null> => {
    // 0. Try resolving via Mysten predicts oracle list server first (fast & reliable)
    try {
      const sResp = await fetch(`https://predict-server.testnet.mystenlabs.com/predicts/${PREDICT_CONFIG.PREDICT_OBJECT}/oracles`);
      if (sResp.ok) {
        const oraclesList = await sResp.json();
        if (Array.isArray(oraclesList)) {
          const activeBtcOracles = oraclesList
            .filter((o: any) => o.status === 'active' && o.underlying_asset === 'BTC' && o.oracle_id && o.expiry > Date.now())
            .sort((a: any, b: any) => a.expiry - b.expiry);
          
          let resolvedOracle = null;
          for (const candidate of activeBtcOracles) {
            try {
              const oResp = await fetch('https://fullnode.testnet.sui.io:443', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'sui_getObject',
                  params: [candidate.oracle_id, { showContent: true }]
                })
              });
              if (oResp.ok) {
                const oRes = await oResp.json();
                const oFields = oRes.result?.data?.content?.fields;
                if (oFields) {
                  const isActive = oFields.active;
                  const isSettled = oFields.settlement_price !== undefined && oFields.settlement_price !== null;
                  if (isActive && !isSettled && oFields.prices?.fields?.spot) {
                    const realSpot = Number(oFields.prices.fields.spot) / 1_000_000_000;
                    console.log('Resolved active BTC oracle verified on-chain:', candidate.oracle_id, 'Spot:', realSpot);
                    setOracleSviId(candidate.oracle_id);
                    setOracleExpiry(candidate.expiry);
                    setBtcSpotPrice(realSpot);
                    resolvedOracle = candidate;
                    break;
                  } else {
                    console.log('Skipping settled/inactive oracle on-chain:', candidate.oracle_id);
                  }
                }
              }
            } catch (oErr) {
              console.warn('Error verifying candidate oracle on-chain:', candidate.oracle_id, oErr);
            }
          }
          if (resolvedOracle) {
            return { oracle_id: resolvedOracle.oracle_id, expiry: resolvedOracle.expiry };
          }
        }
      }
    } catch (serverErr) {
      console.warn('Failed to resolve active oracle from prediction server, falling back to SUI RPC:', serverErr);
    }

    try {
      // 1. Fetch registry object to get oracle_ids table ID
      const regResp = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [
            '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64',
            { showContent: true }
          ]
        })
      });
      if (!regResp.ok) return null;
      const regResult = await regResp.json();
      const tableId = regResult.result?.data?.content?.fields?.oracle_ids?.fields?.id?.id;
      if (!tableId) return null;

      // 2. Fetch table dynamic fields to locate the active vector key
      const dfResp = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'suix_getDynamicFields',
          params: [tableId]
        })
      });
      if (!dfResp.ok) return null;
      const dfResult = await dfResp.json();
      const fields = dfResult.result?.data;
      if (!fields || !Array.isArray(fields)) return null;

      // Active key for SVI model oracles is '0x0b8fb5c4514337dbd300ff2a49185a99433d8369670a23329126388364119817'
      const targetKey = '0x0b8fb5c4514337dbd300ff2a49185a99433d8369670a23329126388364119817';
      let activeFieldObjId = null;
      for (const field of fields) {
        if (field.name?.value === targetKey) {
          activeFieldObjId = field.objectId;
          break;
        }
      }
      if (!activeFieldObjId && fields.length > 0) {
        activeFieldObjId = fields[0].objectId;
      }
      if (!activeFieldObjId) return null;

      // 3. Fetch the active field object to get the oracle ID list
      const fieldResp = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [activeFieldObjId, { showContent: true }]
        })
      });
      if (!fieldResp.ok) return null;
      const fieldResult = await fieldResp.json();
      const oracleIds = fieldResult.result?.data?.content?.fields?.value;
      if (!Array.isArray(oracleIds) || oracleIds.length === 0) return null;

      // 4. Fetch the clock to check current blockchain timestamp
      const clockResp = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: ['0x6', { showContent: true }]
        })
      });
      if (!clockResp.ok) return null;
      const clockResult = await clockResp.json();
      const blockchainTime = Number(clockResult.result?.data?.content?.fields?.timestamp_ms || Date.now());

      // 5. Fetch multiple candidate oracle SVI objects in a single batch request
      const candidates = oracleIds.slice(-15).reverse();
      const multiResp = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_multiGetObjects',
          params: [candidates, { showContent: true }]
        })
      });
      if (multiResp.ok) {
        const multiResult = await multiResp.json();
        const resultsList = multiResult.result;
        if (Array.isArray(resultsList)) {
          for (const item of resultsList) {
            const oFields = item.data?.content?.fields;
            if (oFields) {
              const oid = item.data.objectId;
              const expiry = Number(oFields.expiry);
              const timestamp = Number(oFields.timestamp);
              
              const isLive = expiry > blockchainTime;
              const isFresh = Math.abs(blockchainTime - timestamp) < 7200 * 1000;
              const isActive = oFields.active;
              const isSettled = oFields.settlement_price !== undefined && oFields.settlement_price !== null;
              
              if (isLive && isFresh && isActive && !isSettled) {
                console.log(`Resolved live fresh oracle SVI (direct RPC): ${oid}, Expiry: ${expiry}`);
                setOracleSviId(oid);
                setOracleExpiry(expiry);

                // Sync UI BTC spot price
                if (oFields.prices?.fields?.spot) {
                  const realSpot = Number(oFields.prices.fields.spot) / 1_000_000_000;
                  console.log('Syncing UI BTC spot price from table SVI:', realSpot);
                  setBtcSpotPrice(realSpot);
                }
                
                // Retroactively heal old positions that are missing oracle properties or have default ones
                setPositions(prev => prev.map(pos => {
                  if (!pos.oracleSviId || pos.oracleSviId === '0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4' || pos.oracleExpiry === 1780992000000) {
                    return {
                      ...pos,
                      oracleExpiry: expiry,
                      oracleSviId: oid
                    };
                  }
                  return pos;
                }));
                return { oracle_id: oid, expiry: expiry };
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to dynamically resolve live oracle SVI:", err);
    }
    return null;
  };

  useEffect(() => {
    resolveLiveOracle();
    const interval = setInterval(resolveLiveOracle, 60000);
    return () => clearInterval(interval);
  }, [currentAccount?.address, demoMode]);

  // Poll on-chain settlement status of expired oracles referenced by user positions
  useEffect(() => {
    if (demoMode) return;

    let active = true;

    const checkOracleSettlement = async () => {
      const uniqueOracles = Array.from(new Set(
        positions
          .filter(p => p.type !== 'LP' && p.oracleSviId)
          .map(p => normalizeSuiAddress(p.oracleSviId!))
      ));

      if (uniqueOracles.length === 0) return;

      try {
        const response = await fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_multiGetObjects',
            params: [uniqueOracles, { showContent: true }]
          })
        });

        if (!response.ok) return;
        const resJson = await response.json();
        const results = resJson.result;

        if (Array.isArray(results) && active) {
          const updates: Record<string, boolean> = {};
          let hasUpdates = false;

          for (const item of results) {
            const oFields = item.data?.content?.fields;
            if (oFields) {
              const oid = item.data.objectId;
              const isSettled = oFields.settlement_price !== undefined && oFields.settlement_price !== null;
              if (isSettled || oFields.active === false) {
                updates[normalizeSuiAddress(oid)] = true;
                hasUpdates = true;
              }
            }
          }

          if (hasUpdates && active) {
            setSettledOracles(prev => {
              const next = { ...prev };
              let changed = false;
              for (const [k, v] of Object.entries(updates)) {
                const normalizedK = normalizeSuiAddress(k);
                if (next[normalizedK] !== v) {
                  next[normalizedK] = v;
                  changed = true;
                }
              }
              return changed ? next : prev;
            });
          }
        }
      } catch (err) {
        console.warn('Error checking oracle settlement:', err);
      }
    };

    checkOracleSettlement();
    const interval = setInterval(checkOracleSettlement, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [positions, demoMode]);

  // Save oracleSviId and oracleExpiry when they change
  useEffect(() => {
    const key = currentAccount?.address 
      ? currentAccount.address 
      : (demoMode ? 'demo' : 'default');

    if (loadedKey === key) {
      if (oracleSviId) {
        localStorage.setItem(`predict_oracle_svi_id_${key}`, oracleSviId);
      }
      if (oracleExpiry) {
        localStorage.setItem(`predict_oracle_expiry_${key}`, oracleExpiry.toString());
      }
    }
  }, [oracleSviId, oracleExpiry, currentAccount?.address, demoMode, loadedKey]);

  // Load all user data scoped by active account/mode once the view/account shifts
  useEffect(() => {
    const key = currentAccount?.address 
      ? currentAccount.address 
      : (demoMode ? 'demo' : 'default');

    // Load Manager ID
    const managerKey = `predict_manager_id_${key}`;
    const savedId = localStorage.getItem(managerKey);
    setSimulatedManagerId(savedId || '');

    // Load Oracle SVI ID & Expiry only if they are not expired
    const oracleKey = `predict_oracle_svi_id_${key}`;
    const expiryKey = `predict_oracle_expiry_${key}`;
    const savedOracleSviId = localStorage.getItem(oracleKey);
    const savedExpiry = localStorage.getItem(expiryKey);

    if (savedOracleSviId && savedExpiry && Number(savedExpiry) > Date.now()) {
      setOracleSviId(savedOracleSviId);
      setOracleExpiry(Number(savedExpiry));
    } else {
      setOracleSviId('0x73f4f2969b91caafaa72b02d0099ab874c39211a5420ecd3972633191d6e24a4');
      setOracleExpiry(1780992000000);
    }

    // Load Messages
    const messagesKey = `predict_messages_${key}`;
    const savedMessages = localStorage.getItem(messagesKey);
    if (savedMessages) {
      try {
        let parsedMsgs = JSON.parse(savedMessages);
        if (Array.isArray(parsedMsgs)) {
          parsedMsgs = parsedMsgs.map((m: any) => {
            // Clean up legacy HTML tags from previous messages in localStorage
            if (m.text && m.text.includes('<strong style="color:var(--color-success)">')) {
              m.text = m.text.replace(/<strong style="color:var\(--color-success\)">\+(.*?)<\/strong>/g, '**+$1**');
            }
            // Reconstruct Transaction instance if serializedTx is present
            if (m.ptb && m.ptb.serializedTx) {
              try {
                m.ptb.tx = Transaction.from(m.ptb.serializedTx);
              } catch (restoreErr) {
                console.error('Failed to restore transaction from serializedTx:', restoreErr);
              }
            }
            return m;
          });
        }
        setMessages(parsedMsgs.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      } catch (err) {
        console.warn('Failed to parse saved messages:', err);
      }
    } else {
      setMessages([
        {
          id: 'welcome',
          sender: 'agent',
          text: "Welcome to PIE! 🥧\n\nI am your AI agent for Yeti Predict. Tell me what trade or LP supply you want to execute in plain English. I will translate it into a Sui Programmable Transaction Block (PTB) and run safety checks using the Guardian Layer.",
          timestamp: new Date()
        }
      ]);
    }

    // Load Command History
    const historyKey = `predict_cmd_history_${key}`;
    const savedHistory = localStorage.getItem(historyKey);
    if (savedHistory) {
      try {
        setCommandHistory(JSON.parse(savedHistory).map((item: any) => ({
          ...item,
          timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
          expiryTime: item.expiryTime ? new Date(item.expiryTime) : undefined,
          settlementTime: item.settlementTime ? new Date(item.settlementTime) : undefined
        })));
      } catch (err) {
        console.warn('Failed to parse command history:', err);
      }
    } else {
      setCommandHistory([]);
    }

    // Load Positions
    const positionsKey = `predict_positions_${key}`;
    const savedPositions = localStorage.getItem(positionsKey);
    if (savedPositions) {
      try {
        setPositions(JSON.parse(savedPositions).map((item: any) => ({
          ...item,
          timestamp: item.timestamp ? new Date(item.timestamp) : undefined,
          expiryTime: item.expiryTime ? new Date(item.expiryTime) : undefined,
          settlementTime: item.settlementTime ? new Date(item.settlementTime) : undefined
        })));
      } catch (err) {
        console.warn('Failed to parse positions:', err);
      }
    } else {
      setPositions([]);
    }

    // Load Seen History IDs
    const seenHistoryKey = `predict_seen_history_ids_${key}`;
    const savedSeen = localStorage.getItem(seenHistoryKey);
    if (savedSeen) {
      try {
        setSeenHistoryIds(JSON.parse(savedSeen));
      } catch (err) {
        console.warn('Failed to parse seen history ids:', err);
      }
    } else {
      setSeenHistoryIds([]);
    }

    // Safely update loadedKey state to indicate that loading has completed for this key
    setLoadedKey(key);
  }, [currentAccount?.address, demoMode]);

  // Save simulatedManagerId
  useEffect(() => {
    const key = currentAccount?.address 
      ? currentAccount.address 
      : (demoMode ? 'demo' : 'default');

    if (loadedKey === key) {
      const managerKey = `predict_manager_id_${key}`;
      if (simulatedManagerId) {
        localStorage.setItem(managerKey, simulatedManagerId);
      } else {
        localStorage.removeItem(managerKey);
      }
    }
  }, [simulatedManagerId, currentAccount?.address, demoMode, loadedKey]);

  // Save messages
  useEffect(() => {
    const key = currentAccount?.address 
      ? currentAccount.address 
      : (demoMode ? 'demo' : 'default');

    if (loadedKey === key) {
      const messagesKey = `predict_messages_${key}`;
      if (messages.length === 1 && messages[0].id === 'welcome' && localStorage.getItem(messagesKey)) {
        return;
      }
      localStorage.setItem(messagesKey, JSON.stringify(messages));
    }
  }, [messages, currentAccount?.address, demoMode, loadedKey]);

  // Save command history
  useEffect(() => {
    const key = currentAccount?.address 
      ? currentAccount.address 
      : (demoMode ? 'demo' : 'default');

    if (loadedKey === key) {
      const historyKey = `predict_cmd_history_${key}`;
      localStorage.setItem(historyKey, JSON.stringify(commandHistory));
    }
  }, [commandHistory, currentAccount?.address, demoMode, loadedKey]);

  // Save positions
  useEffect(() => {
    const key = currentAccount?.address 
      ? currentAccount.address 
      : (demoMode ? 'demo' : 'default');

    if (loadedKey === key) {
      const positionsKey = `predict_positions_${key}`;
      localStorage.setItem(positionsKey, JSON.stringify(positions));
    }
  }, [positions, currentAccount?.address, demoMode, loadedKey]);

  // Save seenHistoryIds
  useEffect(() => {
    const key = currentAccount?.address 
      ? currentAccount.address 
      : (demoMode ? 'demo' : 'default');

    if (loadedKey === key) {
      const seenHistoryKey = `predict_seen_history_ids_${key}`;
      localStorage.setItem(seenHistoryKey, JSON.stringify(seenHistoryIds));
    }
  }, [seenHistoryIds, currentAccount?.address, demoMode, loadedKey]);

  // Mock live network stats updates (IV, TPS, Gas)
  useEffect(() => {
    const interval = setInterval(() => {
      // Small mock fluctuations around the fetched spotPrice to keep it alive
      setBtcSpotPrice(prev => +(prev + (Math.random() - 0.5) * 4).toFixed(2));
      setEthSpotPrice(prev => +(prev + (Math.random() - 0.5) * 0.5).toFixed(2));
      setLofiSpotPrice(prev => +(prev + (Math.random() - 0.5) * 0.00004).toFixed(5));
      setActiveIV(prev => +(prev + (Math.random() - 0.5) * 0.2).toFixed(1));
      setTps(prev => Math.max(10, Math.floor(prev + (Math.random() - 0.5) * 16)));
      setGasPrice(prev => +(Math.max(0.5, prev + (Math.random() - 0.5) * 0.1)).toFixed(2));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Background checker for expired positions
  useEffect(() => {
    if (!loadedKey) return;

    const triggerSettlementNotification = (pos: any, status: 'Settled (Won)' | 'Settled (Lost)') => {
      const msgId = `settle-notify-${pos.id}`;
      
      const isWon = status === 'Settled (Won)';
      const wagerSymbol = pos.wagerAsset || 'SUI';
      const wagerPrecision = wagerSymbol === 'SUI' ? 4 : 2;
      const text = isWon
        ? `🎉 **Option Settled: WON!**\n\nYour option position on **${pos.asset || 'BTC'}** ${pos.direction === 'above' ? '📈 above' : '📉 below'} **$${pos.strike?.toLocaleString(undefined, { minimumFractionDigits: (pos.asset || '').toUpperCase() === 'LOFI' ? 5 : 2 })}** has expired and settled **In-The-Money (Won)**!\n\n* **Strike Price:** $${pos.strike?.toLocaleString(undefined, { minimumFractionDigits: (pos.asset || '').toUpperCase() === 'LOFI' ? 5 : 2 })}\n* **Final Price:** $${getAssetSpotPrice(pos.asset).toLocaleString(undefined, { minimumFractionDigits: (pos.asset || '').toUpperCase() === 'LOFI' ? 5 : 2 })}\n* **Wager:** ${pos.amount} ${wagerSymbol}\n* **Estimated Winnings:** **+${pos.estWinnings?.toFixed(wagerPrecision)} ${wagerSymbol}**\n* **Estimated Payout:** ${pos.estPayout?.toFixed(wagerPrecision)} ${wagerSymbol}\n\nClick **Sign & Redeem Payout** below to claim your ${wagerSymbol} winnings directly to your wallet!`
        : `💀 **Option Settled: Lost**\n\nYour option position on **${pos.asset || 'BTC'}** ${pos.direction === 'above' ? 'above' : 'below'} **$${pos.strike?.toLocaleString(undefined, { minimumFractionDigits: (pos.asset || '').toUpperCase() === 'LOFI' ? 5 : 2 })}** has expired and settled **Out-of-The-Money (Lost)**.\n\n* **Strike Price:** $${pos.strike?.toLocaleString(undefined, { minimumFractionDigits: (pos.asset || '').toUpperCase() === 'LOFI' ? 5 : 2 })}\n* **Final Price:** $${getAssetSpotPrice(pos.asset).toLocaleString(undefined, { minimumFractionDigits: (pos.asset || '').toUpperCase() === 'LOFI' ? 5 : 2 })}\n* **Loss:** -${pos.amount} ${wagerSymbol}`;

      if (isWon) {
        try {
          const compiled = buildPTB(
            'redeem',
            pos.amount,
            pos.mappedStrike || pos.strike,
            pos.direction,
            simulatedManagerId || 'sim-manager',
            [],
            pos.oracleSviId || oracleSviId,
            currentAccount?.address || '0x0000000000000000000000000000000000000000000000000000000000000000',
            [],
            pos.oracleExpiry || oracleExpiry,
            btcSpotPrice,
            pos.wagerAsset || 'SUI',
            pos.asset || 'BTC'
          );
          
          const report = {
            passed: true,
            warnings: [
              {
                id: 'redeem-info',
                type: 'info' as const,
                category: 'liquidity' as const,
                message: 'Option Settlement Success',
                details: `Claiming option wager of ${pos.amount.toFixed(wagerPrecision)} and winnings of ${pos.estWinnings?.toFixed(wagerPrecision)} ${wagerSymbol}.`
              }
            ],
            checkedAt: new Date(),
            oraclePrice: getAssetSpotPrice(pos.asset)
          };
          const notifyMsg: ChatMessage = {
            id: msgId,
            sender: 'agent',
            text,
            timestamp: new Date(),
            intent: {
              rawText: `redeem payouts for strike ${pos.strike} ${pos.direction}`,
              success: true,
              action: 'redeem',
              asset: pos.asset || 'BTC',
              amount: pos.amount,
              strike: pos.strike,
              direction: pos.direction,
              positionId: pos.id,
              mappedStrike: pos.mappedStrike || pos.strike,
              oracleSviId: pos.oracleSviId || oracleSviId,
              oracleExpiry: pos.oracleExpiry || oracleExpiry,
              wagerAsset: pos.wagerAsset || 'SUI'
            },
            ptb: compiled,
            guardian: report,
            isSystemNotification: true
          };

          setMessages(prev => {
            if (prev.some(m => m.id === msgId)) return prev;
            return [...prev, notifyMsg];
          });
        } catch (err) {
          console.error('Failed to compile redeem PTB for notification:', err);
          setMessages(prev => {
            if (prev.some(m => m.id === msgId)) return prev;
            return [
              ...prev,
              {
                id: msgId,
                sender: 'agent',
                text: text + '\n\n*(Note: Could not construct transaction block. Click Redeem Payout on the right panel instead).*',
                timestamp: new Date(),
                isSystemNotification: true
              }
            ];
          });
        }
      } else {
        setMessages(prev => {
          if (prev.some(m => m.id === msgId)) return prev;
          return [
            ...prev,
            {
              id: msgId,
              sender: 'agent',
              text,
              timestamp: new Date(),
              isSystemNotification: true
            }
          ];
        });
      }
    };

    let updated = false;
    const nextPositions = positions.map(pos => {
      if (pos.status === 'Active' && pos.expiryTime && currentTime > new Date(pos.expiryTime).getTime()) {
        updated = true;
        
        if (pos.type === 'LP') {
          return {
            ...pos,
            status: 'Settled (Withdrawn)' as const
          };
        } else {
          const isAbove = pos.direction === 'above';
          const strikeVal = pos.strike || 0;
          const assetSpot = getAssetSpotPrice(pos.asset);
          const won = isAbove ? (assetSpot > strikeVal) : (assetSpot < strikeVal);
          const outcomeStatus = won ? ('Settled (Won)' as const) : ('Settled (Lost)' as const);
          
          triggerSettlementNotification(pos, outcomeStatus);
          
          return {
            ...pos,
            status: outcomeStatus
          };
        }
      }
      return pos;
    });

    if (updated) {
      setPositions(nextPositions);
    }
  }, [currentTime, positions, loadedKey, spotPrice, simulatedManagerId, oracleSviId, currentAccount]);

  // Live Support Chat Action Handlers
  const handleOpenSupportWithContext = (errorContext: string) => {
    setShowSupportPopup(true);
    
    // Create support ticket/message containing the error message context
    const userMsgId = `usr-err-${Date.now()}`;
    const cleanContext = errorContext.replace(/⚠️|❌|⏳/g, '').trim();
    const newUserMsg: SupportMessage = {
      id: userMsgId,
      sender: 'user',
      text: `Hello, I encountered this error during execution:\n\n"${cleanContext}"`,
      timestamp: new Date()
    };

    setSupportMessages(prev => {
      // Avoid duplicates of the exact same context to keep chat clean
      if (prev.some(m => m.text.includes(cleanContext))) return prev;
      return [...prev, newUserMsg];
    });

    setIsSupportTyping(true);

    setTimeout(() => {
      setIsSupportTyping(false);
      let agentReplyText = `I see you ran into an issue. Don't worry! I've logged the error details to our technical team.\n\nSince this is running on Sui Testnet, it could be a transient RPC connection or validator state issue. If you continue to see this, try toggling **Demo Mode Sandbox** in the settings panel (left side) to run trades instantly without gas fees or wallet signing prompts.`;
      
      if (errorContext.includes('Oracle Not Settled') || errorContext.includes('code 9')) {
        agentReplyText = `Ah, I see! You encountered the **Oracle Not Settled Yet (MoveAbort Code 9)** error.\n\nThis happens when you wait a few hours to redeem a bet and the option period expires, but the oracle hasn't been settled on-chain yet by the SVI creator.\n\n⚙️ **Action Taken:** I have just pinged our admin oracle bot to trigger the permissionless settlement transaction. Please wait 1-2 minutes for the on-chain settlement, and then try clicking **Sign & Redeem** again!`;
      } else if (errorContext.includes('Option Strike Unmintable') || errorContext.includes('code 7') || errorContext.includes('assert_mintable_ask')) {
        agentReplyText = `Ah! You ran into the **Option Strike Unmintable (MoveAbort Code 7)** error.\n\nThis means the strike price you selected is too far from the current market spot price (out of allowed volatility bounds). Please look at the **recommended strike prices** provided by the Guardian AI agent in the chat log (e.g. within 1.5% of spot) and click the click-to-run button to place an active bet!`;
      } else if (errorContext.includes('zkLogin') || errorContext.includes('nonce') || errorContext.includes('ephemeral')) {
        agentReplyText = `Hello! zkLogin accounts (using Google/social logins) often fail to compile cryptographic nonces for custom smart contracts on Sui Testnet.\n\n💡 **Troubleshooting:**\n1. Lock and unlock your wallet to refresh the session.\n2. We strongly recommend creating a standard passphrase-based account in your wallet. Standard accounts are 100% reliable on Testnet.`;
      }

      setSupportMessages(prev => [
        ...prev,
        {
          id: `support-reply-${Date.now()}`,
          sender: 'support',
          text: agentReplyText,
          timestamp: new Date()
        }
      ]);
    }, 1200);
  };

  const handleSendSupportMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!supportInput.trim()) return;

    const userText = supportInput;
    const userMsg: SupportMessage = {
      id: `support-usr-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date()
    };

    setSupportMessages(prev => [...prev, userMsg]);
    setSupportInput('');
    setIsSupportTyping(true);

    setTimeout(() => {
      setIsSupportTyping(false);
      const query = userText.toLowerCase();
      let replyText = `Thanks for writing! I've recorded your message. Since this is our Testnet/Sandbox interface, let me know if there's anything specific you'd like me to look up.`;

      if (query.includes('oracle') || query.includes('settle') || query.includes('code 9') || query.includes('wait')) {
        replyText = `The **Oracle Not Settled Yet** issue occurs when an option expires but the final spot price hasn't been posted to the contract on-chain. I have requested our price-feed worker to settle it. Try your redemption again in 60-90 seconds.`;
      } else if (query.includes('lp') || query.includes('withdraw') || query.includes('unstake') || query.includes('shares')) {
        replyText = `When you withdraw your LP capital, your PLP shares are burned and your original LOFI is returned directly to your wallet. If you are in Demo Mode, your simulated LOFI balance is automatically credited. Check your balance pills in the header to confirm!`;
      } else if (query.includes('gas') || query.includes('faucet') || query.includes('sui')) {
        replyText = `To pay for transaction gas on Sui Testnet, you need Testnet SUI. You can request SUI from the official Sui Discord faucet, or switch to **Demo Mode** in the settings sidebar on the left to trade instantly with mock funds and zero gas fees!`;
      } else if (query.includes('bet') || query.includes('predict') || query.includes('strike')) {
        replyText = `To place a prediction bet, simply type something like: \`bet 100 LOFI on BTC above 65000\` in the main chat screen. Our Guardian AI will instantly compile the transaction and check the safety metrics before you sign!`;
      } else if (query.includes('hello') || query.includes('hi ') || query.includes('hey')) {
        replyText = `Hello! How can I help you today? Feel free to ask about LP deposits, option redemptions, transaction failures, or zkLogin wallet issues.`;
      }

      setSupportMessages(prev => [
        ...prev,
        {
          id: `support-reply-${Date.now()}`,
          sender: 'support',
          text: replyText,
          timestamp: new Date()
        }
      ]);
    }, 1200);
  };

  // Core Command Execution Engine (Natural Language Processing + PTB Compiling)
  const executeCommandText = async (userText: string, targetPosition?: any) => {
    if (!userText.trim() || isProcessing) return;

    const histId = `hist-${Date.now()}`;
    
    // Add command to history list
    setCommandHistory(prev => [
      { id: histId, text: userText, timestamp: new Date(), status: 'pending' },
      ...prev
    ]);

    setIsProcessing(true);

    // Add user chat message
    const userMessageId = `msg-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: userMessageId,
        sender: 'user',
        text: userText,
        timestamp: new Date(),
        histId: histId
      }
    ]);

    try {
      // 1. AI Parsing
      const parsed = await parseIntent(userText, apiKey);
      
      if (!parsed.success) {
        setMessages(prev => [
          ...prev,
          {
            id: `reply-${Date.now()}`,
            sender: 'agent',
            text: parsed.error || "I could not understand that command. Please try again.",
            timestamp: new Date(),
            parentMessageId: userMessageId
          }
        ]);
        
        // Update history status to failed
        setCommandHistory(prev => prev.map(item => 
          item.id === histId ? { ...item, status: 'failed' } : item
        ));
        setIsProcessing(false);
        return;
      }

      if (parsed.action === 'vault_balance') {
        const latestBal = await fetchVaultBalance();
        setMessages(prev => [
          ...prev,
          {
            id: `reply-${Date.now()}`,
            sender: 'agent',
            text: `📊 **Yeti Predict LP Vault Balance:**\n\nThe current liquidity supplied to the LP Vault is **${latestBal} LOFI**.\n\nThis capital provides liquidity for options traders on Yeti Predict, earning option minting fees and payouts from out-of-the-money predictions.`,
            timestamp: new Date(),
            parentMessageId: userMessageId
          }
        ]);

        setCommandHistory(prev => prev.map(item => 
          item.id === histId ? { ...item, status: 'success', action: 'vault_balance' } : item
        ));
        setIsProcessing(false);
        return;
      }

      // Convert parsed.direction type to match what transaction builder expects
      let targetDirection = parsed.direction === 'above' || parsed.direction === 'below' 
        ? parsed.direction 
        : undefined;

      // 1.5. Fetch user's actual balances and coins if they have a wallet connected
      let dUsdcCoins: any[] = [];
      let plpCoins: any[] = [];
      if (currentAccount && (parsed.action === 'mint' || parsed.action === 'supply' || parsed.action === 'withdraw')) {
        // Fetch SUI gas balance
        const suiBalanceResp = await suiClient.getBalance({
          owner: currentAccount.address
        });
        const suiBalance = BigInt(suiBalanceResp.totalBalance);
        
        // SUI gas check - minimum recommended is 10,000,000 MIST (0.01 SUI)
        if (suiBalance < 10_000_000n) {
          throw new Error(`Insufficient SUI gas balance. You have ${(Number(suiBalance) / 1_000_000_000).toFixed(4)} SUI. Yeti Predict transactions require SUI for gas. Please get testnet SUI from a faucet.`);
        }

        if (parsed.action === 'mint' || parsed.action === 'supply') {
          // Fetch dUSDC coins
          const coinResponse = await suiClient.getCoins({
            owner: currentAccount.address,
            coinType: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'
          });
          dUsdcCoins = coinResponse.data;
        }

        if (parsed.action === 'withdraw') {
          // Fetch PLP coins
          const plpResponse = await suiClient.getCoins({
            owner: currentAccount.address,
            coinType: `${PREDICT_CONFIG.PACKAGE_ID}::plp::PLP`
          });
          plpCoins = plpResponse.data;
        }
      }

      let targetAmount = parsed.amount;
      let targetStrike = parsed.strike;

      let targetOracleSviId = oracleSviId;
      let targetOracleExpiry = oracleExpiry;

      if (parsed.action === 'mint' && (parsed.asset || 'BTC').toUpperCase() === 'BTC') {
        try {
          const resolved = await resolveLiveOracle();
          if (resolved) {
            targetOracleSviId = normalizeSuiAddress(resolved.oracle_id);
            targetOracleExpiry = resolved.expiry;
            (parsed as any).oracleSviId = targetOracleSviId;
            (parsed as any).oracleExpiry = resolved.expiry;
          }
        } catch (resErr) {
          console.warn('Failed inline SVI resolution in executeCommandText:', resErr);
        }
      }

      if (parsed.action === 'redeem') {
        const wonPos = targetPosition || positions.find(p => p.status === 'Settled (Won)');
        if (wonPos) {
          if (targetAmount === 0) {
            targetAmount = wonPos.amount;
            parsed.amount = wonPos.amount;
          }
          if (!targetStrike) {
            targetStrike = wonPos.mappedStrike || wonPos.strike;
            parsed.strike = wonPos.strike;
          }
          if (!targetDirection) {
            targetDirection = wonPos.direction;
            parsed.direction = wonPos.direction;
          }
          if (wonPos.oracleSviId) targetOracleSviId = normalizeSuiAddress(wonPos.oracleSviId);
          if (wonPos.oracleExpiry) targetOracleExpiry = wonPos.oracleExpiry;

          // Resolve on-chain size dynamically
          if (!demoMode && simulatedManagerId && targetOracleSviId && targetOracleExpiry && targetStrike && targetDirection) {
            try {
              let res = await resolveOnChainPositionSizeAndStrike(
                simulatedManagerId,
                targetOracleSviId,
                targetOracleExpiry,
                targetStrike,
                targetDirection
              );
              
              // Dynamic Fallback: if the lookup returned 0 size, it might have been saved with stale/default oracle parameters.
              // Try resolving with the current active oracle resolved from on-chain/API state.
              let fallbackUsed = false;
              let fallbackOracleId = oracleSviId;
              let fallbackExpiry = oracleExpiry;
              if (res.size === 0) {
                try {
                  const resolved = await resolveLiveOracle();
                  if (resolved) {
                    fallbackOracleId = resolved.oracle_id;
                    fallbackExpiry = resolved.expiry;
                  }
                } catch (rErr) {
                  console.warn('Failed to resolve active oracle inside fallback:', rErr);
                }

                if (targetOracleSviId !== fallbackOracleId || targetOracleExpiry !== fallbackExpiry) {
                  console.log('Pre-flight lookup returned 0 size for saved position. Trying fallback with active oracle:', fallbackOracleId);
                  res = await resolveOnChainPositionSizeAndStrike(
                    simulatedManagerId,
                    fallbackOracleId,
                    fallbackExpiry,
                    targetStrike,
                    targetDirection
                  );
                  if (res.size > 0) {
                    fallbackUsed = true;
                  }
                }
              }

              if (res.size > 0) {
                targetAmount = res.size;
                parsed.amount = res.size;
                targetStrike = res.mappedStrike;
                (parsed as any).mappedStrike = res.mappedStrike;
                
                const finalOracleSviId = normalizeSuiAddress(res.oracleSviId || (fallbackUsed ? fallbackOracleId : targetOracleSviId));
                const finalOracleExpiry = res.oracleExpiry || (fallbackUsed ? fallbackExpiry : targetOracleExpiry);

                targetOracleSviId = finalOracleSviId;
                targetOracleExpiry = finalOracleExpiry;
                (parsed as any).oracleSviId = finalOracleSviId;
                (parsed as any).oracleExpiry = finalOracleExpiry;

                // Update local positions list so amount, strike, and oracle ID match on-chain
                setPositions(prev => prev.map(p => p.id === wonPos.id ? { 
                  ...p, 
                  amount: res.size, 
                  estPayout: res.size * 1.85,
                  mappedStrike: res.mappedStrike,
                  oracleSviId: finalOracleSviId,
                  oracleExpiry: finalOracleExpiry
                } : p));
              } else {
                console.warn('Pre-flight on-chain size check resolved to 0 or failed.');
              }
            } catch (sizeErr) {
              console.warn('Error resolving size in executeCommandText:', sizeErr);
            }
          }

          // Save resolved properties to parsed so they persist in msg.intent
          (parsed as any).positionId = wonPos.id;
          (parsed as any).mappedStrike = targetStrike;
          (parsed as any).oracleSviId = targetOracleSviId;
          (parsed as any).oracleExpiry = targetOracleExpiry;
          (parsed as any).wagerAsset = wonPos.wagerAsset || 'SUI';
          (parsed as any).asset = wonPos.asset || 'BTC';
        }
      }

      // 2. PTB Construction
      const wonPos = targetPosition || positions.find(p => p.status === 'Settled (Won)');
      const compiled = buildPTB(
        parsed.action,
        targetAmount,
        targetStrike,
        targetDirection,
        currentAccount && simulatedManagerId ? simulatedManagerId : undefined,
        dUsdcCoins,
        targetOracleSviId,
        currentAccount?.address,
        plpCoins,
        targetOracleExpiry,
        btcSpotPrice,
        parsed.wagerAsset || wonPos?.wagerAsset || 'SUI',
        parsed.asset || wonPos?.asset || 'BTC'
      );

      if (compiled.mappedStrike !== undefined) {
        (parsed as any).mappedStrike = compiled.mappedStrike;
      }

      // 3. Guardian Safety Audit
      const report = await auditTransaction(
        parsed.action,
        targetAmount,
        targetStrike,
        targetDirection,
        predictId,
        targetOracleSviId,
        parsed.asset
      );

      // Update history item with parsed details
      const now = new Date();
      const expiry = new Date(now.getTime() + 60 * 60 * 1000);
      setCommandHistory(prev => prev.map(item => {
        if (item.id === histId) {
          return {
            ...item,
            action: parsed.action,
            amount: parsed.amount,
            strike: parsed.strike,
            direction: targetDirection,
            expiryTime: parsed.action === 'mint' ? expiry : undefined,
            settlementTime: parsed.action === 'mint' ? expiry : undefined,
            estPayout: parsed.action === 'mint' ? parsed.amount * 1.85 : undefined,
            estWinnings: parsed.action === 'mint' ? parsed.amount * 0.85 : undefined
          };
        }
        return item;
      }));

      // 4. Construct Agent response
      const autocorrectNote = parsed.autocorrected && parsed.error
        ? `💡 *Note: I noticed a spelling typo in your command and corrected it (${parsed.error}).*\n\n`
        : '';
      const agentReply: ChatMessage = {
        id: `reply-${Date.now()}`,
        sender: 'agent',
        text: `${autocorrectNote}Parsed: **${compiled.description}**\n\nPTB compiled and checked by Guardian. Please review details below.`,
        timestamp: new Date(),
        intent: parsed,
        ptb: compiled,
        guardian: report,
        histId: histId, // Link to history item
        parentMessageId: userMessageId
      };

      setMessages(prev => [...prev, agentReply]);

    } catch (err: any) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: 'agent',
          text: `An error occurred while compiling your transaction: ${err.message}`,
          timestamp: new Date(),
          parentMessageId: userMessageId
        }
      ]);
      
      // Update history status to failed
      setCommandHistory(prev => prev.map(item => 
        item.id === histId ? { ...item, status: 'failed' } : item
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  // Edit an existing prompt in-place, recompile PTB, and update agent reply
  const handleEditMessage = async (msgId: string, newText: string) => {
    if (!newText.trim() || isProcessing) return;

    // Exit edit mode
    setEditingMessageId(null);
    setEditingText('');

    // Find the user message to get its histId
    const targetUserMsg = messages.find(m => m.id === msgId);
    if (!targetUserMsg) return;

    const histId = targetUserMsg.histId;

    setIsProcessing(true);

    // 1. Update the user message text in-place
    setMessages(prev => prev.map(m => 
      m.id === msgId ? { ...m, text: newText } : m
    ));

    // 2. Update the corresponding history item text and status to pending
    if (histId) {
      setCommandHistory(prev => prev.map(item => 
        item.id === histId ? { ...item, text: newText, status: 'pending' } : item
      ));
    }

    try {
      // Re-run AI intent parsing
      const parsed = await parseIntent(newText, apiKey);

      if (!parsed.success) {
        // Update the agent reply message to show error
        setMessages(prev => prev.map(m => {
          if (m.parentMessageId === msgId) {
            return {
              ...m,
              text: parsed.error || "I could not understand that command. Please try again.",
              intent: undefined,
              ptb: undefined,
              guardian: undefined,
              executed: false
            };
          }
          return m;
        }));

        // Update history status to failed
        if (histId) {
          setCommandHistory(prev => prev.map(item => 
            item.id === histId ? { ...item, status: 'failed' } : item
          ));
        }
        setIsProcessing(false);
        return;
      }

      if (parsed.action === 'vault_balance') {
        const latestBal = await fetchVaultBalance();
        setMessages(prev => prev.map(m => {
          if (m.parentMessageId === msgId) {
            return {
              ...m,
              text: `📊 **Yeti Predict LP Vault Balance:**\n\nThe current liquidity supplied to the LP Vault is **${latestBal} LOFI**.\n\nThis capital provides liquidity for options traders on Yeti Predict, earning option minting fees and payouts from out-of-the-money predictions.`,
              intent: parsed,
              ptb: undefined,
              guardian: undefined,
              executed: false
            };
          }
          return m;
        }));

        if (histId) {
          setCommandHistory(prev => prev.map(item => 
            item.id === histId ? { ...item, status: 'success', action: 'vault_balance' } : item
          ));
        }
        setIsProcessing(false);
        return;
      }

      // Convert parsed.direction type to match what transaction builder expects
      const targetDirection = parsed.direction === 'above' || parsed.direction === 'below' 
        ? parsed.direction 
        : undefined;

      // Fetch user's actual balances and coins if they have a wallet connected
      let dUsdcCoins: any[] = [];
      let plpCoins: any[] = [];
      if (currentAccount && (parsed.action === 'mint' || parsed.action === 'supply' || parsed.action === 'withdraw')) {
        // Fetch SUI gas balance
        const suiBalanceResp = await suiClient.getBalance({
          owner: currentAccount.address
        });
        const suiBalance = BigInt(suiBalanceResp.totalBalance);
        
        // SUI gas check
        if (suiBalance < 10_000_000n) {
          throw new Error(`Insufficient SUI gas balance. You have ${(Number(suiBalance) / 1_000_000_000).toFixed(4)} SUI. Yeti Predict transactions require SUI for gas. Please get testnet SUI from a faucet.`);
        }

        if (parsed.action === 'mint' || parsed.action === 'supply') {
          // Fetch dUSDC coins
          const coinResponse = await suiClient.getCoins({
            owner: currentAccount.address,
            coinType: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'
          });
          dUsdcCoins = coinResponse.data;
        }

        if (parsed.action === 'withdraw') {
          // Fetch PLP coins
          const plpResponse = await suiClient.getCoins({
            owner: currentAccount.address,
            coinType: `${PREDICT_CONFIG.PACKAGE_ID}::plp::PLP`
          });
          plpCoins = plpResponse.data;
        }
      }

      let targetOracleSviId = normalizeSuiAddress(oracleSviId);
      let targetOracleExpiry = oracleExpiry;

      if (parsed.action === 'mint' && (parsed.asset || 'BTC').toUpperCase() === 'BTC') {
        try {
          const resolved = await resolveLiveOracle();
          if (resolved) {
            targetOracleSviId = normalizeSuiAddress(resolved.oracle_id);
            targetOracleExpiry = resolved.expiry;
            (parsed as any).oracleSviId = targetOracleSviId;
            (parsed as any).oracleExpiry = resolved.expiry;
          }
        } catch (resErr) {
          console.warn('Failed inline SVI resolution in handleEditMessage:', resErr);
        }
      }

      // Re-compile PTB
      const compiled = buildPTB(
        parsed.action,
        parsed.amount,
        parsed.strike,
        targetDirection,
        currentAccount && simulatedManagerId ? simulatedManagerId : undefined,
        dUsdcCoins,
        targetOracleSviId,
        currentAccount?.address,
        plpCoins,
        targetOracleExpiry,
        btcSpotPrice,
        parsed.wagerAsset || 'SUI',
        parsed.asset || 'BTC'
      );

      // Re-run safety audit
      const report = await auditTransaction(
        parsed.action,
        parsed.amount,
        parsed.strike,
        targetDirection,
        predictId,
        targetOracleSviId,
        parsed.asset
      );

      // Update history item with parsed details
      const now = new Date();
      const expiry = new Date(now.getTime() + 60 * 60 * 1000);
      if (histId) {
        setCommandHistory(prev => prev.map(item => {
          if (item.id === histId) {
            return {
              ...item,
              action: parsed.action,
              amount: parsed.amount,
              strike: parsed.strike,
              direction: targetDirection,
              expiryTime: parsed.action === 'mint' ? expiry : undefined,
              settlementTime: parsed.action === 'mint' ? expiry : undefined,
              estPayout: parsed.action === 'mint' ? parsed.amount * 1.85 : undefined,
              estWinnings: parsed.action === 'mint' ? parsed.amount * 0.85 : undefined
            };
          }
          return item;
        }));
      }

      // Update the agent reply message in-place
      const autocorrectNote = parsed.autocorrected && parsed.error
        ? `💡 *Note: I noticed a spelling typo in your command and corrected it (${parsed.error}).*\n\n`
        : '';
      setMessages(prev => prev.map(m => {
        if (m.parentMessageId === msgId) {
          return {
            ...m,
            text: `${autocorrectNote}Parsed edit: **${compiled.description}**\n\nPTB updated and checked by Guardian. Please review details below.`,
            intent: parsed,
            ptb: compiled,
            guardian: report,
            executed: false // Reset execution status so they can sign the new tx
          };
        }
        return m;
      }));

    } catch (err: any) {
      console.error(err);
      
      // Update agent reply to error
      setMessages(prev => prev.map(m => {
        if (m.parentMessageId === msgId) {
          return {
            ...m,
            text: `An error occurred while compiling your edited transaction: ${err.message}`,
            intent: undefined,
            ptb: undefined,
            guardian: undefined,
            executed: false
          };
        }
        return m;
      }));

      // Update history status to failed
      if (histId) {
        setCommandHistory(prev => prev.map(item => 
          item.id === histId ? { ...item, status: 'failed' } : item
        ));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Process user chat prompt
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const userText = inputValue;
    setInputValue('');
    await executeCommandText(userText);
  };

  // Voice transcription setup using Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        let friendlyErr = '';
        if (event.error === 'not-allowed') {
          friendlyErr = 'Microphone access denied. Please click the mic icon in the browser address bar to allow permissions.';
        } else if (event.error === 'no-speech') {
          friendlyErr = 'No speech was detected. Please try speaking again.';
        } else {
          friendlyErr = `Speech transcription error: ${event.error}`;
        }

        setMessages(prev => [
          ...prev,
          {
            id: `voice-error-${Date.now()}`,
            sender: 'agent',
            text: `⚠️ **Voice Note Error**\n\n${friendlyErr}`,
            timestamp: new Date()
          }
        ]);
      };

      rec.onresult = (event: any) => {
        const speechText = event.results[0][0].transcript;
        if (speechText && speechText.trim()) {
          // Send transcribed message to AI processing pipeline
          executeCommandText(speechText);
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  const handleToggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please try Google Chrome, Microsoft Edge, or Safari.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const resolveOnChainPositionSizeAndStrike = async (
    managerId: string,
    oracleSviId: string,
    expiry: number | string,
    strike: number,
    direction: 'above' | 'below' | string
  ): Promise<{ size: number; mappedStrike: number; oracleSviId?: string; oracleExpiry?: number }> => {
    try {
      if (!managerId) return { size: 0, mappedStrike: 0 };
      console.log('Querying PredictManager positions table:', { managerId, oracleSviId, expiry, strike, direction });
      
      const managerResp = await fetch('https://fullnode.testnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [managerId, { showContent: true }]
        })
      });
      if (!managerResp.ok) return { size: 0, mappedStrike: 0 };
      const managerResult = await managerResp.json();
      const positionsTableId = managerResult?.result?.data?.content?.fields?.positions?.fields?.id?.id;
      if (!positionsTableId) return { size: 0, mappedStrike: 0 };

      const dirVal = direction === 'above' ? 0 : 1;

      // Fast path: if strike >= 10000, do direct lookup
      if (strike >= 10000) {
        const strikeVal = String(Math.floor(strike * 1_000_000_000));
        const dfResp = await fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'suix_getDynamicFieldObject',
            params: [
              positionsTableId,
              {
                type: `${PREDICT_CONFIG.PACKAGE_ID}::market_key::MarketKey`,
                value: {
                  direction: dirVal,
                  expiry: String(expiry),
                  oracle_id: normalizeSuiAddress(oracleSviId),
                  strike: strikeVal
                }
              }
            ]
          })
        });
        if (dfResp.ok) {
          const dfResult = await dfResp.json();
          if (!dfResult.error) {
            const rawValue = dfResult.result?.data?.content?.fields?.value;
            if (rawValue) {
              const valNum = Number(rawValue);
              if (valNum > 0) {
                return {
                  size: valNum / 1_000_000,
                  mappedStrike: strike,
                  oracleSviId,
                  oracleExpiry: Number(expiry)
                };
              }
            }
          }
        }
      }

      // Slow path: scan positions table fields for a matching oracle/expiry/direction (e.g. for mapped/pending strikes)
      console.log('Performing dynamic scan for matching on-chain position...');
      let hasNextPage = true;
      let cursor = null;
      const candidates: any[] = [];
      const allFields: any[] = [];

      while (hasNextPage) {
        const payload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'suix_getDynamicFields',
          params: cursor ? [positionsTableId, cursor] : [positionsTableId]
        };
        const response = await fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) break;
        const result = await response.json();
        if (result.result && result.result.data) {
          allFields.push(...result.result.data);
          for (const f of result.result.data) {
            const val = f.name?.value;
            if (val && 
                val.oracle_id && oracleSviId &&
                normalizeSuiAddress(val.oracle_id) === normalizeSuiAddress(oracleSviId) && 
                String(val.expiry) === String(expiry) && 
                Number(val.direction) === dirVal) {
              candidates.push(f);
            }
          }
          hasNextPage = result.result.hasNextPage;
          cursor = result.result.nextCursor;
        } else {
          hasNextPage = false;
        }
      }

      console.log(`Found ${candidates.length} candidate dynamic fields matching exact criteria.`);

      // Query candidate details to find one with size > 0
      for (const cand of candidates) {
        const objPayload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [cand.objectId, { showContent: true }]
        };
        const response = await fetch('https://fullnode.testnet.sui.io:443', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(objPayload)
        });
        if (!response.ok) continue;
        const objResult = await response.json();
        const content = objResult.result?.data?.content;
        if (content && content.fields) {
          const value = Number(content.fields.value);
          if (value > 0) {
            const onChainStrike = Number(cand.name.value.strike) / 1_000_000_000;
            console.log('Successfully matched on-chain position in slow path:', {
              strike: onChainStrike,
              size: value / 1_000_000
            });
            return {
              size: value / 1_000_000,
              mappedStrike: onChainStrike,
              oracleSviId,
              oracleExpiry: Number(expiry)
            };
          }
        }
      }

      // Super Fallback: check all fields in the table for ANY active position matching the direction
      console.log(`No exact match found. Performing deep scan over all ${allFields.length} fields in positions table...`);
      for (const field of allFields) {
        const objPayload = {
          jsonrpc: '2.0',
          id: 1,
          method: 'sui_getObject',
          params: [field.objectId, { showContent: true }]
        };
        try {
          const response = await fetch('https://fullnode.testnet.sui.io:443', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(objPayload)
          });
          if (!response.ok) continue;
          const objResult = await response.json();
          const content = objResult.result?.data?.content;
          if (content && content.fields) {
            const value = Number(content.fields.value);
            if (value > 0) {
              const nameVal = content.fields.name?.fields || content.fields.name;
              const onChainDir = Number(nameVal?.direction);
              const onChainOracleId = nameVal?.oracle_id;
              const onChainExpiry = Number(nameVal?.expiry);
              const onChainStrike = Number(nameVal?.strike) / 1_000_000_000;
              
              console.log('Deep scan found active position:', {
                direction: onChainDir,
                oracle_id: onChainOracleId,
                expiry: onChainExpiry,
                strike: onChainStrike,
                size: value / 1_000_000
              });

              if (onChainDir === dirVal) {
                console.log('Matched active position by direction in deep scan:', {
                  strike: onChainStrike,
                  size: value / 1_000_000,
                  oracle_id: onChainOracleId,
                  expiry: onChainExpiry
                });
                return {
                  size: value / 1_000_000,
                  mappedStrike: onChainStrike,
                  oracleSviId: onChainOracleId,
                  oracleExpiry: onChainExpiry
                };
              }
            }
          }
        } catch (err) {
          console.warn('Error fetching details for object in deep scan:', field.objectId, err);
        }
      }

      console.warn('No active (size > 0) positions found for criteria.');
      return { size: 0, mappedStrike: 0 };
    } catch (err) {
      console.error('Error in resolveOnChainPositionSizeAndStrike:', err);
      return { size: 0, mappedStrike: 0 };
    }
  };

  // Sign and submit PTB to Sui Testnet
  const handleExecutePTB = async (msg: ChatMessage) => {
    if (!msg.ptb || executionLoading) return;

    let resolvedExpiry: number | undefined = (msg.intent as any)?.oracleExpiry;

    const isMoveAbortWithCode = (errorMsg: string, code: number) => {
      if (!errorMsg.includes('MoveAbort')) return false;
      const regex = new RegExp(`(?:code|abort code)\\s*:?\\s*${code}\\b|\\,\\s*${code}\\s*\\)`);
      return regex.test(errorMsg);
    };

    // Defensive check: Rebuild the transaction block on the fly if it is a legacy/corrupted message
    if (msg.intent && msg.intent.action === 'redeem') {
      const targetStr = msg.intent.strike;
      const targetDir = msg.intent.direction;
      const targetPosId = (msg.intent as any).positionId;
      const wonPos = positions.find(p => 
        (targetPosId ? p.id === targetPosId : true) &&
        (p.status === 'Settled (Won)' || p.status === 'Active') && 
        (!targetStr || p.strike === targetStr) && 
        (!targetDir || p.direction === targetDir)
      );
      let targetOracleSviId = normalizeSuiAddress(wonPos?.oracleSviId || (msg.intent as any).oracleSviId || oracleSviId);
      let targetOracleExpiry = wonPos?.oracleExpiry || (msg.intent as any).oracleExpiry || oracleExpiry;
      resolvedExpiry = targetOracleExpiry;
      let targetStrike = wonPos?.mappedStrike || (msg.intent as any).mappedStrike || msg.intent.strike;
      const targetWagerAsset = wonPos?.wagerAsset || (msg.intent as any).wagerAsset || 'SUI';
      const targetAsset = wonPos?.asset || 'BTC';
      const finalDir = targetDir || wonPos?.direction;

      let onChainSize = msg.intent.amount;
      if (!demoMode && simulatedManagerId && targetOracleSviId && targetOracleExpiry && targetStrike && finalDir) {
        setExecutionLoading(true);
        let res = await resolveOnChainPositionSizeAndStrike(
          simulatedManagerId,
          targetOracleSviId,
          targetOracleExpiry,
          targetStrike,
          finalDir
        );

        // Dynamic Fallback: if the lookup returned 0 size, it might have been saved with stale/default oracle parameters.
        // Try resolving with the current active oracle resolved from on-chain/API state.
        let fallbackUsed = false;
        let fallbackOracleId = normalizeSuiAddress(oracleSviId);
        let fallbackExpiry = oracleExpiry;
        if (res.size === 0) {
          try {
            const resolved = await resolveLiveOracle();
            if (resolved) {
              fallbackOracleId = normalizeSuiAddress(resolved.oracle_id);
              fallbackExpiry = resolved.expiry;
            }
          } catch (rErr) {
            console.warn('Failed to resolve active oracle inside fallback:', rErr);
          }

          if (normalizeSuiAddress(targetOracleSviId) !== fallbackOracleId || targetOracleExpiry !== fallbackExpiry) {
            console.log('Pre-flight lookup returned 0 size for saved position. Trying fallback with resolved active oracle:', fallbackOracleId);
            res = await resolveOnChainPositionSizeAndStrike(
              simulatedManagerId,
              fallbackOracleId,
              fallbackExpiry,
              targetStrike,
              finalDir
            );
            if (res.size > 0) {
              fallbackUsed = true;
            }
          }
        }

        if (res.size === 0) {
          setMessages(prev => [
            ...prev,
            {
              id: `redeem-failed-${Date.now()}`,
              sender: 'agent',
              text: `⚠️ **Redemption Pre-flight Check Failed**\n\n❌ **Position Not Found On-Chain:** The prediction contract does not show an active balance for this position. It may have already been redeemed or expired out-of-the-money.`,
              timestamp: new Date()
            }
          ]);
          setExecutionLoading(false);
          return;
        }
        onChainSize = res.size;
        msg.intent.amount = res.size;
        targetStrike = res.mappedStrike;

        const finalOracleSviId = normalizeSuiAddress(res.oracleSviId || (fallbackUsed ? fallbackOracleId : targetOracleSviId));
        const finalOracleExpiry = res.oracleExpiry || (fallbackUsed ? fallbackExpiry : targetOracleExpiry);

        targetOracleSviId = finalOracleSviId;
        targetOracleExpiry = finalOracleExpiry;
        resolvedExpiry = finalOracleExpiry;
        (msg.intent as any).oracleSviId = finalOracleSviId;
        (msg.intent as any).oracleExpiry = finalOracleExpiry;

        if (wonPos) {
          setPositions(prev => prev.map(p => p.id === wonPos.id ? { 
            ...p, 
            amount: res.size, 
            estPayout: res.size * 1.85,
            mappedStrike: res.mappedStrike,
            oracleSviId: finalOracleSviId,
            oracleExpiry: finalOracleExpiry
          } : p));
        }
        setExecutionLoading(false);
      }

      if (!msg.ptb.tx || typeof msg.ptb.tx.toJSON !== 'function' || msg.intent.action === 'redeem') {
        try {
          const rebuilt = buildPTB(
            'redeem',
            onChainSize,
            targetStrike,
            finalDir === 'above' || finalDir === 'below' ? finalDir : undefined,
            simulatedManagerId || 'sim-manager',
            [],
            targetOracleSviId,
            currentAccount?.address || '0x0000000000000000000000000000000000000000000000000000000000000000',
            [],
            targetOracleExpiry,
            btcSpotPrice,
            targetWagerAsset,
            targetAsset
          );
          msg.ptb.tx = rebuilt.tx;
          msg.ptb.serializedTx = rebuilt.serializedTx;
        } catch (rebuildErr) {
          console.error('Failed to dynamically rebuild redeem PTB:', rebuildErr);
        }
      }
    }
    
    if (demoMode) {
      setExecutionLoading(true);
      setTimeout(async () => {
        const mockDigest = 'mock_tx_' + Math.random().toString(36).substring(2, 15);
        
        // Update corresponding history item to success
        if (msg.histId) {
          setCommandHistory(prev => prev.map(item => 
            item.id === msg.histId ? { ...item, status: 'success' } : item
          ));
        }

        // Update message status
        setMessages(prev => prev.map(m => {
          if (m.id === msg.id) {
            return { ...m, executed: true, txDigest: mockDigest };
          }
          return m;
        }));

        // Add success response from agent
        const isMint = msg.intent && msg.intent.action === 'mint';
        const isSupply = msg.intent && msg.intent.action === 'supply';
        const supplyAmount = msg.intent?.amount || 0;
        const redeemInstruction = isMint 
          ? `\n\n💡 **Important Note:** On Yeti Predict, option winnings are not credited automatically to your wallet. Once this option expires and if it settles in-the-money (Won), click on the position card in the right sidebar and click **Redeem Payout** to sign the claim transaction and receive your LOFI winnings. Alternatively, you can type **"redeem payouts"** in the chat box or click the microphone button to send a voice note dictating the command to redeem your payout.` 
          : '';
        const supplyInstruction = isSupply
          ? `\n\n💰 **Vault Supply Active:** You have successfully supplied **${supplyAmount} LOFI** to the Predict LP Vault.\n\n⚙️ **What your LOFI is doing:**\nYour capital actively provides counterparty liquidity for options traders on Yeti Predict. You earn premiums from options traders and a proportional share of vault fees (~12-18% target APR).\n\n🔄 **How to withdraw:**\nYou can unstake your capital at any time. Simply type or dictate: **"withdraw ${supplyAmount} LP"** (or click the Quick Action pill) to burn your PLP shares and receive your LOFI back in your wallet.`
          : '';
        const additionalInstruction = redeemInstruction || supplyInstruction;
        setMessages(prev => [
          ...prev,
          {
            id: `success-${Date.now()}`,
            sender: 'agent',
            text: `🎉 **[DEMO MODE] Transaction Simulated Successfully!**\n\nYour intent was processed in simulated sandbox mode.\n* **Mock Digest:** \`${mockDigest.substring(0, 16)}...\`\n* **Status:** Success${additionalInstruction}\n\n*(Note: In production, this would trigger a wallet signature request and execute on the Sui network).*`,
            timestamp: new Date()
          }
        ]);

        // If it was a minting action, update local simulated positions list
        const positionNow = new Date();
        const positionExpiry = new Date(positionNow.getTime() + 60 * 60 * 1000);
        if (msg.intent && msg.intent.action === 'mint') {
          updateDemoBalance(-msg.intent.amount, msg.intent.wagerAsset);
          const itemDirection = msg.intent.direction === 'above' || msg.intent.direction === 'below'
            ? (msg.intent.direction === 'above' ? 'Call' : 'Put') as 'Call' | 'Put'
            : 'Call' as 'Call' | 'Put';

          const mappedStrike = (msg.ptb as any)?.mappedStrike || msg.intent.mappedStrike || msg.intent.strike;

          setPositions(prev => [
            ...prev,
            {
              id: `sim-${Date.now()}`,
              type: itemDirection,
              strike: msg.intent?.strike,
              amount: msg.intent?.amount || 0,
              status: 'Active',
              timestamp: positionNow,
              expiryTime: positionExpiry,
              settlementTime: positionExpiry,
              estPayout: (msg.intent?.amount || 0) * 1.85,
              estWinnings: (msg.intent?.amount || 0) * 0.85,
              txDigest: mockDigest,
              asset: msg.intent?.asset || 'BTC',
              direction: msg.intent?.direction as 'above' | 'below',
              wagerAsset: msg.intent?.wagerAsset || 'SUI',
              oracleSviId: (msg.intent as any).oracleSviId || oracleSviId,
              oracleExpiry: (msg.intent as any).oracleExpiry || oracleExpiry,
              mappedStrike: mappedStrike
            }
          ]);
        } else if (msg.intent && msg.intent.action === 'supply') {
          updateDemoBalance(-msg.intent.amount, msg.intent.wagerAsset || 'LOFI');
          setPositions(prev => [
            ...prev,
            {
              id: `sim-${Date.now()}`,
              type: 'LP',
              amount: msg.intent?.amount || 0,
              status: 'Active',
              timestamp: positionNow,
              txDigest: mockDigest,
              estPayout: msg.intent?.amount || 0,
              estWinnings: 0,
              wagerAsset: msg.intent?.wagerAsset || 'LOFI'
            }
          ]);
        } else if (msg.intent && msg.intent.action === 'withdraw') {
          updateDemoBalance(msg.intent.amount, msg.intent.wagerAsset || 'LOFI');
          const withdrawAmount = msg.intent.amount;
          setPositions(prev => {
            let remainingToDeduct = withdrawAmount;
            const nextPositions: any[] = [];
            for (const pos of prev) {
              if (pos.type === 'LP' && pos.status === 'Active' && remainingToDeduct > 0) {
                if (pos.amount <= remainingToDeduct) {
                  remainingToDeduct -= pos.amount;
                  nextPositions.push({
                    ...pos,
                    status: 'Settled (Withdrawn)' as const,
                    timestamp: positionNow
                  });
                } else {
                  const activePart = pos.amount - remainingToDeduct;
                  const withdrawnPart = remainingToDeduct;
                  remainingToDeduct = 0;
                  nextPositions.push({
                    ...pos,
                    amount: activePart
                  });
                  nextPositions.push({
                    ...pos,
                    id: `${pos.id}-withdrawn-${Date.now()}`,
                    amount: withdrawnPart,
                    status: 'Settled (Withdrawn)' as const,
                    timestamp: positionNow
                  });
                }
              } else {
                nextPositions.push(pos);
              }
            }
            if (remainingToDeduct > 0) {
              nextPositions.push({
                id: `sim-${Date.now()}`,
                type: 'LP',
                amount: -remainingToDeduct,
                status: 'Settled (Withdrawn)',
                timestamp: positionNow,
                txDigest: mockDigest
              });
            }
            return nextPositions;
          });
        } else if (msg.intent && msg.intent.action === 'redeem') {
          const targetStr = msg.intent?.strike;
          const targetDir = msg.intent?.direction;
          const wonPos = positions.find(p => 
            (p.status === 'Settled (Won)' || p.status === 'Active') && 
            (!targetStr || p.strike === targetStr) && 
            (!targetDir || p.direction === targetDir)
          );
          
          const creditAmount = wonPos ? (wonPos.estPayout || (wonPos.amount * 1.85)) : ((msg.intent?.amount || 0) * 1.85);
          
          if (creditAmount > 0) {
            updateDemoBalance(creditAmount, wonPos?.wagerAsset || msg.intent?.wagerAsset || 'LOFI');
          }

          setPositions(prev => prev.map(p => {
            const matches = (p.status === 'Settled (Won)' || p.status === 'Active') && (!targetStr || p.strike === targetStr) && (!targetDir || p.direction === targetDir);
            if (matches) {
              return {
                ...p,
                status: 'Settled (Redeemed)' as const
              };
            }
            return p;
          }));

          // Add a green system win alert in the middle panel
          setMessages(prev => [
            ...prev,
            {
              id: `redeem-success-${Date.now()}`,
              sender: 'agent',
              text: `🏆 **Option Winnings Credited: WON!**\n\nSuccessfully redeemed payout for option at strike ${targetStr?.toLocaleString() || 'N/A'}.\n\n* **Amount Credited:** +${creditAmount.toFixed(2)} ${wonPos?.wagerAsset || 'LOFI'}\n* **Transaction Hash:** \`${mockDigest}\`\n\nYour simulated balance has been updated.`,
              wagerAsset: wonPos?.wagerAsset || 'LOFI',
              timestamp: new Date(),
              isSystemNotification: true
            }
          ]);
        }
        setExecutionLoading(false);
      }, 1000);
      return;
    }

    if (!currentAccount) {
      alert("Please connect your wallet first!");
      return;
    }

    setExecutionLoading(true);
    try {
      // Pre-flight dry-run check to prevent on-chain execution failures (MoveAborts)
      try {
        const dryRunResult = await suiClient.devInspectTransactionBlock({
          sender: currentAccount.address,
          transactionBlock: msg.ptb.tx
        });
        if (dryRunResult.effects.status.status === 'failure') {
          const errorMsg = dryRunResult.effects.status.error || '';
          console.warn('Dry-run pre-flight failed:', errorMsg);
          
          let friendlyError = 'The transaction simulation returned an error. This action cannot be executed at this time.';
          
          if (isMoveAbortWithCode(errorMsg, 9)) {
            const oracleExp = resolvedExpiry || (msg.intent as any)?.oracleExpiry || oracleExpiry;
            const hoursSinceExpiry = oracleExp ? (Date.now() - Number(oracleExp)) / (1000 * 60 * 60) : 0;
            if (hoursSinceExpiry > 2) {
              friendlyError = `⏳ **Oracle Not Settled Yet (Testnet Sync Delay):** The prediction period for this oracle has not been settled on-chain yet. Since this oracle expired on **${new Date(oracleExp!).toLocaleString()}** (more than 2 hours ago), the testnet admin price feed bot appears to be offline or out-of-sync.\n\n💡 **How to proceed:** Please enable **Demo Mode** in the settings panel (left sidebar) to bypass on-chain testnet oracle restrictions and successfully test the redemption flow locally.`;
            } else if (oracleExp) {
              const settleTimeStr = new Date(oracleExp).toLocaleTimeString();
              friendlyError = `⏳ **Oracle Not Settled Yet:** The prediction period for this oracle has not been settled on-chain yet. The oracle is scheduled to settle after **${settleTimeStr}**. Please retry the redemption after **${settleTimeStr}**.`;
            } else {
              friendlyError = '⏳ **Oracle Not Settled Yet:** The prediction period for this oracle has not been settled on-chain yet. Please wait a few minutes for the oracle price feed to post the final settlement and try again.';
            }
          } else if (
            isMoveAbortWithCode(errorMsg, 7) || 
            (isMoveAbortWithCode(errorMsg, 1) && msg.intent?.action === 'mint') ||
            errorMsg.includes('assert_mintable_ask') || 
            errorMsg.includes('assert_mintable_bid') ||
            errorMsg.includes('quote_spread_from_fair_price')
          ) {
            friendlyError = '❌ **Option Strike Unmintable:** The requested strike price is out of the allowed minting bounds relative to the current spot price. Try choosing a different strike closer to the spot price.';
          } else if (isMoveAbortWithCode(errorMsg, 1) && msg.intent?.action === 'redeem') {
            friendlyError = '❌ **Position Not Found:** The on-chain position registry does not contain this strike or position. This might be due to a strike price mapping discrepancy.';
          } else if (isMoveAbortWithCode(errorMsg, 6)) {
            friendlyError = '❌ **Position Already Redeemed:** This position has already been redeemed.';
          } else if (errorMsg.includes('MoveAbort')) {
            friendlyError = `❌ **On-Chain Move Abort:** The smart contract aborted execution. (Details: ${errorMsg})`;
          } else if (errorMsg.includes('CoinBalanceUnused') || errorMsg.includes('InsufficientBalance')) {
            friendlyError = '❌ **Insufficient Balance:** You do not have enough funds to complete this transaction.';
          }

          // Suggest strikes if a mint action fails
          if (msg.intent && msg.intent.action === 'mint' && msg.intent.asset) {
            const step = msg.intent.asset.toUpperCase() === 'ETH' ? 50 : 500;
            const dir = msg.intent.direction || 'above';
            const isAbove = dir === 'above';
            
            let recsList: string[] = [];
            const guardianErr = msg.guardian?.warnings?.find((w: any) => w.id === 'strike-unmintable-error' || w.id === 'strike-simulation-error' || w.id === 'strike-invalid-error');
            if (guardianErr && guardianErr.recommendations) {
              recsList = guardianErr.recommendations;
            } else {
              const closest = Math.round(spotPrice / step) * step;
              const recs = isAbove
                ? [closest, closest + step, closest + 2 * step]
                : [closest, closest - step, closest - 2 * step];
              recsList = recs.map(s => `bet ${msg.intent?.amount || 100} LOFI on BTC ${dir} ${s}`);
            }

            friendlyError += `\n\n💡 **Recommended mintable options to try instead:**\n` + 
              recsList.map(r => `* ${r}`).join('\n');
          }

          // Add error bubble in the chat log
          setMessages(prev => [
            ...prev,
            {
              id: `dryrun-failed-${Date.now()}`,
              sender: 'agent',
              text: `⚠️ **Transaction Pre-flight Check Failed**\n\n${friendlyError}`,
              timestamp: new Date(),
              showSupportButton: true
            }
          ]);
          setExecutionLoading(false);
          return;
        }
      } catch (dryRunErr: any) {
        const errorMsg = dryRunErr?.message || String(dryRunErr);
        console.warn('Dry-run RPC query failed:', errorMsg);

        let friendlyError = 'The transaction simulation returned an error. This action cannot be executed at this time.';
        if (errorMsg.includes('MoveAbort') || errorMsg.includes('CoinBalanceUnused') || errorMsg.includes('InsufficientBalance')) {
          if (isMoveAbortWithCode(errorMsg, 9)) {
            const oracleExp = resolvedExpiry || (msg.intent as any)?.oracleExpiry || oracleExpiry;
            const hoursSinceExpiry = oracleExp ? (Date.now() - Number(oracleExp)) / (1000 * 60 * 60) : 0;
            if (hoursSinceExpiry > 2) {
              friendlyError = `⏳ **Oracle Not Settled Yet (Testnet Sync Delay):** The prediction period for this oracle has not been settled on-chain yet. Since this oracle expired on **${new Date(oracleExp!).toLocaleString()}** (more than 2 hours ago), the testnet admin price feed bot appears to be offline or out-of-sync.\n\n💡 **How to proceed:** Please enable **Demo Mode** in the settings panel (left sidebar) to bypass on-chain testnet oracle restrictions and successfully test the redemption flow locally.`;
            } else if (oracleExp) {
              const settleTimeStr = new Date(oracleExp).toLocaleTimeString();
              friendlyError = `⏳ **Oracle Not Settled Yet:** The prediction period for this oracle has not been settled on-chain yet. The oracle is scheduled to settle after **${settleTimeStr}**. Please retry the redemption after **${settleTimeStr}**.`;
            } else {
              friendlyError = '⏳ **Oracle Not Settled Yet:** The prediction period for this oracle has not been settled on-chain yet. Please wait a few minutes for the oracle price feed to post the final settlement and try again.';
            }
          } else if (
            isMoveAbortWithCode(errorMsg, 7) || 
            (isMoveAbortWithCode(errorMsg, 1) && msg.intent?.action === 'mint') ||
            errorMsg.includes('assert_mintable_ask') || 
            errorMsg.includes('assert_mintable_bid') ||
            errorMsg.includes('quote_spread_from_fair_price')
          ) {
            friendlyError = '❌ **Option Strike Unmintable:** The requested strike price is out of the allowed minting bounds relative to the current spot price. Try choosing a different strike closer to the spot price.';
          } else if (isMoveAbortWithCode(errorMsg, 1)) {
            friendlyError = '❌ **Position Not Found:** The on-chain position registry does not contain this strike or position. This might be due to a strike price mapping discrepancy.';
          } else if (isMoveAbortWithCode(errorMsg, 6)) {
            friendlyError = '❌ **Position Already Redeemed:** This position has already been redeemed.';
          } else if (errorMsg.includes('MoveAbort')) {
            friendlyError = `❌ **On-Chain Move Abort:** The smart contract aborted execution. (Details: ${errorMsg})`;
          } else if (errorMsg.includes('CoinBalanceUnused') || errorMsg.includes('InsufficientBalance')) {
            friendlyError = '❌ **Insufficient Balance:** You do not have enough funds to complete this transaction.';
          }
        } else {
          friendlyError = `❌ **Simulation Error:** ${errorMsg}`;
        }

        // Add error bubble in the chat log
        setMessages(prev => [
          ...prev,
          {
            id: `dryrun-failed-${Date.now()}`,
            sender: 'agent',
            text: `⚠️ **Transaction Pre-flight Check Failed**\n\n${friendlyError}`,
            timestamp: new Date(),
            showSupportButton: true
          }
        ]);
        setExecutionLoading(false);
        return;
      }

      // Execute the PTB
      const result = await signAndExecuteTx({
        transaction: msg.ptb.tx,
      });

      console.log('Transaction Executed:', result);

      // Wait for transaction indexing
      try {
        await suiClient.waitForTransaction({ digest: result.digest });
      } catch (waitErr) {
        console.warn('Timeout or error waiting for transaction block indexing:', waitErr);
      }

      // Refresh balance after transaction execution
      await fetchDUsdcBalance();

      // Update corresponding history item to success
      if (msg.histId) {
        setCommandHistory(prev => prev.map(item => 
          item.id === msg.histId ? { ...item, status: 'success' } : item
        ));
      }

      // Update message status
      setMessages(prev => prev.map(m => {
        if (m.id === msg.id) {
          return { ...m, executed: true, txDigest: result.digest };
        }
        return m;
      }));

      // Add success response from agent
      const isMint = msg.intent && msg.intent.action === 'mint';
      const isSupply = msg.intent && msg.intent.action === 'supply';
      const supplyAmount = msg.intent?.amount || 0;
      const redeemInstruction = isMint 
        ? `\n\n💡 **Important Note:** On Yeti Predict, option winnings are not credited automatically to your wallet. Once this option expires and if it settles in-the-money (Won), click on the position card in the right sidebar and click **Redeem Payout** to sign the claim transaction and receive your LOFI winnings. Alternatively, you can type **"redeem payouts"** in the chat box or click the microphone button to send a voice note dictating the command to redeem your payout.` 
        : '';
      const supplyInstruction = isSupply
        ? `\n\n💰 **Vault Supply Active:** You have successfully supplied **${supplyAmount} LOFI** to the Predict LP Vault.\n\n⚙️ **What your LOFI is doing:**\nYour capital actively provides counterparty liquidity for options traders on Yeti Predict. You earn premiums from options traders and a proportional share of vault fees (~12-18% target APR).\n\n🔄 **How to withdraw:**\nYou can unstake your capital at any time. Simply type or dictate: **"withdraw ${supplyAmount} LP"** (or click the Quick Action pill) to burn your PLP shares and receive your LOFI back in your wallet.`
        : '';
      const additionalInstruction = redeemInstruction || supplyInstruction;
      setMessages(prev => [
        ...prev,
        {
          id: `success-${Date.now()}`,
          sender: 'agent',
          text: `🎉 **Transaction Successful!**\n\nYour intent has been executed on Sui Testnet.\n* **Digest:** \`${result.digest.substring(0, 16)}...\`\n* **View Transaction:** [Suiscan Explorer](https://suiscan.xyz/testnet/tx/${result.digest})${additionalInstruction}`,
          timestamp: new Date()
        }
      ]);

      // If it was a minting action, update local simulated positions list
      const positionNow = new Date();
      const positionExpiry = new Date(positionNow.getTime() + 60 * 60 * 1000);
      if (msg.intent && msg.intent.action === 'mint') {
        const itemDirection = msg.intent.direction === 'above' || msg.intent.direction === 'below'
          ? (msg.intent.direction === 'above' ? 'Call' : 'Put') as 'Call' | 'Put'
          : 'Call' as 'Call' | 'Put';

        const mappedStrike = (msg.ptb as any)?.mappedStrike || msg.intent.mappedStrike || msg.intent.strike;

        setPositions(prev => [
          ...prev,
          {
            id: `sim-${Date.now()}`,
            type: itemDirection,
            strike: msg.intent?.strike,
            amount: msg.intent?.amount || 0,
            status: 'Active',
            timestamp: positionNow,
            expiryTime: positionExpiry,
            settlementTime: positionExpiry,
            estPayout: (msg.intent?.amount || 0) * 1.85,
            estWinnings: (msg.intent?.amount || 0) * 0.85,
            txDigest: result.digest,
            asset: msg.intent?.asset || 'BTC',
            direction: msg.intent?.direction as 'above' | 'below',
            wagerAsset: msg.intent?.wagerAsset || 'SUI',
            oracleSviId: (msg.intent as any).oracleSviId || oracleSviId,
            oracleExpiry: (msg.intent as any).oracleExpiry || oracleExpiry,
            mappedStrike: mappedStrike
          }
        ]);
      } else if (msg.intent && msg.intent.action === 'supply') {
        setPositions(prev => [
          ...prev,
          {
            id: `sim-${Date.now()}`,
            type: 'LP',
            amount: msg.intent?.amount || 0,
            status: 'Active',
            timestamp: positionNow,
            txDigest: result.digest,
            estPayout: msg.intent?.amount || 0,
            estWinnings: 0,
            wagerAsset: msg.intent?.wagerAsset || 'LOFI'
          }
        ]);
      } else if (msg.intent && msg.intent.action === 'withdraw') {
        const withdrawAmount = msg.intent.amount;
        setPositions(prev => {
          let remainingToDeduct = withdrawAmount;
          const nextPositions: any[] = [];
          for (const pos of prev) {
            if (pos.type === 'LP' && pos.status === 'Active' && remainingToDeduct > 0) {
              if (pos.amount <= remainingToDeduct) {
                remainingToDeduct -= pos.amount;
                nextPositions.push({
                  ...pos,
                  status: 'Settled (Withdrawn)' as const,
                  timestamp: positionNow
                });
              } else {
                const activePart = pos.amount - remainingToDeduct;
                const withdrawnPart = remainingToDeduct;
                remainingToDeduct = 0;
                nextPositions.push({
                  ...pos,
                  amount: activePart
                });
                nextPositions.push({
                  ...pos,
                  id: `${pos.id}-withdrawn-${Date.now()}`,
                  amount: withdrawnPart,
                  status: 'Settled (Withdrawn)' as const,
                  timestamp: positionNow
                });
              }
            } else {
              nextPositions.push(pos);
            }
          }
          if (remainingToDeduct > 0) {
            nextPositions.push({
              id: `sim-${Date.now()}`,
              type: 'LP',
              amount: -remainingToDeduct,
              status: 'Settled (Withdrawn)',
              timestamp: positionNow,
              txDigest: result.digest
            });
          }
          return nextPositions;
        });
      } else if (msg.intent && msg.intent.action === 'redeem') {
        const targetStr = msg.intent.strike;
        const targetDir = msg.intent.direction;
        const wonPos = positions.find(p => 
          (p.status === 'Settled (Won)' || p.status === 'Active') && 
          (!targetStr || p.strike === targetStr) && 
          (!targetDir || p.direction === targetDir)
        );
        
        const creditAmount = wonPos ? (wonPos.estPayout || (wonPos.amount * 1.85)) : ((msg.intent?.amount || 0) * 1.85);

        setPositions(prev => prev.map(p => {
          const matches = (p.status === 'Settled (Won)' || p.status === 'Active') && (!targetStr || p.strike === targetStr) && (!targetDir || p.direction === targetDir);
          if (matches) {
            return {
              ...p,
              status: 'Settled (Redeemed)' as const
            };
          }
          return p;
        }));

        // Add a green system win alert in the middle panel with Sui explorer link
        setMessages(prev => [
          ...prev,
          {
            id: `redeem-success-${Date.now()}`,
            sender: 'agent',
            text: `🏆 **Option Winnings Credited: WON!**\n\nSuccessfully redeemed payout for option at strike ${targetStr?.toLocaleString() || 'N/A'}.\n\n* **Amount Credited:** +${creditAmount.toFixed(2)} ${wonPos?.wagerAsset || 'LOFI'}\n* **Transaction Digest:** [${result.digest.substring(0, 16)}...](https://suiscan.xyz/testnet/tx/${result.digest})\n\nYour wallet balance has been updated.`,
            wagerAsset: wonPos?.wagerAsset || 'LOFI',
            timestamp: new Date(),
            isSystemNotification: true
          }
        ]);
      }

    } catch (err: any) {
      console.error(err);
      
      // Update corresponding history item to failed
      if (msg.histId) {
        setCommandHistory(prev => prev.map(item => 
          item.id === msg.histId ? { ...item, status: 'failed' } : item
        ));
      }

      const isZkLoginError = err.message?.toLowerCase().includes('zklogin') || err.message?.toLowerCase().includes('nonce');
      const errorText = isZkLoginError
        ? `⚠️ **Transaction Execution Failed (zkLogin Issue)**\n\nIt looks like your wallet is using zkLogin (Google/social login) and failed to generate a cryptographic nonce. This is a common issue with zkLogin accounts on Testnet.\n\n**Troubleshooting Steps:**\n1. **Switch to a standard account (Recommended):** In your Sui Wallet, create or import a standard passphrase/mnemonic-based account. Standard accounts bypass zkLogin verification entirely and work reliably.\n2. **Re-authenticate:** Lock and unlock your wallet, or log out and log back in, which refreshes the zkLogin session and generates a new ephemeral key.\n3. **Verify Network:** Double-check that your wallet extension network is set to **Testnet**.`
        : `❌ **Transaction execution failed:** ${err.message}`;

      setMessages(prev => [
        ...prev,
        {
          id: `error-execute-${Date.now()}`,
          sender: 'agent',
          text: errorText,
          timestamp: new Date(),
          showSupportButton: true
        }
      ]);
    } finally {
      setExecutionLoading(false);
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="logo-container">
          <button 
            type="button"
            className="mobile-header-btn"
            onClick={() => {
              setLeftSidebarOpen(!leftSidebarOpen);
              setRightSidebarOpen(false);
            }}
            title="Toggle Settings & Assets"
          >
            <Settings size={20} />
          </button>
          
          <div className="logo-icon" style={{ background: 'transparent', boxShadow: 'none', border: 'none', display: 'flex', padding: 0 }}>
            <PieLogo size={28} />
          </div>
          <span className="logo-text">Yeti P.I.E.</span>
          <span className="logo-tag">Predict Engine</span>
        </div>
        
        <div className="header-prices-container">
          <div className="header-price-item">
            <span className="price-label">BTC</span>
            <span className="price-value">${btcSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="header-price-divider" />
          <div className="header-price-item">
            <span className="price-label">ETH</span>
            <span className="price-value">${ethSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="header-price-divider" />
          <div className="header-price-item">
            <span className="price-label" style={{ color: 'var(--color-secondary)' }}>LOFI</span>
            <span className="price-value" style={{ color: 'var(--color-secondary)' }}>${lofiSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}</span>
          </div>
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(currentAccount || demoMode) && (
            <div className="header-balance-container" style={{ display: 'flex', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Wallet size={14} style={{ color: 'var(--color-primary)', marginRight: '4px' }} />
                <span>{suiBalance} SUI</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '10px' }}>
                <span>{lofiBalance} LOFI</span>
              </div>
              {demoMode && (
                <span style={{ 
                  fontSize: '9px', 
                  color: 'var(--color-success)', 
                  fontWeight: '700', 
                  background: 'var(--color-success-glow)', 
                  border: '1px solid rgba(52,211,153,0.2)', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  letterSpacing: '0.05em',
                  marginLeft: '4px'
                }}>
                  SANDBOX
                </span>
              )}
            </div>
          )}
          
          <div className="sui-connect-btn-wrapper">
            <ConnectButton />
          </div>
          
          <button 
            type="button"
            className="mobile-header-btn"
            onClick={() => {
              setRightSidebarOpen(!rightSidebarOpen);
              setLeftSidebarOpen(false);
            }}
            title="Toggle Market & Portfolio"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      <div className="app-container">
      
      {/* LEFT PANEL: Settings & Faucet & Contract Configuration */}
      <div 
        className={`glass-panel sidebar-left ${leftSidebarOpen ? 'open' : ''}`} 
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}
      >
        {/* Mobile Close Button */}
        <div className="mobile-close-container" style={{ display: 'none', justifyContent: 'flex-end', marginBottom: '-10px' }}>
          <button 
            type="button"
            onClick={() => setLeftSidebarOpen(false)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glow)', paddingBottom: '12px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontSize: '18px' }}>
            <Settings size={18} className="text-muted" /> Settings & Assets
          </h3>
        </div>

        {/* Demo Mode Toggle */}
        <div style={{ 
          background: demoMode ? 'rgba(52, 211, 153, 0.05)' : 'rgba(255,255,255,0.02)', 
          padding: '12px 14px', 
          borderRadius: '12px', 
          border: demoMode ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.3s'
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: demoMode ? 'var(--color-success)' : '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className={demoMode ? 'animate-pulse-glow' : ''} style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: demoMode ? 'var(--color-success)' : 'var(--text-dim)' }}></span>
              Demo Mode Sandbox
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
              Simulate trades without wallet signatures.
            </div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={demoMode} 
              onChange={(e) => handleToggleDemoMode(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: demoMode ? 'var(--color-success)' : '#334155',
              transition: '0.3s',
              borderRadius: '20px'
            }}>
              <span style={{
                position: 'absolute',
                height: '14px', width: '14px',
                left: demoMode ? '19px' : '3px',
                bottom: '3px',
                backgroundColor: '#000',
                transition: '0.3s',
                borderRadius: '50%'
              }} />
            </span>
          </label>
        </div>

        {/* Slippage & Gas Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Slippage Tolerance</label>
              <span style={{ fontSize: '11px', color: 'var(--color-secondary)', fontWeight: '600' }}>{slippageTolerance}%</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {[0.5, 1.0, 2.0].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    handleSaveSlippage(val);
                    setCustomSlippage('');
                  }}
                  style={{
                    flex: 1,
                    background: slippageTolerance === val && !customSlippage ? 'var(--color-secondary-glow)' : 'rgba(0,0,0,0.3)',
                    border: slippageTolerance === val && !customSlippage ? '1px solid var(--color-secondary)' : '1px solid var(--border-glow)',
                    color: slippageTolerance === val && !customSlippage ? 'var(--color-secondary)' : 'var(--text-muted)',
                    padding: '6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                >
                  {val}%
                </button>
              ))}
              <input 
                type="number"
                placeholder="Cust"
                value={customSlippage}
                onChange={(e) => {
                  setCustomSlippage(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0 && v <= 50) {
                    handleSaveSlippage(v);
                  }
                }}
                style={{
                  width: '55px',
                  background: 'rgba(0,0,0,0.3)',
                  border: customSlippage ? '1px solid var(--color-secondary)' : '1px solid var(--border-glow)',
                  color: '#fff',
                  padding: '5px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  textAlign: 'center',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Gas Fee Cap</label>
              <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: '600' }}>{maxGasCap} SUI</span>
            </div>
            <input 
              type="range"
              min="0.01"
              max="0.5"
              step="0.01"
              value={maxGasCap}
              onChange={(e) => handleSaveMaxGas(parseFloat(e.target.value))}
              style={{
                width: '100%',
                accentColor: 'var(--color-primary)',
                background: 'rgba(255,255,255,0.1)',
                height: '4px',
                borderRadius: '2px',
                cursor: 'pointer'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-dim)', marginTop: '2px' }}>
              <span>0.01 SUI</span>
              <span>0.5 SUI</span>
            </div>
          </div>
        </div>

        {/* Mainnet Deposit & Bridge Guide */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h4 style={{ fontSize: '13px', margin: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
            <Layers size={14} /> Mainnet Funding Guide
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
            To trade on mainnet soon, prepare your wallet with SUI and LOFI:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11.5px', lineHeight: '1.4' }}>
            <div style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--color-secondary)', fontWeight: '700', marginRight: '6px' }}>1. Gas:</span>
              Get SUI from any exchange and transfer to your address for gas fees.
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--color-secondary)', fontWeight: '700', marginRight: '6px' }}>2. Bridge:</span>
              Bridge LOFI from Ethereum or Solana using <a href="https://portalbridge.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Portal Bridge</a> or <a href="https://cbridge.celer.network" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Celer Bridge</a>.
            </div>
          </div>
          
          {/* Active Network Indicator */}
          <div style={{ 
            marginTop: '4px',
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.05)',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ color: 'var(--text-dim)' }}>Connected Network:</span>
            {currentAccount ? (
              <span style={{ 
                color: 'var(--color-warning)',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-warning)' }} />
                Testnet (LOFI)
              </span>
            ) : demoMode ? (
              <span style={{ 
                color: 'var(--color-success)',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }} />
                Demo Sandbox
              </span>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>Not Connected</span>
            )}
          </div>
        </div>

        {/* Market Intelligence & Network Stats */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendingUp size={14} /> Market & Gas Stats
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Asset / Oracle:</span>
              <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>BTC / SVI Model</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Option Expiry:</span>
              <span style={{ color: 'var(--color-secondary)', fontWeight: '600' }}>Aug 2026 (78d)</span>
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Network Status:</span>
              <span style={{ color: 'var(--color-success)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block' }}></span>
                Healthy
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Live Network TPS:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{tps} tps</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Gas Price:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{gasPrice} MIST</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Est. Trade Cost:</span>
              <span style={{ color: 'var(--text-main)' }}>~0.005 SUI</span>
            </div>
          </div>
        </div>

        {/* Available Commands Reference */}
        <div style={{ 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid var(--border-glow)', 
          padding: '16px', 
          borderRadius: '12px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px',
          marginTop: 'auto'
        }}>
          <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} /> Available Commands
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px', lineHeight: '1.4' }}>
            <div>
              <strong style={{ color: 'var(--color-secondary)', display: 'block', marginBottom: '2px' }}>1. MINT CALL/PUT OPTION</strong>
              <code style={{ background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '4px', display: 'block', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                bet [amount] LOFI on BTC [above/below] [strike]
              </code>
            </div>
            <div>
              <strong style={{ color: 'var(--color-secondary)', display: 'block', marginBottom: '2px' }}>2. LP VAULT SUPPLY</strong>
              <code style={{ background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '4px', display: 'block', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                supply [amount] LOFI to vault
              </code>
            </div>
            <div>
              <strong style={{ color: 'var(--color-secondary)', display: 'block', marginBottom: '2px' }}>3. LP VAULT WITHDRAWAL (ONE-STEP)</strong>
              <code style={{ background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '4px', display: 'block', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                withdraw [amount] LP
              </code>
              <p style={{ color: 'var(--text-muted)', fontSize: '10px', margin: 0 }}>
                💡 <strong>No complex steps needed!</strong> You can type <em>"withdraw 10 LP"</em>, <em>"unstake 100 LOFI"</em>, or <em>"remove 100 liquidity"</em>. They all do the **exact same thing** in one single step: burn your LP shares and return your LOFI pocket money immediately.
              </p>
            </div>
            <div>
              <strong style={{ color: 'var(--color-secondary)', display: 'block', marginBottom: '2px' }}>4. REDEEM PAYOUTS</strong>
              <code style={{ background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '4px', display: 'block', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                redeem payouts
              </code>
            </div>
            <div>
              <strong style={{ color: 'var(--color-secondary)', display: 'block', marginBottom: '2px' }}>5. ACCOUNT SETUP</strong>
              <code style={{ background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '4px', display: 'block', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                create predict manager account
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER PANEL: Main Chat & Preview Execution Area */}
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: '16px', height: '100%', minHeight: 0 }}>
        
        {/* Backdrop overlay for mobile sidebars */}
        {(leftSidebarOpen || rightSidebarOpen) && (
          <div 
            onClick={() => {
              setLeftSidebarOpen(false);
              setRightSidebarOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 40
            }}
          />
        )}

        {/* Chat Log Panel Container */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: '8px' }}>
          
          <div 
            ref={chatContainerRef}
            className="glass-panel chat-log-container" 
            style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
          
          {/* Always show connect wallet banner if no wallet is connected and Demo Mode is disabled */}
          {!currentAccount && !demoMode && (
            <div 
              className="setup-banner"
              style={{ 
                background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.08), rgba(192, 132, 252, 0.08))', 
                border: '1px dashed rgba(129, 140, 248, 0.3)', 
                padding: '20px', 
                borderRadius: '16px', 
                display: 'flex', 
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '10px'
              }}
            >
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={18} /> Connect Wallet to Get Started
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
                  To trade options or supply liquidity on-chain, please connect your Sui wallet first. Alternatively, you can enable <strong>Demo Mode Sandbox</strong> in the left settings panel to run simulated transactions instantly without a wallet.
                </p>
              </div>
              <div className="setup-btn-wrapper" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <ConnectButton />
              </div>
            </div>
          )}

          {/* Always show account initialization banner if wallet is connected (or Demo Mode is active) but no manager ID is set */}
          {((currentAccount || demoMode) && !simulatedManagerId) && (
            <div 
              className="setup-banner"
              style={{ 
                background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.08), rgba(244, 63, 94, 0.08))', 
                border: '1px dashed rgba(129, 140, 248, 0.3)', 
                padding: '20px', 
                borderRadius: '16px', 
                display: 'flex', 
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '10px'
              }}
            >
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={18} /> Setup Predict Manager Account {demoMode && '(Demo Mode)'}
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.5' }}>
                  Your {demoMode ? 'Demo Sandbox' : 'wallet'} is active, but no <strong>Predict Manager</strong> account ID is set. You must create {demoMode ? 'a simulated' : 'an on-chain'} account to track and settle your trades.
                </p>
              </div>
              <div className="setup-btn-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                <button
                  onClick={handleCreateManager}
                  disabled={createAccountLoading}
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                    border: 'none',
                    color: '#fff',
                    fontWeight: '600',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    boxShadow: '0 4px 12px rgba(129, 140, 248, 0.3)'
                  }}
                >
                  {createAccountLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-pulse-glow" style={{ animation: 'spin 1.5s linear infinite' }} />
                      {demoMode ? 'Simulating Creation...' : 'Creating Account...'}
                    </>
                  ) : (
                    <>
                      <PlusCircle size={14} /> {demoMode ? 'Simulate Predict Manager Account' : 'Create Predict Manager Account'}
                    </>
                  )}
                </button>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  Costs {demoMode ? '0 SUI (Simulated)' : '~0.005 SUI in network gas fees'}.
                </span>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isReplyExecuted = messages.find(m => m.parentMessageId === msg.id)?.executed;
            return (
              <div 
                key={msg.id} 
                className="animate-slide-in"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  gap: '6px',
                  width: '100%',
                  boxSizing: 'border-box',
                  marginBottom: '16px'
                }}
              >
                {/* Header Row containing the avatar/icon and name */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                  padding: '0 4px',
                  marginBottom: '2px'
                }}>
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    borderRadius: '6px', 
                    background: msg.sender === 'user' 
                      ? 'var(--color-secondary-glow)' 
                      : msg.isSystemNotification 
                        ? (msg.text.includes('WON') ? 'var(--color-success-glow)' : msg.text.includes('Lost') ? 'var(--color-error-glow)' : 'var(--color-warning-glow)')
                        : 'var(--color-primary-glow)', 
                    border: msg.sender === 'user' 
                      ? '1px solid var(--color-secondary)' 
                      : msg.isSystemNotification
                        ? (msg.text.includes('WON') ? '1px solid var(--color-success)' : msg.text.includes('Lost') ? '1px solid var(--color-error)' : '1px solid var(--color-warning)')
                        : '1px solid var(--color-primary)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    {msg.sender === 'user' ? (
                      <User size={12} style={{ color: 'var(--color-secondary)' }} />
                    ) : msg.isSystemNotification ? (
                      msg.text.includes('WON') ? (
                        <CheckCircle size={12} style={{ color: 'var(--color-success)' }} />
                      ) : msg.text.includes('Lost') ? (
                        <X size={12} style={{ color: 'var(--color-error)' }} />
                      ) : (
                        <Bell size={12} style={{ color: 'var(--color-warning)' }} />
                      )
                    ) : (
                      <Cpu size={12} style={{ color: 'var(--color-primary)' }} />
                    )}
                  </div>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: '600', 
                    color: msg.sender === 'user' 
                      ? 'var(--color-secondary)' 
                      : msg.isSystemNotification
                        ? (msg.text.includes('WON') ? 'var(--color-success)' : msg.text.includes('Lost') ? 'var(--color-error)' : 'var(--color-warning)')
                        : 'var(--color-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {msg.sender === 'user' 
                      ? 'You' 
                      : msg.isSystemNotification
                        ? (msg.text.includes('WON') ? 'Market Win Alert' : msg.text.includes('Lost') ? 'Market Settlement Alert' : 'System Notification')
                        : 'Guardian AI Agent'}
                  </span>
                </div>
                
                <div 
                  className="chat-bubble"
                  style={{
                    background: msg.sender === 'user' 
                      ? 'var(--color-primary-glow)' 
                      : msg.isSystemNotification
                        ? (msg.text.includes('WON') ? 'rgba(52, 211, 153, 0.04)' : msg.text.includes('Lost') ? 'rgba(248, 113, 113, 0.04)' : 'rgba(251, 191, 36, 0.04)')
                        : 'rgba(255, 255, 255, 0.03)',
                    border: msg.sender === 'user' 
                      ? '1px solid rgba(129, 140, 248, 0.3)' 
                      : msg.isSystemNotification
                        ? (msg.text.includes('WON') ? '1px solid rgba(52, 211, 153, 0.2)' : msg.text.includes('Lost') ? '1px solid rgba(248, 113, 113, 0.2)' : '1px solid rgba(251, 191, 36, 0.2)')
                        : '1px solid rgba(255, 255, 255, 0.05)',
                    padding: '14px 16px',
                    borderRadius: msg.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    maxWidth: msg.sender === 'user' ? '85%' : '100%',
                    width: msg.sender === 'user' ? 'auto' : '100%',
                    boxSizing: 'border-box',
                    whiteSpace: 'pre-line',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: 'var(--text-main)'
                  }}
                >
                  {editingMessageId === msg.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid var(--color-primary)',
                          color: '#fff',
                          padding: '8px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontFamily: 'var(--font-sans)',
                          resize: 'none',
                          outline: 'none'
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessageId(null);
                            setEditingText('');
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: 'var(--text-muted)',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditMessage(msg.id, editingText)}
                          style={{
                            background: 'var(--color-primary)',
                            border: 'none',
                            color: '#000',
                            fontWeight: '600',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div>{formatMessageText(msg.text)}</div>
                      
                      {msg.showSupportButton && (
                        <div style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenSupportWithContext(msg.text)}
                            className="support-pulse-btn"
                            style={{
                              padding: '8px 14px',
                              background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                              border: 'none',
                              color: '#fff',
                              fontWeight: '600',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              boxShadow: '0 4px 10px rgba(168, 85, 247, 0.25)',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Headphones size={13} />
                            Contact Live Support
                          </button>
                        </div>
                      )}
                      
                      {msg.sender === 'user' && !isReplyExecuted && (
                        <div 
                          className="edit-button-container"
                          style={{ 
                            marginTop: '6px',
                            display: 'flex',
                            justifyContent: 'flex-end'
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingText(msg.text);
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--text-muted)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                {msg.sender === 'agent' && msg.text.includes("requires a Predict Manager account") && (
                  <div style={{ marginTop: '16px' }}>
                    <button
                      onClick={handleCreateManager}
                      disabled={createAccountLoading}
                      className="inline-setup-btn"
                      style={{
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                        border: 'none',
                        color: '#fff',
                        fontWeight: '600',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px'
                      }}
                    >
                      {createAccountLoading ? (
                        <>
                          <RefreshCw size={14} className="animate-pulse-glow" style={{ animation: 'spin 1.5s linear infinite' }} />
                          Creating Account...
                        </>
                      ) : (
                        <>
                          <PlusCircle size={14} /> Create Predict Manager Account
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Show Transaction Details and Sign Actions embedded in message if present */}
                {msg.ptb && msg.guardian && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px', boxSizing: 'border-box' }}>
                    {msg.intent && (msg.intent.action === 'mint' || msg.intent.action === 'supply' || msg.intent.action === 'withdraw') && (
                      <div style={{
                        background: 'rgba(129, 140, 248, 0.05)',
                        border: '1px solid rgba(129, 140, 248, 0.15)',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        fontSize: '12px',
                        lineHeight: '1.4',
                        boxSizing: 'border-box'
                      }}>
                        <h5 style={{ margin: '0 0 8px 0', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700' }}>
                          <TrendingUp size={14} /> Returns & Timeframe Details
                        </h5>
                        {msg.intent.action === 'mint' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div>• <strong>Est. Return:</strong> ~85% net return if BTC remains {msg.intent.direction === 'above' ? '📈 ABOVE' : '📉 BELOW'} ${msg.intent.strike?.toLocaleString()}.</div>
                            <div>• <strong>Est. Winnings:</strong> <strong style={{ color: 'var(--color-success)' }}>+{(msg.intent.amount * 0.85).toFixed(2)} {msg.intent.wagerAsset || 'LOFI'}</strong> (Wager: {msg.intent.amount} {msg.intent.wagerAsset || 'LOFI'}).</div>
                            <div>• <strong>Duration:</strong> 1-hour rolling contract. Auto-settled.</div>
                            <div style={{ color: 'var(--color-error)', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                              ⚠️ Options cannot be cancelled once signed.
                            </div>
                            {msg.intent.strike && (
                              (() => {
                                const diffPct = (Math.abs(msg.intent.strike - spotPrice) / spotPrice) * 100;
                                let riskLabel = 'Safe / Balanced';
                                let riskColor = 'var(--color-success)';
                                let riskBg = 'var(--color-success-glow)';
                                let riskBorder = 'rgba(52, 211, 153, 0.2)';
                                let riskDesc = 'Strike is very close to current spot. Balanced premium, high probability of execution close.';
                                
                                if (diffPct > 5.0) {
                                  riskLabel = 'High Risk / Degen';
                                  riskColor = 'var(--color-error)';
                                  riskBg = 'var(--color-error-glow)';
                                  riskBorder = 'rgba(248, 113, 113, 0.2)';
                                  riskDesc = 'Strike is very far from spot. Low probability of winning, but high delta sensitivity.';
                                } else if (diffPct > 1.5) {
                                  riskLabel = 'Moderate Risk';
                                  riskColor = 'var(--color-warning)';
                                  riskBg = 'var(--color-warning-glow)';
                                  riskBorder = 'rgba(251, 191, 36, 0.2)';
                                  riskDesc = 'Strike is moderately far from spot. Balanced risk/reward profile.';
                                }
                                
                                return (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: riskBg,
                                    border: `1px solid ${riskBorder}`,
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    marginTop: '10px',
                                    gap: '8px'
                                  }}>
                                    <div>
                                      <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.8)', fontWeight: '600' }}>Risk Profile:</span>
                                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', lineHeight: '1.3' }}>{riskDesc}</div>
                                    </div>
                                    <span style={{
                                      fontSize: '10px',
                                      fontWeight: '700',
                                      color: riskColor,
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      background: 'rgba(0, 0, 0, 0.3)',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {riskLabel}
                                    </span>
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        ) : msg.intent.action === 'supply' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div>• <strong>Est. Yield:</strong> ~12-18% APR from option mint fees.</div>
                            <div>• <strong>Lockup:</strong> None. Withdraw capital instantly.</div>
                            <div>• <strong>Mechanism:</strong> Supply {msg.intent.wagerAsset || 'LOFI'} to receive PLP shares.</div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div>• <strong>Action:</strong> Unstaking LP shares to withdraw capital.</div>
                            <div>• <strong>LP Shares:</strong> Burning {msg.intent.amount} LP shares.</div>
                            <div>• <strong>Duration:</strong> Single-step. Executes instantly.</div>
                          </div>
                        )}
                      </div>
                    )}

                    <h4 style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-secondary)', marginBottom: '8px' }}>
                      <Layers size={14} /> Compiled PTB Preview
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                      {msg.ptb.steps.map(step => (
                        <div key={step.index} style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--color-secondary)', fontSize: '12px', boxSizing: 'border-box' }}>
                          <strong>Step {step.index}: {step.action}</strong>
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>{step.details}</div>
                        </div>
                      ))}
                    </div>

                    <h4 style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', marginBottom: '8px' }}>
                      <ShieldCheck size={14} /> Guardian Security Assessment
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                      {msg.guardian.warnings.map((warn, i) => (
                        <div 
                          key={i} 
                          style={{ 
                            background: warn.type === 'error' ? 'var(--color-error-glow)' : warn.type === 'warning' ? 'var(--color-warning-glow)' : 'rgba(255,255,255,0.02)', 
                            border: warn.type === 'error' ? '1px solid rgba(248,113,113,0.2)' : warn.type === 'warning' ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(255,255,255,0.05)', 
                            padding: '8px 12px', 
                            borderRadius: '6px',
                            display: 'flex',
                            gap: '8px',
                            fontSize: '12px',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                        >
                          {warn.type === 'error' ? (
                            <X size={16} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: '2px' }} />
                          ) : warn.type === 'warning' ? (
                            <AlertTriangle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                          ) : (
                            <Info size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: '2px' }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong>{warn.message}</strong>
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>{warn.details}</div>
                            {warn.recommendations && warn.recommendations.length > 0 && (
                              <div style={{ marginTop: '10px' }}>
                                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: '600', marginBottom: '6px' }}>
                                  💡 Recommended mintable options to try instead:
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {warn.recommendations.map((rec, rIdx) => (
                                    <div 
                                      key={rIdx} 
                                      style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column',
                                        gap: '6px',
                                        background: 'rgba(0, 0, 0, 0.25)', 
                                        padding: '8px 10px', 
                                        borderRadius: '6px',
                                        border: '1px solid rgba(255, 255, 255, 0.05)'
                                      }}
                                    >
                                      <div style={{ fontSize: '11px', color: 'var(--color-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                        {rec}
                                      </div>
                                      <button
                                        onClick={() => executeCommandText(rec)}
                                        style={{
                                          alignSelf: 'flex-start',
                                          background: 'rgba(129, 140, 248, 0.15)',
                                          border: '1px solid rgba(129, 140, 248, 0.3)',
                                          color: 'var(--color-secondary)',
                                          padding: '4px 8px',
                                          borderRadius: '4px',
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = 'rgba(129, 140, 248, 0.25)';
                                          e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = 'rgba(129, 140, 248, 0.15)';
                                          e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.3)';
                                        }}
                                      >
                                        👉 Click to Autofill & Run
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                      {/* Action Execution Button */}
                    {!msg.executed ? (() => {
                      const isRedeem = msg.intent?.action === 'redeem';
                      const oracleExp = (msg.intent as any)?.oracleExpiry;
                      const oracleSvi = (msg.intent as any)?.oracleSviId;
                      const isRealOracleSettled = isRedeem 
                        ? ((demoMode || !oracleSvi) ? (oracleExp ? Date.now() > oracleExp : true) : (settledOracles[normalizeSuiAddress(oracleSvi)] === true))
                        : true;
                      const isButtonDisabled = executionLoading || !msg.guardian.passed;

                      return (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {!isRealOracleSettled && oracleExp && (
                            <div style={{ 
                              background: 'rgba(245, 158, 11, 0.08)', 
                              border: '1px solid rgba(245, 158, 11, 0.2)', 
                              borderRadius: '8px', 
                              padding: '10px 12px', 
                              fontSize: '11px',
                              lineHeight: '1.4',
                              color: 'var(--text-muted)'
                            }}>
                              <span style={{ color: '#f59e0b', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                <AlertTriangle size={12} style={{ color: '#f59e0b' }} /> On-Chain Settlement Pending
                              </span>
                              The prediction is complete, but the underlying testnet oracle SVI does not settle until <strong>{new Date(oracleExp).toLocaleTimeString()}</strong>. You can redeem your winnings once the oracle is settled on-chain.
                            </div>
                          )}
                          {currentAccount || demoMode ? (
                            <button
                              onClick={() => {
                                handleExecutePTB(msg);
                              }}
                              disabled={isButtonDisabled}
                              className={msg.guardian.passed && !executionLoading ? "button-pulse" : ""}
                              style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                background: isButtonDisabled
                                  ? 'rgba(255,255,255,0.06)'
                                  : msg.guardian.passed 
                                    ? (isRealOracleSettled
                                      ? 'linear-gradient(135deg, var(--color-success), #10b981)' 
                                      : 'linear-gradient(135deg, #f59e0b, #d97706)')
                                    : 'rgba(255,255,255,0.1)',
                                border: !isRealOracleSettled ? '1px solid rgba(245, 158, 11, 0.3)' : 'none',
                                color: msg.guardian.passed ? '#000' : 'var(--text-dim)',
                                fontWeight: '700',
                                cursor: msg.guardian.passed && !executionLoading ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontSize: '14px',
                                boxShadow: msg.guardian.passed && !executionLoading
                                  ? (isRealOracleSettled ? '0 4px 15px rgba(52, 211, 153, 0.2)' : '0 4px 15px rgba(245, 158, 11, 0.2)')
                                  : 'none',
                                boxSizing: 'border-box',
                                opacity: isButtonDisabled ? 0.75 : 1
                              }}
                            >
                              {executionLoading ? (
                                <>
                                  <RefreshCw size={16} className="animate-pulse-glow" style={{ animation: 'spin 1.5s linear infinite' }} />
                                  {demoMode ? 'Simulating Transaction...' : 'Signing & Submitting to Sui...'}
                                </>
                              ) : (
                                <>
                                  {!isRealOracleSettled ? (
                                    <>
                                      <Play size={16} /> {isRedeem ? '⏳ Force Redeem (Oracle Unsettled)' : '⏳ Force Execute (Oracle Unsettled)'}
                                    </>
                                  ) : isRedeem ? (
                                    <>
                                      <Play size={16} /> {demoMode ? '💰 Run Demo Redemption (No Wallet Required)' : '💰 Sign & Redeem Payout'}
                                    </>
                                  ) : (
                                    <>
                                      <Play size={16} /> {demoMode ? 'Run Demo Simulation (No Wallet Required)' : 'Approve & Sign Transaction Block'}
                                    </>
                                  )}
                                </>
                              )}
                            </button>
                          ) : (
                            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)', fontSize: '13px', color: 'var(--text-muted)' }}>
                              Connect your wallet at the top right to execute this transaction block.
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', background: 'var(--color-success-glow)', border: '1px solid rgba(52, 211, 153, 0.2)', padding: '10px', borderRadius: '8px', fontSize: '13px' }}>
                        <CheckCircle size={16} />
                        <span>{msg.intent?.action === 'redeem' ? 'Payout successfully redeemed to your wallet!' : 'Transaction Executed successfully on Sui Testnet!'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}
          <div />
        </div>
      </div>

        {/* Input & Hotkeys Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Quick Action Hotkeys */}
          <div className="hotkeys-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0 4px' }}>
            <button
              type="button"
              onClick={() => executeCommandText("bet 100 LOFI on BTC above 70000")}
              disabled={isProcessing}
              style={{
                background: 'rgba(52, 211, 153, 0.05)',
                border: '1px solid rgba(52, 211, 153, 0.2)',
                color: 'var(--color-success)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                opacity: isProcessing ? 0.6 : 1
              }}
              className="hotkey-pill"
            >
              📈 Bet 100 LOFI Above 70k
            </button>
            <button
              type="button"
              onClick={() => executeCommandText("bet 100 LOFI on BTC below 65000")}
              disabled={isProcessing}
              style={{
                background: 'rgba(248, 113, 113, 0.05)',
                border: '1px solid rgba(248, 113, 113, 0.2)',
                color: 'var(--color-error)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                opacity: isProcessing ? 0.6 : 1
              }}
              className="hotkey-pill"
            >
              📉 Bet 100 LOFI Below 65k
            </button>
            <button
              type="button"
              onClick={() => executeCommandText("supply 100 LOFI to vault")}
              disabled={isProcessing}
              style={{
                background: 'rgba(192, 132, 252, 0.05)',
                border: '1px solid rgba(192, 132, 252, 0.2)',
                color: 'var(--color-secondary)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                opacity: isProcessing ? 0.6 : 1
              }}
              className="hotkey-pill"
            >
              💧 Supply 100 LOFI to Vault
            </button>
            <button
              type="button"
              onClick={() => executeCommandText("withdraw 50 LP")}
              disabled={isProcessing}
              style={{
                background: 'rgba(192, 132, 252, 0.05)',
                border: '1px solid rgba(192, 132, 252, 0.2)',
                color: 'var(--color-secondary)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                opacity: isProcessing ? 0.6 : 1
              }}
              className="hotkey-pill"
            >
              🚪 Withdraw 50 LP
            </button>
            <button
              type="button"
              onClick={() => executeCommandText("redeem payouts")}
              disabled={isProcessing}
              style={{
                background: 'rgba(129, 140, 248, 0.05)',
                border: '1px solid rgba(129, 140, 248, 0.2)',
                color: 'var(--color-primary)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                opacity: isProcessing ? 0.6 : 1
              }}
              className="hotkey-pill"
            >
              💰 Redeem Payouts
            </button>
          </div>

          {/* Text Input Panel */}
          <form onSubmit={handleSendMessage} className="glass-panel" style={{ padding: '12px', display: 'flex', gap: '10px', alignItems: 'center', margin: 0 }}>
            <input 
              type="text" 
              placeholder="Type your trading intent (e.g., 'bet 100 LOFI on BTC above 70000')..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isProcessing}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '14px',
                padding: '8px 12px'
              }}
            />
            <button
              type="button"
              onClick={handleToggleListening}
              disabled={isProcessing}
              title={isListening ? "Listening... click to stop" : "Start voice note recording"}
              style={{
                background: isListening ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255,255,255,0.05)',
                border: isListening ? '1px solid var(--color-error)' : 'none',
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isProcessing ? 'default' : 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              className={isListening ? "animate-pulse-glow" : ""}
            >
              <Mic size={16} style={{ color: isListening ? 'var(--color-error)' : 'var(--text-muted)' }} />
              {isListening && (
                <span style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--color-error)'
                }} />
              )}
            </button>
            <button 
              type="submit" 
              disabled={!inputValue.trim() || isProcessing}
              style={{
                background: inputValue.trim() && !isProcessing ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                border: 'none',
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: inputValue.trim() && !isProcessing ? 'pointer' : 'default',
                transition: 'all 0.2s'
              }}
            >
              <Send size={16} style={{ color: inputValue.trim() && !isProcessing ? '#000' : 'var(--text-dim)' }} />
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT PANEL: Live Markets & Portfolio Tracking */}
      <div 
        className={`glass-panel sidebar-right ${rightSidebarOpen ? 'open' : ''}`} 
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}
      >
        {/* Mobile Close Button */}
        <div className="mobile-close-container" style={{ display: 'none', justifyContent: 'flex-end', marginBottom: '-10px' }}>
          <button 
            type="button"
            onClick={() => setRightSidebarOpen(false)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Market Monitor */}
        <div>
          <h3 style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Monitor</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>BTC Spot Index</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>${spotPrice.toLocaleString()}</span>
                <span style={{ fontSize: '12px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <TrendingUp size={14} /> Live
                </span>
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ETH Spot Index</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>${ethSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span style={{ fontSize: '12px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <TrendingUp size={14} /> Live
                </span>
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>LOFI Spot Index</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--color-secondary)' }}>${lofiSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })}</span>
                <span style={{ fontSize: '12px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <TrendingUp size={14} style={{ color: 'var(--color-secondary)' }} /> Live
                </span>
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Implied Volatility (ATM IV)</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>{activeIV}%</span>
                <span style={{ fontSize: '12px', color: 'var(--color-secondary)' }}>SVI Curve</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs navigation for Portfolio vs Profile & History */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
          <button 
            type="button"
            onClick={() => setRightTab('portfolio')} 
            style={{
              flex: 1,
              padding: '8px 12px',
              background: rightTab === 'portfolio' ? 'var(--color-primary-glow)' : 'transparent',
              border: '1px solid',
              borderColor: rightTab === 'portfolio' ? 'var(--color-primary)' : 'transparent',
              borderRadius: '8px',
              color: rightTab === 'portfolio' ? 'var(--color-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Portfolio
          </button>
          <button 
            type="button"
            onClick={() => setRightTab('profile')} 
            style={{
              flex: 1,
              padding: '8px 12px',
              background: rightTab === 'profile' ? 'var(--color-primary-glow)' : 'transparent',
              border: '1px solid',
              borderColor: rightTab === 'profile' ? 'var(--color-primary)' : 'transparent',
              borderRadius: '8px',
              color: rightTab === 'profile' ? 'var(--color-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Profile & History
          </button>
        </div>

        {rightTab === 'portfolio' ? (
          <>
            {/* Portfolio Positions */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>My Active Positions</h3>
                <div style={{ position: 'relative' }}>
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowHistoryPopup(true);
                      // Mark all settled/redeemed bets as seen
                      const currentIds = positions.filter(p => p.status === 'Settled (Won)' || p.status === 'Settled (Lost)' || p.status === 'Settled (Redeemed)' || p.status === 'Settled (Withdrawn)').map(p => p.id);
                      const newSeen = Array.from(new Set([...seenHistoryIds, ...currentIds]));
                      setSeenHistoryIds(newSeen);
                      const key = currentAccount?.address ? currentAccount.address : (demoMode ? 'demo' : 'default');
                      localStorage.setItem(`predict_seen_history_ids_${key}`, JSON.stringify(newSeen));
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      padding: '6px',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                    title="Settled & Redeemed Bets History"
                  >
                    <History size={16} />
                  </button>
                  {positions.filter(p => (p.status === 'Settled (Won)' || p.status === 'Settled (Lost)' || p.status === 'Settled (Redeemed)' || p.status === 'Settled (Withdrawn)') && !seenHistoryIds.includes(p.id)).length > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-5px',
                      right: '-5px',
                      background: 'var(--color-error)',
                      color: '#fff',
                      borderRadius: '50%',
                      padding: '2px 5px',
                      fontSize: '9px',
                      fontWeight: '700',
                      lineHeight: 1,
                      border: '1px solid #000',
                      pointerEvents: 'none'
                    }}>
                      {positions.filter(p => (p.status === 'Settled (Won)' || p.status === 'Settled (Lost)' || p.status === 'Settled (Redeemed)' || p.status === 'Settled (Withdrawn)') && !seenHistoryIds.includes(p.id)).length}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {positions.filter(p => p.status === 'Active').length === 0 ? (
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    fontStyle: 'italic',
                    textAlign: 'center',
                    padding: '24px 12px',
                    background: 'rgba(255,255,255,0.01)',
                    borderRadius: '10px',
                    border: '1px dashed rgba(255,255,255,0.05)'
                  }}>
                    No active positions found. Mint an option or supply LP to get started!
                  </div>
                ) : (
                  positions.filter(p => p.status === 'Active').map(pos => (
                    <div 
                      key={pos.id} 
                      onClick={() => {
                        if (pos.status !== 'Settled (Withdrawn)') {
                          setSelectedPosition(pos);
                        }
                      }}
                      className="position-card"
                      style={{ 
                        background: 'rgba(255,255,255,0.02)', 
                        padding: '12px', 
                        borderRadius: '10px', 
                        border: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: pos.status !== 'Settled (Withdrawn)' ? 'pointer' : 'default',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span 
                            style={{ 
                              fontSize: '11px', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              fontWeight: '700',
                              background: pos.type === 'Call' ? 'rgba(52, 211, 153, 0.15)' : pos.type === 'Put' ? 'rgba(248, 113, 113, 0.15)' : 'rgba(192, 132, 252, 0.15)',
                              color: pos.type === 'Call' ? 'var(--color-success)' : pos.type === 'Put' ? 'var(--color-error)' : 'var(--color-secondary)'
                            }}
                          >
                            {pos.type}
                          </span>
                          {pos.strike && (
                            <span style={{ fontSize: '13px', fontWeight: '500' }}>{pos.asset || 'BTC'} @ ${pos.strike.toLocaleString()}</span>
                          )}
                          {!pos.strike && (
                            <span style={{ fontSize: '13px', fontWeight: '500' }}>LP Vault Supply</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div>Size: {pos.amount} {pos.wagerAsset || 'LOFI'}</div>
                          {pos.expiryTime && pos.status === 'Active' && (
                            <div style={{ color: 'var(--color-secondary)', fontWeight: '500' }}>
                              Expires in: {getRemainingTimeText(pos.expiryTime)}
                            </div>
                          )}
                          {pos.expiryTime && !isNaN(new Date(pos.expiryTime).getTime()) && (
                            <div>
                              Settle: {new Date(pos.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div 
                        style={{ 
                          fontSize: '12px', 
                          fontWeight: '600',
                          color: getDynamicStatus(pos) === 'Settled (Won - Pending)'
                            ? '#f59e0b'
                            : (getDynamicStatus(pos).includes('Won') || getDynamicStatus(pos).includes('Redeemed')) ? 'var(--color-success)' : getDynamicStatus(pos).includes('Lost') ? 'var(--color-error)' : 'var(--color-primary)' 
                        }}
                      >
                        {getDynamicStatus(pos) === 'Settled (Won - Pending)' ? 'WON (PENDING SETTLEMENT)' : getDynamicStatus(pos)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Platform FAQ */}
            <div style={{ marginTop: '12px' }}>
              <h3 style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform FAQ</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {faqData.map((faq, index) => {
                  const isOpen = openFaq === index;
                  return (
                    <div 
                      key={index} 
                      style={{ 
                        background: 'rgba(255,255,255,0.01)', 
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        transition: 'all 0.2s'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : index)}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          color: isOpen ? 'var(--color-primary)' : 'var(--text-main)',
                          padding: '10px 12px',
                          textAlign: 'left',
                          fontWeight: '600',
                          fontSize: '12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          gap: '8px'
                        }}
                      >
                        <span>{faq.q}</span>
                        <span style={{ 
                          fontSize: '10px', 
                          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          color: 'var(--text-muted)'
                        }}>
                          ▶
                        </span>
                      </button>
                      
                      {isOpen && (
                        <div style={{ 
                          padding: '0 12px 12px 12px', 
                          fontSize: '11px', 
                          color: 'var(--text-muted)', 
                          lineHeight: '1.4',
                          borderTop: '1px solid rgba(255,255,255,0.02)',
                          paddingTop: '8px'
                        }}>
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glow)', padding: '16px', borderRadius: '12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wallet size={16} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>Wallet Assets</span>
                </div>
                {demoMode && (
                  <span style={{ 
                    fontSize: '9px', 
                    background: 'rgba(239, 68, 68, 0.2)', 
                    border: '1px solid rgba(239, 68, 68, 0.4)', 
                    color: '#f87171', 
                    padding: '1px 6px', 
                    borderRadius: '8px', 
                    fontWeight: '800', 
                    fontFamily: 'var(--font-mono)' 
                  }}>DEMO</span>
                )}
              </div>
              
              {(currentAccount || demoMode) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>SUI:</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{suiBalance}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>LOFI:</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--color-secondary)' }}>{lofiBalance}</span>
                  </div>
                  {currentAccount && (
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'center', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentAccount.address}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
                  Wallet not connected
                </div>
              )}

              <div style={{ margin: '12px 0 8px 0', borderTop: '1px dashed rgba(255,255,255,0.08)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(147, 51, 234, 0.05)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(147, 51, 234, 0.15)' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-secondary)', fontWeight: '600' }}>LP Vault Balance:</span>
                <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--color-secondary)' }}>{vaultBalance} LOFI</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '100%' }}>
            {/* Account Profile Card */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
              <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={14} /> Account Profile
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Wallet Address:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }} title={currentAccount?.address || 'Not Connected'}>
                    {currentAccount ? `${currentAccount.address.substring(0, 6)}...${currentAccount.address.slice(-4)}` : 'Not Connected'}
                  </span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SUI Balance:</span>
                  <span style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{currentAccount || demoMode ? `${suiBalance} SUI` : '0.00 SUI'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>LOFI Balance:</span>
                  <span style={{ fontWeight: '700', color: 'var(--color-secondary)' }}>{currentAccount || demoMode ? `${lofiBalance} LOFI` : '0.00 LOFI'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>LP Vault Balance:</span>
                  <span style={{ fontWeight: '700', color: 'var(--color-secondary)' }}>{vaultBalance} LOFI</span>
                </div>

                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Predict Manager:</span>
                  {simulatedManagerId ? (
                    <span 
                      style={{ 
                        fontFamily: 'var(--font-mono)', 
                        color: 'var(--color-success)', 
                        background: 'var(--color-success-glow)', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        fontSize: '11px'
                      }} 
                      title={simulatedManagerId}
                    >
                      {simulatedManagerId.substring(0, 6)}...{simulatedManagerId.slice(-4)}
                    </span>
                  ) : (
                    <span 
                      style={{ 
                        color: 'var(--color-error)', 
                        background: 'var(--color-error-glow)', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}
                    >
                      Not Found
                    </span>
                  )}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Oracle SVI:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }} title={oracleSviId}>
                    {oracleSviId.substring(0, 6)}...{oracleSviId.slice(-4)}
                  </span>
                </div>
              </div>
            </div>

            {/* Advanced Configuration Collapsible Accordion */}
            <div style={{ background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.03)',
                  border: 'none',
                  color: 'var(--text-main)',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Settings size={14} className="text-muted" /> Advanced Configuration
                </span>
                <span style={{ transition: 'transform 0.2s', transform: showAdvancedConfig ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '10px' }}>
                  ▶
                </span>
              </button>
              
              {showAdvancedConfig && (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Predict Object ID</label>
                    <input 
                      type="text" 
                      value={predictId}
                      onChange={(e) => setPredictId(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-glow)',
                        color: 'var(--text-muted)',
                        padding: '8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Volatility Oracle (OracleSVI) ID</label>
                    <input 
                      type="text" 
                      value={oracleSviId}
                      onChange={(e) => setOracleSviId(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-glow)',
                        color: 'var(--text-muted)',
                        padding: '8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  {(currentAccount || demoMode) && (
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Predict Manager Account ID</label>
                      <input 
                        type="text" 
                        value={simulatedManagerId}
                        placeholder="Leave empty to auto-create..."
                        onChange={(e) => setSimulatedManagerId(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid var(--border-glow)',
                          color: 'var(--text-muted)',
                          padding: '8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)'
                        }}
                      />
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h5 style={{ fontSize: '12px', color: 'var(--color-primary)', marginBottom: '4px', marginTop: 0, fontWeight: '700' }}>Developer API Settings</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Gemini API Key (Optional)</label>
                      <input 
                        type="password" 
                        placeholder="Paste Gemini API Key..." 
                        value={apiKey}
                        onChange={(e) => handleSaveApiKey(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid var(--border-glow)',
                          color: '#fff',
                          padding: '9px 12px',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                      />
                      <span style={{ fontSize: '9px', color: 'var(--text-dim)', display: 'block', lineHeight: '1.3' }}>
                        Enables natural-language command parsing using Gemini. Stored locally in your browser.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Command History */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '200px', flexShrink: 0 }}>
              <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={14} /> Command History
              </h4>
              
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px' }}>
                {commandHistory.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                    No commands typed yet
                  </div>
                ) : (
                  commandHistory.map(item => (
                    <div 
                      key={item.id} 
                      style={{ 
                        background: 'rgba(0,0,0,0.15)', 
                        padding: '10px', 
                        borderRadius: '8px', 
                        border: '1px solid rgba(255,255,255,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span 
                          style={{ 
                            fontSize: '10px', 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            fontWeight: '600',
                            background: item.status === 'success' ? 'var(--color-success-glow)' : item.status === 'failed' ? 'var(--color-error-glow)' : 'rgba(129, 140, 248, 0.1)',
                            color: item.status === 'success' ? 'var(--color-success)' : item.status === 'failed' ? 'var(--color-error)' : 'var(--color-primary)'
                          }}
                        >
                          {item.status.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'right' }}>
                          {item.timestamp && !isNaN(new Date(item.timestamp).getTime()) ? (
                            new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + 
                            new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          ) : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginTop: '2px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                            "{item.text}"
                          </span>
                          {item.action === 'mint' && item.status === 'success' && item.expiryTime && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                              <div style={{ color: 'var(--color-secondary)', fontWeight: '500' }}>
                                Expires in: {getRemainingTimeText(item.expiryTime)}
                              </div>
                              <div>
                                Settles: {item.expiryTime && !isNaN(new Date(item.expiryTime).getTime()) ? (
                                  new Date(item.expiryTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
                                  new Date(item.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                ) : ''}
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => executeCommandText(item.text)}
                          disabled={isProcessing}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-primary)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: isProcessing ? 0.5 : 1,
                            transition: 'opacity 0.2s',
                            marginTop: '2px'
                          }}
                          title="Replay Command"
                        >
                          <RefreshCw size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>

      {selectedPosition && (
        <div 
          className="modal-overlay"
          onClick={() => setSelectedPosition(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}
        >
          <div 
            className="glass-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'rgba(13, 20, 38, 0.95)',
              border: '1px solid var(--color-primary)',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              position: 'relative'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedPosition.type === 'LP' ? (
                  <>💧 LP Vault Supply Details</>
                ) : (
                  <>📈 {selectedPosition.asset || 'BTC'} {selectedPosition.type} Option Details</>
                )}
              </h3>
              <button 
                onClick={() => setSelectedPosition(null)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-muted)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  padding: 0
                }}
                className="close-btn"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
              {selectedPosition.type !== 'LP' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Asset / Option:</span>
                    <span style={{ fontWeight: '600' }}>{selectedPosition.asset || 'BTC'}-{selectedPosition.wagerAsset || 'SUI'} Option</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Direction:</span>
                    <span style={{ fontWeight: '600', color: selectedPosition.type === 'Call' ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {selectedPosition.type === 'Call' ? '📈 Above Strike' : '📉 Below Strike'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Strike Price:</span>
                    <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>${selectedPosition.strike?.toLocaleString(undefined, { minimumFractionDigits: (selectedPosition.asset || '').toUpperCase() === 'LOFI' ? 5 : 2, maximumFractionDigits: (selectedPosition.asset || '').toUpperCase() === 'LOFI' ? 5 : 2 })} USD</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Wager Amount:</span>
                    <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{selectedPosition.amount} {selectedPosition.wagerAsset || 'SUI'}</span>
                  </div>
                  {(() => {
                    const dStatus = getDynamicStatus(selectedPosition);
                    const isSettled = dStatus.includes('Won') || dStatus.includes('Lost') || dStatus.includes('Redeemed');
                    const isWon = dStatus.includes('Won') || dStatus.includes('Redeemed');
                    const wagerSymbol = selectedPosition.wagerAsset || 'SUI';
                    const wagerPrecision = wagerSymbol === 'SUI' ? 4 : 2;
                    
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Outcome / Status:</span>
                          <span style={{ 
                            fontWeight: '700', 
                            color: dStatus === 'Settled (Won - Pending)'
                              ? '#f59e0b'
                              : isSettled ? (isWon ? 'var(--color-success)' : 'var(--color-error)') : 'var(--color-primary)' 
                          }}>
                            {dStatus === 'Settled (Won - Pending)' ? 'WON (PENDING SETTLEMENT)' : dStatus.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{isSettled ? 'Net Profit / Loss:' : 'Est. Net Profit:'}</span>
                          <span style={{ 
                            fontWeight: '600', 
                            color: isSettled ? (isWon ? 'var(--color-success)' : 'var(--color-error)') : 'var(--color-success)', 
                            fontFamily: 'var(--font-mono)' 
                          }}>
                            {isSettled 
                              ? (isWon ? `+${selectedPosition.estWinnings?.toFixed(wagerPrecision)} ${wagerSymbol}` : `-${selectedPosition.amount?.toFixed(wagerPrecision)} ${wagerSymbol}`)
                              : `+${selectedPosition.estWinnings?.toFixed(wagerPrecision)} ${wagerSymbol} (~85% yield)`
                            }
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{isSettled ? 'Total Payout Received:' : 'Est. Total Payout:'}</span>
                          <span style={{ 
                            fontWeight: '600', 
                            color: isSettled ? (isWon ? 'var(--color-success)' : 'var(--text-muted)') : 'var(--color-success)', 
                            fontFamily: 'var(--font-mono)' 
                          }}>
                            {isSettled 
                              ? (isWon ? `${selectedPosition.estPayout?.toFixed(wagerPrecision)} ${wagerSymbol}` : `0.00 ${wagerSymbol}`)
                              : `${selectedPosition.estPayout?.toFixed(wagerPrecision)} ${wagerSymbol}`
                            }
                          </span>
                        </div>
                      </>
                    );
                  })()}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                    <span>1 Hour (Rolling)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Opened At:</span>
                    <span>{selectedPosition.timestamp && !isNaN(new Date(selectedPosition.timestamp).getTime()) ? new Date(selectedPosition.timestamp).toLocaleTimeString() : 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Settle / Expiry:</span>
                    <span>{selectedPosition.expiryTime && !isNaN(new Date(selectedPosition.expiryTime).getTime()) ? new Date(selectedPosition.expiryTime).toLocaleTimeString() : 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Time Remaining:</span>
                    <span style={{ 
                      fontWeight: '700', 
                      color: 'var(--color-secondary)',
                      background: 'var(--color-secondary-glow)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {selectedPosition.expiryTime ? getRemainingTimeText(selectedPosition.expiryTime) : 'N/A'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Supplied Capital:</span>
                    <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{selectedPosition.amount} {selectedPosition.wagerAsset || 'LOFI'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Pool Shares Received:</span>
                    <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{selectedPosition.amount} PLP</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Target Pool:</span>
                    <span>Sui Testnet PLP Vault</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Yield Source:</span>
                    <span>Option Mint Fees & Trader Losses</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Est. Yield Rate:</span>
                    <span style={{ color: 'var(--color-secondary)', fontWeight: '600' }}>~12-18% APR</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Lockup Duration:</span>
                    <span style={{ color: 'var(--color-success)', fontWeight: '600' }}>Instant (No lockup)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Supplied At:</span>
                    <span>{selectedPosition.timestamp?.toLocaleString()}</span>
                  </div>
                  <div style={{ marginTop: '10px', background: 'rgba(192, 132, 252, 0.05)', padding: '10px 12px', border: '1px solid rgba(192, 132, 252, 0.15)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    💡 To withdraw this capital, simply type <strong>"withdraw {selectedPosition.amount} LP"</strong> in the chat input. It will burn your PLP shares and return LOFI instantly.
                  </div>
                </>
              )}

              {selectedPosition.txDigest && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Transaction Digest:</span>
                  <a 
                    href={`https://suiscan.xyz/testnet/tx/${selectedPosition.txDigest}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {selectedPosition.txDigest.substring(0, 10)}... <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>

            {/* Close Button / Bottom Area */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              {selectedPosition.type !== 'LP' && (
                <div style={{ flex: 1, fontSize: '11px', color: 'var(--color-error)', background: 'var(--color-error-glow)', border: '1px solid rgba(248,113,113,0.2)', padding: '8px 12px', borderRadius: '8px', lineHeight: '1.4' }}>
                  ⚠️ Active option positions cannot be cancelled to prevent market gaming.
                </div>
              )}
            </div>
            
            {selectedPosition.type !== 'LP' && (getDynamicStatus(selectedPosition) === 'Settled (Won)' || getDynamicStatus(selectedPosition) === 'Settled (Won - Pending)') ? (() => {
              const isRealOracleSettled = (demoMode || !selectedPosition.oracleSviId)
                ? (selectedPosition.oracleExpiry ? Date.now() > selectedPosition.oracleExpiry : true)
                : (settledOracles[normalizeSuiAddress(selectedPosition.oracleSviId)] === true);
              return (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  {!isRealOracleSettled && (
                    <div style={{ 
                      background: 'rgba(245, 158, 11, 0.1)', 
                      border: '1px solid rgba(245, 158, 11, 0.2)', 
                      borderRadius: '8px', 
                      padding: '10px 12px', 
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} style={{ color: '#f59e0b' }} /> On-Chain Settlement Pending
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: '1.4' }}>
                        The prediction is visually complete, but the underlying testnet oracle SVI does not settle until <strong>{new Date(selectedPosition.oracleExpiry!).toLocaleTimeString()}</strong>. Payouts can be redeemed once the oracle is settled on-chain.
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const posToRedeem = selectedPosition;
                      setSelectedPosition(null);
                      executeCommandText("redeem payouts", posToRedeem);
                    }}
                    className={isRealOracleSettled ? "button-pulse" : ""}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: isRealOracleSettled 
                        ? 'linear-gradient(135deg, var(--color-success), #10b981)'
                        : 'linear-gradient(135deg, #f59e0b, #d97706)',
                      border: 'none',
                      color: '#000',
                      fontWeight: '700',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: isRealOracleSettled ? '0 4px 15px rgba(52, 211, 153, 0.3)' : '0 4px 15px rgba(245, 158, 11, 0.2)',
                      opacity: 1
                    }}
                  >
                    {isRealOracleSettled ? (
                      <>💰 Redeem Payout</>
                    ) : (
                      <>⏳ Redeem Payout (Pending Settlement)</>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedPosition(null)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontWeight: '600',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Close Details
                  </button>
                </div>
              );
            })() : getDynamicStatus(selectedPosition) === 'Settled (Redeemed)' ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <div style={{ width: '100%', padding: '12px', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '8px', color: 'var(--color-success)', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <CheckCircle size={16} style={{ color: 'var(--color-success)' }} /> Winnings Successfully Redeemed
                </div>
                <button
                  onClick={() => setSelectedPosition(null)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff',
                    fontWeight: '600',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Close Details
                </button>
              </div>
            ) : selectedPosition.type === 'LP' ? (
              <button
                onClick={() => {
                  const posToWithdraw = selectedPosition;
                  setSelectedPosition(null);
                  executeCommandText(`withdraw ${posToWithdraw.amount} LP`);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '600',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginTop: '10px'
                }}
              >
                Withdraw {selectedPosition.amount} LP
              </button>
            ) : (
              <button
                onClick={() => setSelectedPosition(null)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '600',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginTop: '10px'
                }}
              >
                Close Details
              </button>
            )}
          </div>
        </div>
      )}

      {showHistoryPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }} onClick={() => setShowHistoryPopup(false)}>
          <div style={{
            background: '#111',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '450px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative',
            boxSizing: 'border-box'
          }} onClick={(e) => e.stopPropagation()}>
            <button 
              type="button"
              onClick={() => setShowHistoryPopup(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s',
              }}
            >
              <X size={18} />
            </button>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} style={{ color: 'var(--color-secondary)' }} /> Settled & Redeemed Bets
            </h3>
            
            <div style={{
              maxHeight: '350px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              paddingRight: '4px'
            }}>
              {positions.filter(p => p.status === 'Settled (Won)' || p.status === 'Settled (Lost)' || p.status === 'Settled (Redeemed)' || p.status === 'Settled (Withdrawn)').length === 0 ? (
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-dim)',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '32px 16px',
                  background: 'rgba(255,255,255,0.01)',
                  borderRadius: '10px',
                  border: '1px dashed rgba(255,255,255,0.05)'
                }}>
                  No settled, redeemed or withdrawn items found in history.
                </div>
              ) : (
                positions.filter(p => p.status === 'Settled (Won)' || p.status === 'Settled (Lost)' || p.status === 'Settled (Redeemed)' || p.status === 'Settled (Withdrawn)').map(pos => {
                  const dStatus = getDynamicStatus(pos);
                  const isLP = pos.type === 'LP';
                  const isWithdrawn = pos.status === 'Settled (Withdrawn)';
                  
                  let displayStatusText = dStatus;
                  if (isLP && isWithdrawn) {
                    displayStatusText = 'Withdrawn';
                  } else if (dStatus === 'Settled (Won - Pending)') {
                    displayStatusText = 'Won (Pending)';
                  }

                  const isWon = !isLP && (dStatus.includes('Won') || dStatus.includes('Redeemed'));
                  const isRedeemed = !isLP && dStatus.includes('Redeemed');
                  const payout = isLP ? (isWithdrawn ? Math.abs(pos.amount) : 0) : (isWon ? (pos.estPayout || (pos.amount * 1.85)) : 0);
                  const profit = isLP ? 0 : (isWon ? (pos.estWinnings || (pos.amount * 0.85)) : -pos.amount);
                  
                  let tagColor = 'var(--color-error)';
                  let tagBg = 'var(--color-error-glow)';
                  if (isLP && isWithdrawn) {
                    tagColor = '#f59e0b'; // Amber
                    tagBg = 'rgba(245, 158, 11, 0.12)';
                  } else if (dStatus === 'Settled (Won - Pending)') {
                    tagColor = '#f59e0b'; // Amber
                    tagBg = 'rgba(245, 158, 11, 0.12)';
                  } else if (isRedeemed) {
                    tagColor = '#a855f7';
                    tagBg = 'rgba(168, 85, 247, 0.12)';
                  } else if (isWon) {
                    tagColor = 'var(--color-success)';
                    tagBg = 'var(--color-success-glow)';
                  }

                  return (
                    <div 
                      key={pos.id}
                      onClick={() => {
                        if (pos.status !== 'Settled (Withdrawn)') {
                          setSelectedPosition(pos);
                        }
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '10px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        cursor: pos.status !== 'Settled (Withdrawn)' ? 'pointer' : 'default',
                        transition: 'all 0.2s'
                      }}
                      className="position-card"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ 
                            fontSize: '10px', 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            fontWeight: '700',
                            background: isLP ? 'rgba(224, 86, 253, 0.15)' : (pos.type === 'Call' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)'),
                            color: isLP ? '#e056fd' : (pos.type === 'Call' ? 'var(--color-success)' : 'var(--color-error)')
                          }}>
                            {isLP ? 'LP Vault' : pos.type}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: '600' }}>
                            {isLP ? 'Predict LP Vault' : `${pos.asset || 'BTC'} @ $${pos.strike?.toLocaleString()}`}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          color: tagColor,
                          background: tagBg,
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {displayStatusText}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {isLP ? (
                          <>
                            <div>Withdrawn: <span style={{ color: 'var(--text-main)' }}>{Math.abs(pos.amount)} {pos.wagerAsset || 'LOFI'}</span></div>
                            <div>Status: <span style={{ color: '#f59e0b', fontWeight: '600' }}>Returned to Wallet</span></div>
                          </>
                        ) : (
                          <>
                            <div>Wager: <span style={{ color: 'var(--text-main)' }}>{pos.amount} {pos.wagerAsset || 'LOFI'}</span></div>
                            <div>Payout: <span style={{ color: isWon ? 'var(--color-success)' : 'var(--text-dim)', fontWeight: '600' }}>{payout.toFixed(2)} {pos.wagerAsset || 'LOFI'}</span></div>
                            <div>Net: <span style={{ color: profit >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: '600' }}>{profit >= 0 ? `+${profit.toFixed(2)} ${pos.wagerAsset || 'LOFI'}` : `-${Math.abs(profit).toFixed(2)} ${pos.wagerAsset || 'LOFI'}`}</span></div>
                          </>
                        )}
                      </div>
                      
                      {pos.timestamp && (
                        <div style={{ 
                          fontSize: '10px', 
                          color: 'var(--text-dim)', 
                          marginTop: '4px', 
                          fontFamily: 'var(--font-mono)',
                          borderTop: '1px solid rgba(255,255,255,0.02)',
                          paddingTop: '4px',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}>
                          <span>Date: {new Date(pos.timestamp).toLocaleDateString()}</span>
                          <span>Time: {new Date(pos.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            
            <button 
              type="button"
              onClick={() => setShowHistoryPopup(false)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-main)',
                fontWeight: '600',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '8px'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Floating Headset Support Button */}
      <div 
        ref={supportFabRef}
        className="support-fab animate-pulse-glow"
        title="24/7 Live Support Chat"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'fixed',
          bottom: '120px',
          left: '24px',
          zIndex: 999,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #a855f7, #6366f1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 20px rgba(168, 85, 247, 0.4)',
          transition: 'none',
          userSelect: 'none',
          touchAction: 'none'
        }}
      >
        <Headphones size={22} style={{ color: '#fff' }} />
        <span style={{
          position: 'absolute',
          top: '-2px',
          right: '-2px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: '#10b981',
          border: '1.5px solid #000'
        }} />
      </div>

      {/* Live Support Chat Popup */}
      {showSupportPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }} onClick={() => setShowSupportPopup(false)}>
          <div style={{
            background: '#111',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '450px',
            height: '600px',
            maxHeight: '85vh',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxSizing: 'border-box',
            overflow: 'hidden'
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.01)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Headphones size={16} style={{ color: '#fff' }} />
                </div>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
                    PIE Support
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Alex is Online</span>
                  </div>
                </div>
              </div>
              
              <button 
                type="button"
                onClick={() => setShowSupportPopup(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'all 0.2s',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Conversation Area */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {supportMessages.map((msg) => (
                <div 
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    width: '100%'
                  }}
                >
                  <div style={{
                    maxWidth: '85%',
                    background: msg.sender === 'user' ? 'var(--color-primary-glow)' : 'rgba(255, 255, 255, 0.03)',
                    border: msg.sender === 'user' ? '1px solid rgba(129, 140, 248, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                    padding: '10px 14px',
                    borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    lineHeight: '1.4',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {formatMessageText(msg.text)}
                  </div>
                  <span style={{
                    fontSize: '9px',
                    color: 'var(--text-dim)',
                    marginTop: '4px',
                    padding: '0 4px'
                  }}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              
              {/* Typing Indicator */}
              {isSupportTyping && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    padding: '10px 16px',
                    borderRadius: '12px 12px 12px 2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span className="typing-dot" />
                    <span className="typing-dot" style={{ animationDelay: '0.2s' }} />
                    <span className="typing-dot" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}
              
              <div ref={supportBottomRef} />
            </div>

            {/* Input Bar */}
            <form 
              onSubmit={handleSendSupportMessage}
              style={{
                padding: '12px 16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                gap: '8px',
                background: 'rgba(0,0,0,0.2)'
              }}
            >
              <input 
                type="text"
                placeholder="Ask support a question..."
                value={supportInput}
                onChange={(e) => setSupportInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={!supportInput.trim()}
                style={{
                  background: supportInput.trim() ? 'linear-gradient(135deg, #a855f7, #6366f1)' : 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  color: supportInput.trim() ? '#fff' : 'var(--text-dim)',
                  fontWeight: '600',
                  borderRadius: '8px',
                  padding: '0 16px',
                  cursor: supportInput.trim() ? 'pointer' : 'default',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
export default ChatInterface;
