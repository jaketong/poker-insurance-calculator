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
  outsDisplayLabel: string
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

const RANK_VALUE: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

/** 牌力编码：同花顺(8)…高牌(0)，后续数字为踢脚，逐项比较。 */
type HandRank = readonly number[]

function rankValue(rank: string): number {
  return RANK_VALUE[rank] ?? 0
}

function compareHandRank(a: HandRank, b: HandRank): number {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) {
      return d > 0 ? 1 : -1
    }
  }
  return 0
}

/** 5 张牌牌力（不含 7 选 5）。 */
function evaluate5Cards(cards: Card[]): HandRank {
  const vals = cards.map((c) => rankValue(c.rank)).sort((x, y) => y - x)
  const suitsArr = cards.map((c) => c.suit)
  const flush = suitsArr.every((s) => s === suitsArr[0])

  const freq = new Map<number, number>()
  for (const v of vals) {
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  const groups = [...freq.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1]
    }
    return b[0] - a[0]
  })

  const uniqueSorted = [...new Set(vals)].sort((x, y) => x - y)

  const isWheel = uniqueSorted.length === 5 && uniqueSorted.join(',') === '2,3,4,5,14'
  let straightHigh = 0
  if (uniqueSorted.length === 5) {
    if (isWheel) {
      straightHigh = 5
    } else if (uniqueSorted[4]! - uniqueSorted[0]! === 4) {
      straightHigh = uniqueSorted[4]!
    }
  }

  const straight = straightHigh > 0

  if (flush && straight) {
    const cat = 8
    if (straightHigh === 14 && !isWheel) {
      return [cat, 14] as const
    }
    return [cat, straightHigh] as const
  }

  if (groups[0]![1] === 4) {
    const quad = groups[0]![0]
    const kicker = groups[1]![0]
    return [7, quad, kicker] as const
  }

  if (groups[0]![1] === 3 && groups[1]![1] === 2) {
    return [6, groups[0]![0], groups[1]![0]] as const
  }

  if (flush) {
    return [5, ...vals] as const
  }

  if (straight) {
    return [4, straightHigh] as const
  }

  if (groups[0]![1] === 3) {
    const t = groups[0]![0]
    const kickers = groups.slice(1).map((g) => g[0])
    return [3, t, ...kickers] as const
  }

  if (groups[0]![1] === 2 && groups[1]![1] === 2) {
    const hi = Math.max(groups[0]![0], groups[1]![0])
    const lo = Math.min(groups[0]![0], groups[1]![0])
    const kicker = groups[2]![0]
    return [2, hi, lo, kicker] as const
  }

  if (groups[0]![1] === 2) {
    const p = groups[0]![0]
    const kickers = groups.slice(1).map((g) => g[0])
    return [1, p, ...kickers] as const
  }

  return [0, ...vals] as const
}

function combinations5From7(cards: Card[]): Card[][] {
  const out: Card[][] = []
  const n = cards.length
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          for (let e = d + 1; e < n; e++) {
            out.push([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!])
          }
        }
      }
    }
  }
  return out
}

function bestHandFrom7(cards7: Card[]): HandRank {
  let best: HandRank | null = null
  for (const five of combinations5From7(cards7)) {
    const r = evaluate5Cards(five)
    if (!best || compareHandRank(r, best) > 0) {
      best = r
    }
  }
  return best ?? [0]
}

function bestHandFrom6(cards6: Card[]): HandRank {
  let best: HandRank | null = null
  for (let omit = 0; omit < 6; omit++) {
    const five: Card[] = []
    for (let j = 0; j < 6; j++) {
      if (j !== omit) {
        five.push(cards6[j]!)
      }
    }
    const r = evaluate5Cards(five)
    if (!best || compareHandRank(r, best) > 0) {
      best = r
    }
  }
  return best ?? [0]
}

/** 仅 3 张牌（翻前发出首张公共牌后的摊牌比较）。 */
function evaluate3Cards(cards: Card[]): HandRank {
  const vals = cards.map((c) => rankValue(c.rank)).sort((x, y) => y - x)
  const freq = new Map<number, number>()
  for (const v of vals) {
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  const groups = [...freq.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1]
    }
    return b[0] - a[0]
  })
  if (groups[0]![1] === 3) {
    return [7, groups[0]![0]] as const
  }
  if (groups[0]![1] === 2) {
    return [1, groups[0]![0], groups[1]![0]] as const
  }
  return [0, ...vals] as const
}

function bestHandFromHoleAndBoard(cards: Card[]): HandRank {
  const n = cards.length
  if (n === 7) {
    return bestHandFrom7(cards)
  }
  if (n === 6) {
    return bestHandFrom6(cards)
  }
  if (n === 5) {
    return evaluate5Cards(cards)
  }
  if (n === 3) {
    return evaluate3Cards(cards)
  }
  if (n <= 2) {
    const vals = cards.map((c) => rankValue(c.rank)).sort((x, y) => y - x)
    return [0, ...vals] as const
  }
  return [0]
}

/** 公共牌未齐 5 张时，用手牌 + 当前公共牌（含刚发出的下一张）比牌。 */
function comparePartialShowdown(playerA: Card[], playerB: Card[], board: Card[]): number {
  const aCards = [...playerA, ...board]
  const bCards = [...playerB, ...board]
  return compareHandRank(bestHandFromHoleAndBoard(aCards), bestHandFromHoleAndBoard(bCards))
}

/** 1 = A 赢，-1 = B 赢，0 = 平局 */
function compareShowdown(playerA: Card[], playerB: Card[], board5: Card[]): number {
  const a7 = [...playerA, ...board5]
  const b7 = [...playerB, ...board5]
  return compareHandRank(bestHandFrom7(a7), bestHandFrom7(b7))
}

function remainingDeckHoldem(used: Card[]): Card[] {
  const usedSet = new Set(used.map((c) => c.code))
  return buildDeck('holdem').filter((c) => !usedSet.has(c.code))
}

function forEachCombination(deck: Card[], k: number, fn: (combo: Card[]) => void): void {
  const n = deck.length
  if (k < 0 || k > n) {
    return
  }
  const idx: number[] = []
  function dfs(start: number, depth: number) {
    if (depth === k) {
      fn(idx.map((i) => deck[i]!))
      return
    }
    for (let i = start; i <= n - (k - depth); i++) {
      idx[depth] = i
      dfs(i + 1, depth + 1)
    }
  }
  dfs(0, 0)
}

type HoldemEnumResult = {
  total: number
  underdogWins: number
  ties: number
}

/** 当前街：下一张公共牌发出后，落后方是否已严格领先（不含仅未来才有机会）。 */
function countHoldemDirectOuts(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
): number {
  if (board.length >= 5) {
    return 0
  }
  const deck = remainingDeckHoldem([...playerA, ...playerB, ...board])
  let count = 0
  for (const c of deck) {
    const nextBoard = [...board, c]
    const cmp = comparePartialShowdown(playerA, playerB, nextBoard)
    if (cmp === 0) {
      continue
    }
    const winner: Player = cmp > 0 ? 'A' : 'B'
    if (winner === underdog) {
      count += 1
    }
  }
  return count
}

function enumerateHoldem(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
): HoldemEnumResult {
  const deck = remainingDeckHoldem([...playerA, ...playerB, ...board])
  const k = 5 - board.length

  if (k <= 0) {
    const cmp = compareShowdown(playerA, playerB, board)
    let underdogWins = 0
    let ties = 0
    if (cmp === 0) {
      ties = 1
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        underdogWins = 1
      }
    }
    return { total: 1, underdogWins, ties }
  }

  let total = 0
  let underdogWins = 0
  let ties = 0

  forEachCombination(deck, k, (combo) => {
    const board5 = [...board, ...combo]
    total += 1
    const cmp = compareShowdown(playerA, playerB, board5)
    if (cmp === 0) {
      ties += 1
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        underdogWins += 1
      }
    }
  })

  return { total, underdogWins, ties }
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

  if (gameType === 'holdem') {
    const bl = board.length
    if (bl !== 0 && bl !== 3 && bl !== 4 && bl !== 5) {
      errors.push('德州扑克公共牌数量仅允许 0、3、4、5 张（不允许 1 或 2 张）')
    }
  } else if (board.length > 5) {
    /* covered above */
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
    `${result.outsDisplayLabel}：${result.outs}`,
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
  const underdog = input.leader === 'A' ? 'B' : 'A'

  const holdemAlgoStatus =
    '德州扑克保险命中概率已使用完整 runout 枚举；outs 显示为当前街下一张直接反超牌数。奥马哈和短牌仍待后续阶段接入。'
  const frameworkStatus = '当前为计算框架与基础估算，精确枚举算法待下一阶段接入'

  let outs: number
  let hitProbability: number
  let algorithmStatus: string
  let outsDisplayLabel: string

  if (input.gameType === 'holdem') {
    const enumResult = enumerateHoldem(underdog, playerA, playerB, board)
    outs = countHoldemDirectOuts(underdog, playerA, playerB, board)
    hitProbability = enumResult.total > 0 ? enumResult.underdogWins / enumResult.total : 0
    if (board.length >= 5) {
      algorithmStatus = `${holdemAlgoStatus}河牌已完成，无后续 outs。`
    } else {
      algorithmStatus = holdemAlgoStatus
    }
    outsDisplayLabel = '当前街直接 outs'
  } else {
    outs = estimateOuts(input.gameType, input.leader, playerA, playerB, board)
    hitProbability = calculateHitProbability(outs, remainingCards)
    algorithmStatus = frameworkStatus
    outsDisplayLabel = '框架估算 outs'
  }

  const defaultOdds = getDefaultOdds(input.gameType, outs)
  const breakEvenInsurance = calculateBreakEvenInsurance(input.allInAmount, defaultOdds)
  const fullPotInsurance = calculateFullPotInsurance(input.potAmount, defaultOdds)
  const advice = defaultOdds
    ? '可按默认赔率参考买保本或买满池，最终以现场确认赔率为准'
    : '默认赔率待确认，暂不建议按本工具直接定价'

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
    outsDisplayLabel,
  }
  const result: InsuranceResult = {
    ...resultBase,
    resultText: buildResultText(resultBase as InsuranceResult),
  }

  return { errors: [], result }
}
