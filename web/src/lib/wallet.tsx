import { useAccount, useConnect, useDisconnect } from 'wagmi'

export type WalletContextValue = {
  address: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

export function useWallet(): WalletContextValue {
  const account = useAccount()
  const { connectAsync, connectors, isPending: connecting } = useConnect()
  const { disconnectAsync } = useDisconnect()

  const injectedConnector = connectors.find((c) => c.id === 'injected') ?? connectors[0]

  return {
    address: account.address ?? null,
    connecting,
    connect: async () => {
      if (!injectedConnector) throw new Error('wallet_not_found')
      await connectAsync({ connector: injectedConnector })
    },
    disconnect: async () => {
      await disconnectAsync()
    },
  }
}
