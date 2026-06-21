import { useState } from 'react';
import { WalletProvider } from './components/WalletProvider';
import { ChatInterface } from './components/ChatInterface';
import { LandingPage } from './components/LandingPage';

function App() {
  const [view, setView] = useState<'landing' | 'app'>('landing');

  return (
    <WalletProvider>
      {view === 'landing' ? (
        <LandingPage onLaunch={() => setView('app')} />
      ) : (
        <ChatInterface />
      )}
    </WalletProvider>
  );
}

export default App;
