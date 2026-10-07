import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { NotFoundContent } from '@/components/not-found-content'
import { Toaster } from '@/components/ui/sonner'
import { AppStateProvider } from '@/lib/app-state'
import { SettingsProvider } from '@/lib/settings'
import { config } from '@/lib/wagmi'

import { ReactLenis } from 'lenis/react'

// Each route loads its own chunk, so the landing doesn't ship the app (and the app doesn't ship the landing).
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}
const AppShell = page(() => import('@/components/app-shell'), 'AppShell')
const ActivityPage = page(() => import('@/pages/activity'), 'ActivityPage')
const AgentPage = page(() => import('@/pages/agent'), 'AgentPage')
const AgentRolePage = page(() => import('@/pages/agent-role'), 'AgentRolePage')
const ChatPage = page(() => import('@/pages/chat'), 'ChatPage')
const RewardsPage = page(() => import('@/pages/rewards'), 'RewardsPage')
const PortfolioPage = page(() => import('@/pages/portfolio'), 'PortfolioPage')
const MarketPage = page(() => import('@/pages/market'), 'MarketPage')
const Dashboard = page(() => import('@/pages/dashboard'), 'Dashboard')
const FaucetPage = page(() => import('@/pages/faucet'), 'FaucetPage')
const GroupPage = page(() => import('@/pages/group'), 'GroupPage')
const NewGroupPage = page(() => import('@/pages/group-new'), 'NewGroupPage')
const GroupsPage = page(() => import('@/pages/groups'), 'GroupsPage')
const Landing = page(() => import('@/pages/landing'), 'Landing')
const NotFoundPage = page(() => import('@/pages/not-found'), 'NotFoundPage')
const PayPage = page(() => import('@/pages/pay'), 'PayPage')
const PaymentLinkPage = page(() => import('@/pages/payment-link'), 'PaymentLinkPage')
const RulesPage = page(() => import('@/pages/rules'), 'RulesPage')
const SettingsPage = page(() => import('@/pages/settings'), 'SettingsPage')
const WithdrawPage = page(() => import('@/pages/withdraw'), 'WithdrawPage')
const YieldPage = page(() => import('@/pages/yield'), 'YieldPage')

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
                  <Suspense fallback={null}>
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
                        <Route path="rewards" element={<RewardsPage />} />
                        <Route path="groups" element={<Navigate to="/groups" replace />} />
                        <Route path="groups/new" element={<Navigate to="/groups/new" replace />} />
                        <Route path="groups/:id" element={<LegacyGroupRedirect />} />
                        <Route path="settings" element={<SettingsPage />} />
                        <Route path="*" element={<NotFoundContent />} />
                      </Route>
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </Suspense>
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
