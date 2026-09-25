import { coinaiEvm } from '@/lib/coinai.evm'
import { coinaiMock } from '@/lib/coinai.mock'
import { CONTRACT_ID } from '@/lib/config'
import type { CoinAIService } from '@/lib/types'

export const coinai: CoinAIService = CONTRACT_ID === '' ? coinaiMock : coinaiEvm
