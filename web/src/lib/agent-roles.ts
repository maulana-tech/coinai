import type { ComponentType } from 'react'
import { LineChartIcon, NewspaperIcon, PiggyBankIcon, ScaleIcon, ShieldCheckIcon, TrendingUpIcon, ZapIcon } from 'lucide-react'
import type { AgentStep } from '@/lib/agent-api'
import type { MessageKey } from '@/lib/i18n'

export type AgentRoleSlug = 'market' | 'savings' | 'investment' | 'guardrails' | 'risk' | 'executor' | 'reporter'

export type AgentRole = {
  slug: AgentRoleSlug
  step: AgentStep['agent'] | null // which run steps belong to this role
  icon: ComponentType<{ className?: string }>
  name: MessageKey
  tagline: MessageKey
  body: MessageKey
  reads: MessageKey
  limits: MessageKey
}

const role = (slug: AgentRoleSlug, step: AgentRole['step'], icon: AgentRole['icon'], name: MessageKey): AgentRole => ({
  slug,
  step,
  icon,
  name,
  tagline: `agentRole.${slug}Tagline` as MessageKey,
  body: `agentRole.${slug}Body` as MessageKey,
  reads: `agentRole.${slug}Reads` as MessageKey,
  limits: `agentRole.${slug}Limits` as MessageKey,
})

// Pipeline order: market read → strategists → guardrails → risk officer → executor → reporter
export const AGENT_ROLES: AgentRole[] = [
  role('market', 'market', LineChartIcon, 'agent.roleMarket'),
  role('savings', 'savings', PiggyBankIcon, 'agent.roleSavings'),
  role('investment', 'investment', TrendingUpIcon, 'agent.roleInvestment'),
  role('guardrails', 'guard', ShieldCheckIcon, 'agent.roleGuard'),
  role('risk', 'risk', ScaleIcon, 'agent.roleRisk'),
  role('executor', 'executor', ZapIcon, 'agent.roleExecutor'),
  role('reporter', null, NewspaperIcon, 'agent.roleReporter'),
]

export const agentRoleFor = (step: AgentStep['agent']) => AGENT_ROLES.find((r) => r.step === step)!
