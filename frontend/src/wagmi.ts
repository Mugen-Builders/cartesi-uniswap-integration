import { http, createConfig } from 'wagmi'
import type { Chain } from 'viem'
import { anvil, sepolia, baseSepolia } from 'wagmi/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'

const chains = [anvil, sepolia, baseSepolia] as const satisfies readonly [Chain, ...Chain[]]
type ChainId = (typeof chains)[number]['id']
type HttpTransport = ReturnType<typeof http>

const getRpcUrl = (_chain: Chain) => {
  const url = import.meta.env.VITE_RPC_URL
  if (!url) {
    throw new Error(
      `No RPC URL configured. Set VITE_RPC_URL in .env (see .env.example). Chain: ${_chain.name}`
    )
  }
  return url
}

export const config = createConfig({
  chains,
  connectors: [
    injected(),
    coinbaseWallet(),
    walletConnect({ projectId: '4e1be5537b95ab7643e1656be47b7ed1' }),
  ],
  transports: chains.reduce<Record<ChainId, HttpTransport>>((acc, chain) => {
    acc[chain.id] = http(getRpcUrl(chain))
    return acc
  }, {} as Record<ChainId, HttpTransport>),
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
