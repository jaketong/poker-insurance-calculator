export type GameType = 'holdem' | 'omaha' | 'shortDeck'
export type Player = 'A' | 'B'
export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type Card = {
  rank: string
  suit: string
  code: string
}

export type OddsValue = number | null

export type HoldemPreflopPairInsurance = 'setMining45' | 'overtake35'

export type InsuranceInput = {
  gameType: GameType
  playerAInput: string
  playerBInput: string
  boardInput: string
  leader: Player
  street: Street
  potAmount: number
  allInAmount: number
  /** 翻前对子 vs 对子：中暗三 4.5 / 普通反超 3.5（仅满足场景时有效） */
  holdemPreflopPairInsurance?: HoldemPreflopPairInsurance
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
  oddsLineLabel: string
  leaderHandDisplay?: string
  underdogHandDisplay?: string
  boardDisplay?: string
  holdemPreflopPairSpecial?: HoldemPreflopPairInsurance | null
  holdemInsuranceTypeLabel?: string | null
  holdemSetMiningCardsDisplay?: string | null
  holdemPairRuleHint?: string | null
}

export const gameLabels: Record<GameType, string> = {
  holdem: '德州扑克',
  omaha: '奥马哈',
  shortDeck: '短牌',
}

/** UI/复制中德州游戏名统一用此常量 */
export const HOLDEM_GAME_NAME = '德州扑克'

const rankSets: Record<GameType, string[]> = {
  holdem: ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
  omaha: ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
  shortDeck: ['6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
}

const suits = ['h', 's', 'd', 'c']

const SUIT_SYMBOL: Record<string, string> = {
  h: '♥',
  s: '♠',
  d: '♦',
  c: '♣',
}

export function formatCardCodeForDisplay(code: string): string {
  const c = code.trim()
  if (c.length !== 2) {
    return code
  }
  const rank = c[0]?.toUpperCase() ?? ''
  const suit = c[1]?.toLowerCase() ?? ''
  const sym = SUIT_SYMBOL[suit] ?? suit
  return `${rank}${sym}`
}

/** 德州选牌器：点数自上而下展示顺序 */
export const HOLDEM_GRID_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const

export const holdemOddsTable: Record<number, number> = {
  1: 30,
  2: 15,
  3: 10,
  4: 8,
  5: 6,
  6: 5,
  7: 4,
  8: 3,
  9: 3,
  10: 2.5,
  11: 2.5,
  12: 2,
  13: 2,
  14: 1.5,
  15: 1.5,
  16: 1,
  17: 1,
  18: 1,
  19: 1,
  20: 1,
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

function nChooseK(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0
  }
  if (k === 0 || k === n) {
    return 1
  }
  const kk = Math.min(k, n - k)
  let acc = 1
  for (let i = 1; i <= kk; i++) {
    acc = (acc * (n - kk + i)) / i
  }
  return acc
}

/** 无放回：deck 张牌中含 goods 张命中牌，均匀抽取 draw 张，至少抽到一张命中牌的概率 */
function probAtLeastOneGoodInDraw(deckSize: number, goods: number, draw: number): number {
  if (goods <= 0 || draw <= 0 || deckSize <= 0 || draw > deckSize) {
    return 0
  }
  const bad = deckSize - goods
  if (draw > bad) {
    return 1
  }
  return 1 - nChooseK(bad, draw) / nChooseK(deckSize, draw)
}

function isPocketPairCards(hand: Card[]): boolean {
  return hand.length === 2 && hand[0]!.rank === hand[1]!.rank
}

/**
 * 翻前、公共牌 0、双方均为口袋对子（德州）。
 * 用于中暗三 4.5 / 普通反超 3.5 特殊保险；与领先方指定无关。
 */
export function isHoldemPreflopPairVsPairScenario(
  gameType: GameType,
  street: Street,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
): boolean {
  return (
    gameType === 'holdem' &&
    street === 'preflop' &&
    board.length === 0 &&
    isPocketPairCards(playerA) &&
    isPocketPairCards(playerB)
  )
}

/** 落后方口袋对子在牌局中尚未出现的两张同点数牌（保险命中牌） */
function underdogSetMiningCodes(underdog: Player, playerA: Card[], playerB: Card[]): string[] {
  const ug = underdog === 'A' ? playerA : playerB
  if (!isPocketPairCards(ug)) {
    return []
  }
  const used = new Set<string>([...playerA, ...playerB].map((c) => c.code))
  const r = ug[0]!.rank
  const out: string[] = []
  for (const suit of suits) {
    const code = `${r}${suit}`
    if (!used.has(code)) {
      out.push(code)
    }
  }
  return out.sort()
}

function formatCardSpaceStringForDisplay(spaceSeparated: string): string {
  return parseCards(spaceSeparated)
    .map((card) => formatCardCodeForDisplay(card.code))
    .join(' ')
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
  return odds ? `${odds}倍` : '待确认'
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/** 德州结果卡片底部说明 / 复制文案末行 */
export const HOLDEM_RESULT_FOOTER =
  '概率按完整 runout 枚举，赔率为默认参考表，现场可调整。'

export function collectHoldemResultLines(
  result: InsuranceResult,
  opts?: { customBuyText?: string; potAmount?: number },
): string[] {
  const boardLine = result.boardDisplay?.trim() ? result.boardDisplay : '（无）'
  const hitProbLine =
    result.holdemPreflopPairSpecial === 'overtake35'
      ? '命中概率：固定赔率'
      : `命中概率：${formatPercent(result.hitProbability)}`
  const lines = [
    `【${HOLDEM_GAME_NAME}保险计算】`,
    `领先方：${result.leaderHandDisplay ?? ''}`,
    `落后方：${result.underdogHandDisplay ?? ''}`,
    `公共牌：${boardLine}`,
    `${result.outsDisplayLabel}：${result.outs}`,
    hitProbLine,
    `${result.oddsLineLabel}：${formatOdds(result.defaultOdds)}`,
  ]
  if (result.holdemInsuranceTypeLabel) {
    lines.push(`保险类型：${result.holdemInsuranceTypeLabel}`)
  }
  if (result.holdemSetMiningCardsDisplay) {
    lines.push(`命中牌：${result.holdemSetMiningCardsDisplay}`)
  }
  if (result.holdemPairRuleHint) {
    lines.push(result.holdemPairRuleHint)
  }
  lines.push(`买保本：${formatAmount(result.breakEvenInsurance)}`)
  lines.push(`买满池：${formatAmount(result.fullPotInsurance)}`)
  const t = (opts?.customBuyText ?? '').trim()
  const pot = opts?.potAmount
  if (t !== '' && pot !== undefined && Number.isFinite(pot) && pot > 0) {
    const n = Number(t)
    if (Number.isFinite(n) && n > 0) {
      lines.push(`自定义保额：${n}`)
      const odds = result.defaultOdds
      if (!odds || odds <= 0) {
        lines.push('预计赔付：待确认')
        lines.push('状态：待确认')
      } else {
        const payout = n * odds
        lines.push(`预计赔付：${payout.toFixed(2)}`)
        if (payout > pot) {
          lines.push(`超过总底池，最多可买 ${formatAmount(result.fullPotInsurance)}`)
          lines.push('状态：不可买')
        } else {
          lines.push('状态：可买')
        }
      }
    }
  }
  if (result.holdemPreflopPairSpecial === 'setMining45') {
    lines.push('命中概率按河牌前 5 张公共牌中是否出现保险牌估算；赔率固定 4.5 倍，现场可调整。')
  } else if (result.holdemPreflopPairSpecial === 'overtake35') {
    lines.push('赔率固定 3.5 倍（普通反超保险），现场可调整。')
  } else {
    lines.push(HOLDEM_RESULT_FOOTER)
  }
  return lines
}

export function buildHoldemClipboardText(
  result: InsuranceResult,
  customBuyText: string,
  potAmount: number,
): string {
  return collectHoldemResultLines(result, { customBuyText, potAmount }).join('\n')
}

export function buildResultText(result: InsuranceResult): string {
  const oddsLabel = result.oddsLineLabel ?? '默认赔率'
  if (result.gameType === 'holdem' && result.leaderHandDisplay !== undefined) {
    return collectHoldemResultLines(result).join('\n')
  }

  return [
    `【${gameLabels[result.gameType]}保险计算】`,
    `领先方：玩家 ${result.leader}`,
    `落后方：玩家 ${result.underdog}`,
    `${result.outsDisplayLabel}：${result.outs}`,
    `保险命中概率：${formatPercent(result.hitProbability)}`,
    `${oddsLabel}：${formatOdds(result.defaultOdds)}`,
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

  if (input.potAmount > 0 && input.allInAmount > input.potAmount) {
    errors.push('领先方本次 All-in 投入不能大于总底池')
  }

  if (input.gameType === 'holdem') {
    if (input.street === 'river') {
      errors.push('德州扑克不能选择河牌买保险')
    }
    if (input.street === 'preflop' && board.length !== 0) {
      errors.push('翻前公共牌必须为 0 张')
    }
    if (input.street === 'flop' && board.length !== 3) {
      errors.push('翻牌公共牌必须为 3 张')
    }
    if (input.street === 'turn' && board.length !== 4) {
      errors.push('转牌公共牌必须为 4 张')
    }
  }

  if (errors.length > 0) {
    return { errors, result: null }
  }

  const usedCards = [...playerA, ...playerB, ...board]
  const remainingCards = buildDeck(input.gameType).length - usedCards.length
  const underdog = input.leader === 'A' ? 'B' : 'A'

  const holdemAlgoShort = HOLDEM_RESULT_FOOTER
  const frameworkStatus = '当前为计算框架与基础估算，精确枚举算法待下一阶段接入'

  const pairVsPair =
    input.gameType === 'holdem' &&
    isHoldemPreflopPairVsPairScenario(input.gameType, input.street, playerA, playerB, board)

  /** 翻前对子 vs 对子特殊保险（4.5 / 3.5）均不跑完整河牌枚举 */
  const skipFullHoldemRunoutEnum = pairVsPair

  let outs: number
  let hitProbability: number
  let algorithmStatus: string
  let outsDisplayLabel: string

  if (input.gameType === 'holdem') {
    if (skipFullHoldemRunoutEnum) {
      outs = countHoldemDirectOuts(underdog, playerA, playerB, board)
      hitProbability = 0
      if (board.length >= 5) {
        algorithmStatus = `河牌已完成，无后续 outs。${holdemAlgoShort}`
      } else {
        algorithmStatus = holdemAlgoShort
      }
      outsDisplayLabel = '当前街直接 outs'
    } else {
      const enumResult = enumerateHoldem(underdog, playerA, playerB, board)
      outs = countHoldemDirectOuts(underdog, playerA, playerB, board)
      hitProbability = enumResult.total > 0 ? enumResult.underdogWins / enumResult.total : 0
      if (board.length >= 5) {
        algorithmStatus = `河牌已完成，无后续 outs。${holdemAlgoShort}`
      } else {
        algorithmStatus = holdemAlgoShort
      }
      outsDisplayLabel = '当前街直接 outs'
    }
  } else {
    outs = estimateOuts(input.gameType, input.leader, playerA, playerB, board)
    hitProbability = calculateHitProbability(outs, remainingCards)
    algorithmStatus = frameworkStatus
    outsDisplayLabel = '框架估算 outs'
  }

  let holdemPreflopPairSpecial: HoldemPreflopPairInsurance | null = null
  let holdemInsuranceTypeLabel: string | null = null
  let holdemSetMiningCardsDisplay: string | null = null
  let holdemPairRuleHint: string | null = null

  let defaultOdds: OddsValue

  if (pairVsPair) {
    holdemPreflopPairSpecial = input.holdemPreflopPairInsurance ?? 'setMining45'
    outsDisplayLabel = 'OUTS'
    if (holdemPreflopPairSpecial === 'setMining45') {
      defaultOdds = 4.5
      const deckAfterHole = 52 - 4
      hitProbability = probAtLeastOneGoodInDraw(deckAfterHole, 2, 5)
      outs = 2
      holdemInsuranceTypeLabel = '中暗三保险'
      const codes = underdogSetMiningCodes(underdog, playerA, playerB)
      holdemSetMiningCardsDisplay = codes.map(formatCardCodeForDisplay).join(' ')
      holdemPairRuleHint = '中暗三保险：公共牌发出落后方对子剩余牌即赔付。'
      algorithmStatus = `${holdemPairRuleHint} 命中概率按河牌前 5 张公共牌中是否出现保险牌估算；赔率固定 4.5 倍，现场可调整。`
    } else {
      defaultOdds = 3.5
      holdemInsuranceTypeLabel = '普通反超保险'
      holdemSetMiningCardsDisplay = null
      holdemPairRuleHint = '普通反超保险，保障到河牌'
      hitProbability = 0
      algorithmStatus = `${holdemPairRuleHint} 赔率固定 3.5 倍，现场可调整。`
    }
  } else {
    defaultOdds = getDefaultOdds(input.gameType, outs)
  }

  const breakEvenInsurance = calculateBreakEvenInsurance(input.allInAmount, defaultOdds)
  const fullPotInsurance = calculateFullPotInsurance(input.potAmount, defaultOdds)

  let advice: string
  if (input.gameType === 'holdem') {
    if (pairVsPair && holdemPreflopPairSpecial === 'setMining45') {
      advice = defaultOdds
        ? '中暗三保险：公共牌发出落后方对子剩余牌即赔付；可参考买保本、买满池，现场定价为准。'
        : '赔率待确认，金额仅供参考。'
    } else if (pairVsPair && holdemPreflopPairSpecial === 'overtake35') {
      advice = defaultOdds
        ? '普通反超保险：保障到河牌，落后方最终反超才赔付；可参考买保本、买满池，现场定价为准。'
        : '赔率待确认，金额仅供参考。'
    } else {
      advice = defaultOdds ? '可参考买保本、买满池，现场定价为准。' : '赔率待确认，金额仅供参考。'
    }
  } else if (defaultOdds) {
    advice = '可按默认赔率参考买保本或买满池，最终以现场确认赔率为准'
  } else {
    advice = '默认赔率待确认，暂不建议按本工具直接定价'
  }

  const oddsLineLabel =
    input.gameType === 'holdem' && pairVsPair ? '赔率' : input.gameType === 'holdem' ? '自动匹配赔率' : '默认赔率'
  const leaderHandDisplay =
    input.gameType === 'holdem' ? formatCardSpaceStringForDisplay(input.playerAInput) : undefined
  const underdogHandDisplay =
    input.gameType === 'holdem' ? formatCardSpaceStringForDisplay(input.playerBInput) : undefined
  const boardDisplay =
    input.gameType === 'holdem' ? formatCardSpaceStringForDisplay(input.boardInput) : undefined

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
    oddsLineLabel,
    leaderHandDisplay,
    underdogHandDisplay,
    boardDisplay,
    holdemPreflopPairSpecial,
    holdemInsuranceTypeLabel,
    holdemSetMiningCardsDisplay,
    holdemPairRuleHint,
  }
  const result: InsuranceResult = {
    ...resultBase,
    resultText: buildResultText(resultBase as InsuranceResult),
  }

  return { errors: [], result }
}
