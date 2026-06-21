import React, { useState, useEffect } from 'react';
import { 
  Play, MessageSquare, Shield, Droplet, Mic, Settings, ArrowRight,
  ChevronDown, Mail, Send, Check, Sparkles 
} from 'lucide-react';

interface LandingPageProps {
  onLaunch: () => void;
}

const PieLogo: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="url(#pieGrad)" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ filter: 'drop-shadow(0 0 12px rgba(192, 132, 252, 0.7))' }}
  >
    <defs>
      <linearGradient id="pieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="var(--color-secondary)" />
        <stop offset="100%" stopColor="var(--color-primary)" />
      </linearGradient>
    </defs>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" fill="var(--color-secondary-glow)" />
  </svg>
);

const PredictDemoTerminal: React.FC = () => {
  const [commandIndex, setCommandIndex] = useState(0);
  const [step, setStep] = useState(0); // 0: typing, 1: parsing, 2: compiling, 3: auditing, 4: success/card
  const [typedText, setTypedText] = useState('');
  
  const commands = [
    {
      text: "bet 50 sui on btc above 62k",
      action: "MINT_OPTION",
      params: { Asset: "BTC", Size: "50.00 SUI", Strike: "$62,000", Direction: "Above" },
      ptb: [
        `1. tx.splitCoin(gas, [50000000000]) -> coin_sui`,
        `2. market_key::new(62000000000000, "above") -> market_key`,
        `3. predict::mint(registry, manager, market_key, coin_sui, oracle, clock) -> receipt`,
        `4. tx.transferObjects([receipt], userAddress)`
      ],
      guardian: {
        risk: "Balanced",
        distance: "+3.4% from spot",
        status: "SAFE"
      },
      card: {
        title: "BTC Prediction Call",
        subtitle: "Above $62,000",
        wager: "50.00 SUI",
        payout: "$92.50 dSUI",
        expiry: "59m 54s",
        status: "Active"
      }
    },
    {
      text: "supply 500 sui to lp vault",
      action: "SUPPLY_LP",
      params: { Action: "Supply Liquidity", Size: "500.00 SUI", Target: "LP Vault" },
      ptb: [
        `1. tx.splitCoin(gas, [500000000000]) -> coin_sui`,
        `2. predict::supply(registry, manager, coin_sui) -> plp_coin`,
        `3. tx.transferObjects([plp_coin], userAddress)`
      ],
      guardian: {
        risk: "Low Risk",
        distance: "Yield-Underwritten",
        status: "SAFE"
      },
      card: {
        title: "Predict LP Shares",
        subtitle: "Yeti LP Vault",
        wager: "500.00 SUI",
        payout: "500.00 PLP",
        expiry: "14.8% Est. APR",
        status: "Active"
      }
    },
    {
      text: "claim winnings for btc strike 63500",
      action: "REDEEM_PAYOUT",
      params: { Action: "Redeem Option", Strike: "$63,500" },
      ptb: [
        `1. predict::redeem_permissionless(registry, manager, market_key, oracle, clock) -> coin_sui`,
        `2. predict_manager::withdraw(manager, coin_sui)`
      ],
      guardian: {
        risk: "N/A",
        distance: "Settled on-chain",
        status: "SAFE"
      },
      card: {
        title: "Redeem Win Payout",
        subtitle: "BTC Above $63,500",
        wager: "100.00 SUI",
        payout: "$185.00 dSUI",
        expiry: "Settled (Won)",
        status: "Claimed"
      }
    }
  ];

  const activeCmd = commands[commandIndex];

  useEffect(() => {
    let timer: any;
    
    if (step === 0) {
      const fullText = activeCmd.text;
      if (typedText.length < fullText.length) {
        timer = setTimeout(() => {
          setTypedText(fullText.slice(0, typedText.length + 1));
        }, 60);
      } else {
        timer = setTimeout(() => {
          setStep(1);
        }, 800);
      }
    } else if (step === 1) {
      timer = setTimeout(() => {
        setStep(2);
      }, 1000);
    } else if (step === 2) {
      timer = setTimeout(() => {
        setStep(3);
      }, 1200);
    } else if (step === 3) {
      timer = setTimeout(() => {
        setStep(4);
      }, 1200);
    } else if (step === 4) {
      timer = setTimeout(() => {
        setStep(0);
        setTypedText('');
        setCommandIndex((prev) => (prev + 1) % commands.length);
      }, 4500);
    }

    return () => clearTimeout(timer);
  }, [step, typedText, commandIndex]);

  return (
    <div style={{
      background: 'rgba(6, 9, 22, 0.65)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '20px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(168, 85, 247, 0.1)',
      width: '100%',
      maxWidth: '520px',
      minHeight: '420px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      textAlign: 'left',
      fontFamily: 'var(--font-mono)',
      boxSizing: 'border-box'
    }}>
      {/* Terminal Window Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        background: 'rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }} />
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: '600', letterSpacing: '0.05em' }}>
          PIE-INTENT-COMPILER.SH
        </span>
        <Sparkles size={13} style={{ color: 'var(--color-secondary)' }} />
      </div>

      {/* Terminal Content */}
      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '12px' }}>
        {/* Terminal Input Line */}
        <div>
          <span style={{ color: 'var(--color-primary)', marginRight: '8px', fontWeight: 'bold' }}>user@pie:~$</span>
          <span style={{ color: '#fff', fontSize: '13px' }}>{typedText}</span>
          <span style={{
            display: 'inline-block',
            width: '7px',
            height: '13px',
            background: 'var(--color-primary)',
            marginLeft: '3px',
            animation: 'blink 1s infinite',
            verticalAlign: 'middle'
          }} />
        </div>

        {/* Step 1: AI Parser Output */}
        {step >= 1 && (
          <div style={{
            background: 'rgba(129, 140, 248, 0.04)',
            border: '1px solid rgba(129, 140, 248, 0.15)',
            borderRadius: '8px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'slideIn 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={13} /> AI INTENT ENGINE
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(129, 140, 248, 0.8)', background: 'rgba(129, 140, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                Gemini 2.5 Active
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                Action: <span style={{ color: '#818cf8', fontWeight: 'bold' }}>{activeCmd.action}</span>
              </div>
              {Object.entries(activeCmd.params).map(([key, val]) => (
                <div key={key} style={{ background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {key}: <span style={{ color: '#a78bfa' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Compiler Output */}
        {step >= 2 && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            animation: 'slideIn 0.3s ease-out'
          }}>
            <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>
              &gt; COMPILED SUI PROGRAMMABLE TRANSACTION BLOCK (PTB)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#c084fc', opacity: 0.9 }}>
              {activeCmd.ptb.map((line, idx) => (
                <div key={idx} style={{ paddingLeft: '8px', borderLeft: '2px solid rgba(192, 132, 252, 0.3)' }}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Guardian Shield */}
        {step >= 3 && (
          <div style={{
            background: activeCmd.guardian.status === 'SAFE' ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
            border: activeCmd.guardian.status === 'SAFE' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'slideIn 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={14} style={{ color: '#10b981' }} />
              <span style={{ color: '#fff', fontWeight: 'bold' }}>GUARDIAN RISK AUDIT:</span>
              <span style={{
                color: activeCmd.guardian.risk === 'Balanced' ? '#3b82f6' : activeCmd.guardian.risk === 'Low Risk' ? '#10b981' : '#f59e0b',
                background: 'rgba(255,255,255,0.03)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 'bold'
              }}>
                {activeCmd.guardian.risk}
              </span>
              {activeCmd.guardian.distance !== 'N/A' && (
                <span style={{ color: 'var(--text-muted)' }}>({activeCmd.guardian.distance})</span>
              )}
            </div>
            <span style={{ color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={14} /> {activeCmd.guardian.status}
            </span>
          </div>
        )}

        {/* Step 4: Position Card Success */}
        {step >= 4 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(99, 102, 241, 0.08))',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 8px 20px rgba(168, 85, 247, 0.1)',
            animation: 'slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(168, 85, 247, 0.2)',
                  color: '#c084fc'
                }}>
                  {activeCmd.action === 'MINT_OPTION' ? 'Option' : activeCmd.action === 'SUPPLY_LP' ? 'LP Vault' : 'Claim'}
                </span>
                <span style={{ color: '#fff', fontWeight: 'bold' }}>{activeCmd.card.title}</span>
              </div>
              <span style={{
                color: activeCmd.card.status === 'Active' ? '#10b981' : '#a855f7',
                fontSize: '10px',
                fontWeight: 'bold',
                background: 'rgba(255,255,255,0.03)',
                padding: '2px 8px',
                borderRadius: '20px'
              }}>
                {activeCmd.card.status}
              </span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
              <div>{activeCmd.action === 'SUPPLY_LP' ? 'Supplied' : 'Wager'}: <span style={{ color: '#fff' }}>{activeCmd.card.wager}</span></div>
              <div>{activeCmd.action === 'SUPPLY_LP' ? 'Shares' : 'Payout'}: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{activeCmd.card.payout}</span></div>
              <div>{activeCmd.action === 'SUPPLY_LP' ? 'Yield' : 'Time'}: <span style={{ color: '#f59e0b' }}>{activeCmd.card.expiry}</span></div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '6px',
              color: '#10b981',
              fontWeight: 'bold',
              fontSize: '11px',
              marginTop: '4px'
            }}>
              <Check size={14} /> TRANSACTION EXECUTED SUCCESSFULLY
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  
  // Contact Form States
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const faqs = [
    {
      q: "What is Yeti Predict?",
      a: "Yeti Predict is a decentralized, on-chain binary options trading platform built on the Sui Network. It allows users to bet on whether an asset price (like BTC/USD) will settle above or below a chosen strike price at the end of a prediction period."
    },
    {
      q: "How does the Predict Intent Engine (P.I.E.) simplify trading?",
      a: "Instead of dealing with complicated options trading forms and manual inputs, P.I.E. lets you dictate or type your trading commands in conversational English (e.g., 'bet 50 SUI on BTC above 62500'). Our parser compiles it instantly into safe, optimized Sui Programmable Transaction Blocks."
    },
    {
      q: "What does the Guardian Layer do?",
      a: "The Guardian is a safety audit shield that dry-runs your compiled transaction block via Sui fullnodes before you approve it. It checks for stale oracles, verifies option price bounds (valid bets must settle between 1% and 99% probability), and offers clickable strike corrections if yours is unmintable."
    },
    {
      q: "How do LP Vaults work and what yields do they earn?",
      a: "SUI supplied to the LP Vault underwrites options minted by other traders. LPs earn yields from option minting fees and trades that settle out-of-the-money. The vault is instant-access, meaning you can supply and withdraw liquidity at any time."
    },
    {
      q: "Is there a Sandbox Demo Mode?",
      a: "Yes! If you want to explore the interface without spending gas or connecting a wallet, you can toggle Sandbox Demo Mode. This simulates transaction execution, account setup, and positions tracking instantly inside your browser."
    }
  ];

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setContactName('');
      setContactEmail('');
      setContactMessage('');
      setTimeout(() => setSubmitSuccess(false), 5000);
    }, 1500);
  };

  return (
    <div className="landing-container">
      <style>{`
        .landing-container {
          width: 100%;
          min-height: 100vh;
          background-color: var(--bg-base);
          background-image: 
            radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.12) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(192, 132, 252, 0.12) 0px, transparent 50%),
            radial-gradient(at 50% 100%, rgba(52, 211, 153, 0.05) 0px, transparent 50%);
          color: var(--text-main);
          font-family: var(--font-sans);
          overflow-y: auto;
          padding-bottom: 80px;
        }

        .landing-header {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .landing-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }

        .landing-logo-text {
          font-family: var(--font-display);
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #fff 40%, var(--color-primary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .landing-logo-tag {
          font-size: 11px;
          color: var(--color-secondary);
          background: var(--color-secondary-glow);
          border: 1px solid rgba(192, 132, 252, 0.3);
          padding: 2px 8px;
          border-radius: 20px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .hero-section {
          max-width: 1200px;
          margin: 60px auto 80px auto;
          padding: 0 20px;
        }

        .hero-content-wrapper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 60px;
        }

        .hero-left {
          flex: 1.1;
          text-align: left;
        }

        .hero-right {
          flex: 0.9;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(129, 140, 248, 0.06);
          border: 1px solid rgba(129, 140, 248, 0.2);
          padding: 6px 14px;
          border-radius: 30px;
          font-size: 13px;
          color: var(--color-primary);
          font-weight: 600;
          margin-bottom: 24px;
          letter-spacing: 0.02em;
        }

        .hero-title {
          font-size: 64px;
          line-height: 1.1;
          margin-bottom: 24px;
          background: linear-gradient(135deg, #ffffff 30%, #a5b4fc 70%, var(--color-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-family: var(--font-display);
          font-weight: 700;
          letter-spacing: -0.03em;
        }

        .hero-description {
          font-size: 18px;
          color: var(--text-muted);
          line-height: 1.6;
          margin-bottom: 40px;
          max-width: 640px;
        }

        .cta-group {
          display: flex;
          justify-content: flex-start;
          align-items: center;
          gap: 16px;
        }

        .btn-launch {
          padding: 16px 36px;
          font-size: 16px;
          font-weight: 700;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
          border: none;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 8px 30px rgba(129, 140, 248, 0.4);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .btn-launch:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(192, 132, 252, 0.5);
          filter: brightness(1.1);
        }

        .features-grid {
          max-width: 1200px;
          margin: 60px auto 0 auto;
          padding: 0 20px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .landing-faq {
          max-width: 1000px;
          margin: 100px auto 60px auto;
          padding: 0 20px;
        }

        .landing-contact {
          max-width: 1000px;
          margin: 60px auto 0 auto;
          padding: 0 20px;
        }

        @media (max-width: 992px) {
          .hero-content-wrapper {
            flex-direction: column;
            gap: 48px;
            text-align: center;
          }
          .hero-left {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .hero-description {
            margin-left: auto;
            margin-right: auto;
          }
          .cta-group {
            justify-content: center;
          }
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .hero-title {
            font-size: 48px;
          }
        }

        @media (max-width: 768px) {
          .landing-header {
            padding: 16px;
          }
          .landing-logo-tag {
            display: none;
          }
          .hero-section {
            margin-top: 40px;
          }
          .steps-container {
            flex-direction: column;
            gap: 32px;
          }
          .step-arrow {
            transform: rotate(90deg);
          }
        }

        @media (max-width: 600px) {
          .features-grid {
            grid-template-columns: 1fr;
          }
          .hero-title {
            font-size: 38px;
          }
          .cta-group {
            flex-direction: column;
            width: 100%;
          }
          .btn-launch {
            width: 100%;
            justify-content: center;
          }
        }

        @media (max-width: 500px) {
          .landing-contact {
            padding: 0 10px;
          }
          .landing-contact > div {
            padding: 24px !important;
          }
          form > div:first-child {
            grid-template-columns: 1fr !important;
          }
        }

        .feature-card {
          padding: 28px;
          background: rgba(13, 20, 38, 0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border-glow);
          border-radius: 16px;
          transition: all 0.3s;
          display: flex;
          flex-direction: column;
          gap: 16px;
          text-align: left;
        }

        .feature-card:hover {
          border-color: var(--border-glow-hover);
          transform: translateY(-4px);
          background: rgba(13, 20, 38, 0.5);
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        .feature-icon-wrapper {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-primary-glow);
          border: 1px solid rgba(129, 140, 248, 0.2);
          color: var(--color-primary);
        }

        .feature-card:nth-child(2n) .feature-icon-wrapper {
          background: var(--color-secondary-glow);
          border-color: rgba(192, 132, 252, 0.2);
          color: var(--color-secondary);
        }

        .feature-title {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
        }

        .feature-desc {
          font-size: 13.5px;
          color: var(--text-muted);
          line-height: 1.5;
        }

        .onboarding-workflow {
          max-width: 1000px;
          margin: 100px auto 40px auto;
          background: rgba(22, 33, 62, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 24px;
          padding: 40px;
          text-align: center;
        }

        .workflow-title {
          font-size: 24px;
          margin-bottom: 12px;
          color: #fff;
        }

        .workflow-desc {
          font-size: 14px;
          color: var(--text-muted);
          margin-bottom: 40px;
        }

        .steps-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .step-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--color-primary-glow);
          border: 1px solid var(--color-primary);
          color: var(--color-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
        }

        .step-text {
          font-size: 13.5px;
          color: var(--text-main);
          font-weight: 600;
        }

        .step-subtext {
          font-size: 11px;
          color: var(--text-muted);
          max-width: 180px;
        }

        .step-arrow {
          color: var(--text-dim);
        }

        /* FAQ Accordion Styling */
        .accordion-item {
          background: rgba(13, 20, 38, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          margin-bottom: 16px;
          padding: 18px 24px;
          transition: all 0.3s ease;
        }
        
        .accordion-item:hover {
          border-color: rgba(129, 140, 248, 0.25);
          background: rgba(13, 20, 38, 0.55);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .accordion-trigger {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: transparent;
          border: none;
          color: #fff;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          text-align: left;
          padding: 0;
          transition: color 0.2s;
        }

        .accordion-trigger:hover {
          color: var(--color-primary);
        }

        .accordion-content {
          margin-top: 14px;
          color: var(--text-muted);
          font-size: 14px;
          line-height: 1.6;
          padding-right: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 14px;
        }

        /* Contact Support Inputs */
        .contact-input {
          width: 100%;
          background: rgba(6, 9, 22, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 12px 16px;
          border-radius: 8px;
          color: #fff;
          font-size: 13.5px;
          transition: all 0.3s ease;
          box-sizing: border-box;
        }

        .contact-input:focus {
          outline: none;
          border-color: var(--color-primary);
          background: rgba(6, 9, 22, 0.85);
          box-shadow: 0 0 12px rgba(129, 140, 248, 0.25);
        }
      `}</style>

      {/* HEADER */}
      <header className="landing-header">
        <div className="landing-logo">
          <PieLogo size={36} />
          <span className="landing-logo-text">PIE</span>
          <span className="landing-logo-tag">Predict Engine</span>
        </div>
        <div>
          <button onClick={onLaunch} className="btn-launch" style={{ padding: '8px 20px', fontSize: '13px', boxShadow: 'none' }}>
            Launch App
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <main className="hero-section">
        <div className="hero-content-wrapper">
          <div className="hero-left">
            <div className="hero-badge">
              <PieLogo size={16} />
              <span>Yeti v3 Option Trading Agent</span>
            </div>
            <h1 className="hero-title">
              Want a piece of the P.I.E.?
            </h1>
            <p className="hero-description">
              The <strong style={{ color: '#fff', fontWeight: 600 }}>PIE</strong> is a premium AI-driven interface for Yeti Predict. Simply dictate or type your trading intents in plain English, and watch our compiler construct safe, optimized Sui Programmable Transaction Blocks instantly.
            </p>
            <div className="cta-group">
              <button onClick={onLaunch} className="btn-launch">
                Launch App <Play size={16} fill="#fff" />
              </button>
            </div>
          </div>
          <div className="hero-right">
            <PredictDemoTerminal />
          </div>
        </div>
      </main>

      {/* FEATURES GRID */}
      <section className="features-grid">
        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Mic size={20} />
          </div>
          <h3 className="feature-title">Voice Note Dictation</h3>
          <p className="feature-desc">
            Skip the keyboard entirely. Hit the microphone button, dictate your option bet or LP supply in plain English, and the engine transcribes it on-the-fly.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <MessageSquare size={20} />
          </div>
          <h3 className="feature-title">Gemini AI Parser</h3>
          <p className="feature-desc">
            Powered by Google's Gemini 2.5 Flash. Translates colloquial language into structured option parameters, with an intelligent local Levenshtein autocorrect editor fallback.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Shield size={20} />
          </div>
          <h3 className="feature-title">Guardian Layer Protection</h3>
          <p className="feature-desc">
            Dry-runs transactions on-chain before signing. Captures stale oracles and strike price bounds (1%-99%), and dynamically suggests valid market orders.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Droplet size={20} />
          </div>
          <h3 className="feature-title">LP Vault Pools</h3>
          <p className="feature-desc">
            Supply SUI liquidity to underwrite options contracts. Earn yields from option mint fees and trader losses in a simple, one-click supplying interface.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Settings size={20} />
          </div>
          <h3 className="feature-title">Slippage & Gas Caps</h3>
          <p className="feature-desc">
            Configure slippage parameters (0.5%, 1.0%, 2.0%) and max gas fee limits directly to shelter your trades from network volatility or price spikes.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Play size={20} />
          </div>
          <h3 className="feature-title">Demo Sandbox Mode</h3>
          <p className="feature-desc">
            Enables instant simulated sandbox evaluations. Run mock transactions, mock PredictManager setups, and populate portfolio positions without any wallet requirements.
          </p>
        </div>
      </section>

      {/* WORKFLOW WORK */}
      <section className="onboarding-workflow">
        <h3 className="workflow-title">Frictionless Conversational Trading</h3>
        <p style={{ marginTop: 0, marginBottom: '40px' }} className="workflow-desc">Four atomic steps from user thought to verified on-chain execution</p>
        
        <div className="steps-container">
          <div className="step-item">
            <div className="step-number">1</div>
            <span className="step-text">Dictate Intent</span>
            <span className="step-subtext">Talk or type a command in plain English</span>
          </div>
          
          <div className="step-arrow">
            <ArrowRight size={20} />
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <span className="step-text">PTB Compilation</span>
            <span className="step-subtext">AI compiles commands into Sui moves</span>
          </div>

          <div className="step-arrow">
            <ArrowRight size={20} />
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <span className="step-text">Guardian Audit</span>
            <span className="step-subtext">Checks risk parameters and dry-runs on-chain</span>
          </div>

          <div className="step-arrow">
            <ArrowRight size={20} />
          </div>

          <div className="step-item">
            <div className="step-number">4</div>
            <span className="step-text">Sign & Trade</span>
            <span className="step-subtext">Wallet execution completes in one single block</span>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="landing-faq">
        <h2 style={{ fontSize: '32px', color: '#fff', textAlign: 'center', marginBottom: '40px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          Frequently Asked Questions
        </h2>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {faqs.map((faq, idx) => (
            <div key={idx} className="accordion-item">
              <button 
                className="accordion-trigger"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              >
                <span>{faq.q}</span>
                <ChevronDown 
                  size={18} 
                  style={{ 
                    transform: openFaq === idx ? 'rotate(180deg)' : 'rotate(0deg)', 
                    transition: 'transform 0.3s',
                    color: 'var(--color-primary)',
                    flexShrink: 0
                  }} 
                />
              </button>
              {openFaq === idx && (
                <div className="accordion-content animate-slide-in">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT US SECTION */}
      <section className="landing-contact">
        <div style={{
          maxWidth: '600px',
          margin: '100px auto 0 auto',
          background: 'rgba(13, 20, 38, 0.45)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '40px',
          boxSizing: 'border-box'
        }}>
          <h3 style={{ fontSize: '24px', color: '#fff', marginBottom: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Mail size={20} style={{ color: 'var(--color-primary)' }} /> Contact PIE Support
          </h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '28px', marginTop: '8px' }}>
            Have questions about Yeti Predict, option settlements, or platform integrations? Shoot us a message!
          </p>

          {submitSuccess ? (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '12px',
              padding: '20px',
              textAlign: 'center',
              color: '#10b981',
              fontWeight: '600',
              animation: 'slideIn 0.3s ease-out'
            }}>
              <Check size={24} style={{ margin: '0 auto 8px auto', display: 'block' }} />
              Message Sent! We will get back to you shortly.
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>YOUR NAME</label>
                  <input 
                    type="text" 
                    className="contact-input"
                    placeholder="Alex S."
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>EMAIL ADDRESS</label>
                  <input 
                    type="email" 
                    className="contact-input"
                    placeholder="alex@sui.io"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>MESSAGE</label>
                <textarea 
                  className="contact-input"
                  style={{ minHeight: '100px', resize: 'vertical' }}
                  placeholder="How does the option settlement claim work?..."
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                style={{
                  padding: '14px',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(129, 140, 248, 0.2)',
                  transition: 'all 0.3s'
                }}
              >
                {isSubmitting ? 'Sending...' : <>Send Message <Send size={14} /></>}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        maxWidth: '1200px',
        margin: '100px auto 0 auto',
        padding: '40px 20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PieLogo size={28} />
          <span style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '-0.01em' }}>PIE</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <a 
            href="https://x.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'none',
              fontSize: '13.5px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle' }}>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg> Follow on X (Twitter)
          </a>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
          <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
            © {new Date().getFullYear()} Predict Intent Engine. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
};
