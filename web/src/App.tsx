import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { AppShell } from '@/components/app-shell'
import { NotFoundContent } from '@/components/not-found-content'
import { Toaster } from '@/components/ui/sonner'
import { AppStateProvider } from '@/lib/app-state'
import { SettingsProvider } from '@/lib/settings'
import { config } from '@/lib/wagmi'
import { ActivityPage } from '@/pages/activity'
import { AgentPage } from '@/pages/agent'
import { AgentRolePage } from '@/pages/agent-role'
import { ChatPage } from '@/pages/chat'
import { PortfolioPage } from '@/pages/portfolio'
import { MarketPage } from '@/pages/market'
import { Dashboard } from '@/pages/dashboard'
import { FaucetPage } from '@/pages/faucet'
import { GroupPage } from '@/pages/group'
import { NewGroupPage } from '@/pages/group-new'
import { GroupsPage } from '@/pages/groups'
import { Landing } from '@/pages/landing'
import { NotFoundPage } from '@/pages/not-found'
import { PayPage } from '@/pages/pay'
import { PaymentLinkPage } from '@/pages/payment-link'
import { RulesPage } from '@/pages/rules'
import { SettingsPage } from '@/pages/settings'
import { WithdrawPage } from '@/pages/withdraw'
import { YieldPage } from '@/pages/yield'

import { ReactLenis } from 'lenis/react'

const queryClient = new QueryClient()

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function LegacyGroupRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/groups/${id}`} replace />
}

export function App() {
  const reducedMotion = usePrefersReducedMotion()
  return (
    <ReactLenis root options={{ duration: reducedMotion ? 0 : 1.1 }}>
      <ThemeProvider
        attribute="class"
        storageKey="coinai:theme"
        defaultTheme="light"
        disableTransitionOnChange
      >
        <SettingsProvider>
          <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <AppStateProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/pay/:address" element={<PayPage />} />
                    {/* Group pages stand alone like /pay; /g/:id is the short link people share */}
                    <Route path="/groups" element={<GroupsPage />} />
                    <Route path="/groups/new" element={<NewGroupPage />} />
                    <Route path="/groups/:id" element={<GroupPage />} />
                    <Route path="/g/:id" element={<GroupPage />} />
                    <Route path="/app" element={<AppShell />}>
                      <Route index element={<Dashboard />} />
                      <Route path="activity" element={<ActivityPage />} />
                      <Route path="faucet" element={<FaucetPage />} />
                      <Route path="yield" element={<YieldPage />} />
                      <Route path="agent" element={<AgentPage />} />
                      <Route path="agent/:role" element={<AgentRolePage />} />
                      <Route path="chat" element={<ChatPage />} />
                      <Route path="portfolio" element={<PortfolioPage />} />
                      <Route path="market" element={<MarketPage />} />
                      <Route path="withdraw" element={<WithdrawPage />} />
                      <Route path="rules" element={<RulesPage />} />
                      <Route path="link" element={<PaymentLinkPage />} />
                      <Route path="groups" element={<Navigate to="/groups" replace />} />
                      <Route path="groups/new" element={<Navigate to="/groups/new" replace />} />
                      <Route path="groups/:id" element={<LegacyGroupRedirect />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="*" element={<NotFoundContent />} />
                    </Route>
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </BrowserRouter>
                <Toaster />
              </AppStateProvider>
            </QueryClientProvider>
          </WagmiProvider>
        </SettingsProvider>
      </ThemeProvider>
    </ReactLenis>
  )
}
