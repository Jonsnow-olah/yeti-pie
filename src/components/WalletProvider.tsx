import React from 'react';
import { createNetworkConfig, SuiClientProvider, WalletProvider as SuiWalletProvider } from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl, JsonRpcHTTPTransport } from '@mysten/sui/jsonRpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import DApp-Kit standard styles
import '@mysten/dapp-kit/dist/index.css';

// Config network - using modern JsonRpcHTTPTransport for Sui SDK 2.0+
const { networkConfig } = createNetworkConfig({
  testnet: { 
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('testnet') }),
    network: 'testnet'
  },
  mainnet: { 
    transport: new JsonRpcHTTPTransport({ url: getJsonRpcFullnodeUrl('mainnet') }),
    network: 'mainnet'
  }
});

const queryClient = new QueryClient();

interface WalletProviderProps {
  children: React.ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <SuiWalletProvider autoConnect>
          {children}
        </SuiWalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
};
export default WalletProvider;
