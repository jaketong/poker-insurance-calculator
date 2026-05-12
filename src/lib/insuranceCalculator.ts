export type GameType = 'holdem' | 'omaha' | 'shortDeck'
export type Player = 'A' | 'B'
export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type Card = {
  rank: string
  suit: string
  code: string
}

export type OddsValue = number | null

export type InsuranceInput = {
  gameType: GameType
  playerAInput: string
  playerBInput: string
  boardInput: string
  leader: Player
  street: Street
  potAmount: number
  allInAmount: number
}

export type InsuranceResult = {
  gameType: GameType
  leader: Player
  underdog: Player
  outs: number
  remainingCards: number
  hitProbability: number
  defaultOdds: OddsValue
  breakEvenInsurance: number | null
  fullPotInsurance: number | null
  advice: string
  algorithmStatus: string
  resultText: string
}

export const gameLabels: Record<GameType, string> = {
  holdem: '德州扑克',
  omaha: '奥马哈',
  shortDeck: '短牌',
}

const rankSets: Record<GameType, string[]> = {
  holdem: ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
  omaha: ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
  shortDeck: ['6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
}

const suits = ['h', 's', 'd', 'c']

export const holdemOddsTable: Record<number, number> = {
  2: 15,
}

export const omahaOddsTable: Record<number, OddsValue> = {
  2: null,
}

export const shortDeckOddsTable: Record<number, OddsValue> = {
  2: null,
}

export function parseCards(input: string): Card[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const code = raw.trim()
      return {
        rank: code[0]?.toUpperCase() ?? '',
        suit: code[1]?.toLowerCase() ?? '',
        code: `${code[0]?.toUpperCase() ?? ''}${code[1]?.toLowerCase() ?? ''}`,
      }
    })
}

export function buildDeck(gameType: GameType): Card[] {
  return rankSets[gameType].flatMap((rank) =>
    suits.map((suit) => ({
      rank,
      suit,
      code: `${rank}${suit}`,
    })),
  )
}

export function validateCards(
  gameType: GameType,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
): string[] {
  const errors: string[] = []
  const allCards = [...playerA, ...playerB, ...board]
  const validRanks = new Set(rankSets[gameType])
  const validSuits = new Set(suits)
  const handSize = gameType === 'omaha' ? 4 : 2

  if (playerA.length !== handSize) {
    errors.push(`玩家 A 手牌需要 ${handSize} 张`)
  }

  if (playerB.length !== handSize) {
    errors.push(`玩家 B 手牌需要 ${handSize} 张`)
  }

  if (board.length > 5) {
    errors.push('公共牌最多 5 张')
  }

  allCards.forEach((card) => {
    if (card.code.length !== 2 || !validRanks.has(card.rank) || !validSuits.has(card.suit)) {
      errors.push(`牌面格式无效：${card.code || '空值'}`)
    }
  })

  const seen = new Set<string>()
  allCards.forEach((card) => {
    if (seen.has(card.code)) {
      errors.push(`重复牌：${card.code}`)
    }
    seen.add(card.code)
  })

  return [...new Set(errors)]
}

export function estimateOuts(
  gameType: GameType,
  _leader: Player,
  _playerA: Card[],
  _playerB: Card[],
  board: Card[],
): number {
  // TODO: 下一阶段接入德州、奥马哈、短牌的精确枚举算法。
  if (board.length >= 5) {
    return 0
  }

  if (gameType === 'holdem') {
    return 2
  }

  return 2
}

export function calculateHitProbability(outs: number, remainingCards: number): number {
  if (remainingCards <= 0) {
    return 0
  }

  return Math.min(outs, remainingCards) / remainingCards
}

export function calculateBreakEvenInsurance(allInAmount: number, odds: OddsValue): number | null {
  if (!odds || odds <= 0) {
    return null
  }

  return allInAmount / odds
}

export function calculateFullPotInsurance(potAmount: number, odds: OddsValue): number | null {
  if (!odds || odds <= 0) {
    return null
  }

  return potAmount / odds
}

export function getDefaultOdds(gameType: GameType, outs: number): OddsValue {
  if (gameType === 'holdem') {
    return holdemOddsTable[outs] ?? null
  }

  if (gameType === 'omaha') {
    return omahaOddsTable[outs] ?? null
  }

  return shortDeckOddsTable[outs] ?? null
}

export function formatAmount(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '待确认'
  }

  return value.toFixed(2)
}

export function formatOdds(odds: OddsValue): string {
  return odds ? `${odds} 倍` : '待确认'
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

export function buildResultText(result: InsuranceResult): string {
  return [
    `【${gameLabels[result.gameType]}保险计算】`,
    `领先方：玩家 ${result.leader}`,
    `落后方：玩家 ${result.underdog}`,
    `反超 outs：${result.outs}`,
    `保险命中概率：${formatPercent(result.hitProbability)}`,
    `默认赔率：${formatOdds(result.defaultOdds)}`,
    `买保本金额：${formatAmount(result.breakEvenInsurance)}`,
    `买满池金额：${formatAmount(result.fullPotInsurance)}`,
    `行动建议：${result.advice}`,
    `算法状态：${result.algorithmStatus}`,
  ].join('\n')
}

export function calculateInsurance(input: InsuranceInput): {
  errors: string[]
  result: InsuranceResult | null
} {
  const playerA = parseCards(input.playerAInput)
  const playerB = parseCards(input.playerBInput)
  const board = parseCards(input.boardInput)
  const errors = validateCards(input.gameType, playerA, playerB, board)

  if (input.potAmount <= 0) {
    errors.push('总底池需要大于 0')
  }

  if (input.allInAmount <= 0) {
    errors.push('领先方本次 All-in 投入需要大于 0')
  }

  if (errors.length > 0) {
    return { errors, result: null }
  }

  const usedCards = [...playerA, ...playerB, ...board]
  const remainingCards = buildDeck(input.gameType).length - usedCards.length
  const outs = estimateOuts(input.gameType, input.leader, playerA, playerB, board)
  const hitProbability = calculateHitProbability(outs, remainingCards)
  const defaultOdds = getDefaultOdds(input.gameType, outs)
  const breakEvenInsurance = calculateBreakEvenInsurance(input.allInAmount, defaultOdds)
  const fullPotInsurance = calculateFullPotInsurance(input.potAmount, defaultOdds)
  const underdog = input.leader === 'A' ? 'B' : 'A'
  const advice = defaultOdds
    ? '可按默认赔率参考买保本或买满池，最终以现场确认赔率为准'
    : '默认赔率待确认，暂不建议按本工具直接定价'
  const algorithmStatus = '当前为计算框架与基础估算，精确枚举算法待下一阶段接入'
  const resultBase: Omit<InsuranceResult, 'resultText'> = {
    gameType: input.gameType,
    leader: input.leader,
    underdog,
    outs,
    remainingCards,
    hitProbability,
    defaultOdds,
    breakEvenInsurance,
    fullPotInsurance,
    advice,
    algorithmStatus,
  }
  const result: InsuranceResult = {
    ...resultBase,
    resultText: buildResultText(resultBase as InsuranceResult),
  }

  return { errors: [], result }
}
