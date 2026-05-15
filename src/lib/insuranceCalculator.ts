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
  /** 奥马哈结果卡片使用与德州类似的紧凑布局 */
  omahaCompactLayout?: boolean
  /** 短牌结果卡片使用与德州/奥马哈类似的紧凑布局 */
  shortDeckCompactLayout?: boolean
  /** 下一张公共牌直接反超的牌（已排序展示）；无则 UI 显示「无」 */
  directOutCardCodesDisplay?: string
  /** 下一张公共牌可导致平分的牌（已排序展示）；无则 UI 显示「无」 */
  chopOutCardCodesDisplay?: string
  /** 下一张公共牌可导致平分的去重张数（不计入基础 outs） */
  chopOutsCount?: number
}

/** 奥马哈「按反超类型拆分购买」牌型分类（落后方最终成牌 / 平分） */
export type OmahaSplitCategoryId =
  | 'straightFlush'
  | 'fourKind'
  | 'fullHouse'
  | 'flush'
  | 'straight'
  | 'trips'
  | 'twoPair'
  | 'onePair'
  | 'highCard'
  | 'tie'

export const OMAHA_SPLIT_PURCHASE_OPTIONS: { id: OmahaSplitCategoryId; label: string }[] = [
  { id: 'straightFlush', label: '同花顺' },
  { id: 'fourKind', label: '四条' },
  { id: 'fullHouse', label: '葫芦' },
  { id: 'flush', label: '同花' },
  { id: 'straight', label: '顺子' },
  { id: 'trips', label: '三条' },
  { id: 'twoPair', label: '两对' },
  { id: 'onePair', label: '一对' },
  { id: 'highCard', label: '高张' },
  { id: 'tie', label: '平分' },
]

/** 短牌拆分购买 chip 顺序：同花顺＞四条＞同花＞葫芦＞顺子＞…（牌力顺序） */
export const SHORT_DECK_SPLIT_PURCHASE_OPTIONS: { id: OmahaSplitCategoryId; label: string }[] = [
  { id: 'straightFlush', label: '同花顺' },
  { id: 'fourKind', label: '四条' },
  { id: 'flush', label: '同花' },
  { id: 'fullHouse', label: '葫芦' },
  { id: 'straight', label: '顺子' },
  { id: 'trips', label: '三条' },
  { id: 'twoPair', label: '两对' },
  { id: 'onePair', label: '一对' },
  { id: 'highCard', label: '高张' },
  { id: 'tie', label: '平分' },
]

/** 将 5 张牌 evaluate5Cards 主分类映射为拆分购买类型（与奥马哈最终 5 张牌力一致） */
function omahaSplitCategoryFromHandRank(h: HandRank): OmahaSplitCategoryId {
  const c = h[0] ?? 0
  if (c === 8) {
    return 'straightFlush'
  }
  if (c === 7) {
    return 'fourKind'
  }
  if (c === 6) {
    return 'fullHouse'
  }
  if (c === 5) {
    return 'flush'
  }
  if (c === 4) {
    return 'straight'
  }
  if (c === 3) {
    return 'trips'
  }
  if (c === 2) {
    return 'twoPair'
  }
  if (c === 1) {
    return 'onePair'
  }
  return 'highCard'
}

function underdogHoleCards(underdog: Player, playerA: Card[], playerB: Card[]): Card[] {
  return underdog === 'A' ? playerA : playerB
}

/**
 * 枚举下一张公共牌 code → 该牌下可能出现的反超/平分类型（对同一 code 用 Set 去重类型）。
 * 翻牌：下一張转牌；转牌：下一張河牌。
 */
function buildOmahaNextCardCategoryMap(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
  street: 'flop' | 'turn',
): Map<string, Set<OmahaSplitCategoryId>> {
  const nextToCats = new Map<string, Set<OmahaSplitCategoryId>>()
  const udHole = underdogHoleCards(underdog, playerA, playerB)

  function addCat(nextCode: string, cat: OmahaSplitCategoryId) {
    let s = nextToCats.get(nextCode)
    if (!s) {
      s = new Set()
      nextToCats.set(nextCode, s)
    }
    s.add(cat)
  }

  const baseUsed = [...playerA, ...playerB, ...board]
  const deck = remainingDeckOmaha(baseUsed)

  if (street === 'flop' && board.length === 3) {
    for (const turn of deck) {
      const board4 = [...board, turn]
      const cmp = compareOmahaPartialShowdown(playerA, playerB, board4)
      if (cmp === 0) {
        addCat(turn.code, 'tie')
      } else {
        const winner: Player = cmp > 0 ? 'A' : 'B'
        if (winner === underdog) {
          const hr = evaluateOmahaHandFlexible(udHole, board4)
          addCat(turn.code, omahaSplitCategoryFromHandRank(hr))
        }
      }
    }
    return nextToCats
  }

  if (street === 'turn' && board.length === 4) {
    for (const river of deck) {
      const board5 = [...board, river]
      const cmp = compareOmahaShowdown(playerA, playerB, board5)
      if (cmp === 0) {
        addCat(river.code, 'tie')
      } else {
        const winner: Player = cmp > 0 ? 'A' : 'B'
        if (winner === underdog) {
          const hr = evaluateOmahaHand(udHole, board5)
          addCat(river.code, omahaSplitCategoryFromHandRank(hr))
        }
      }
    }
    return nextToCats
  }

  return nextToCats
}

export type OmahaSplitSelectionMetrics = {
  /** 下一张牌维度说明 */
  nextStreetLabel: '转牌' | '河牌'
  /** 每种类型对应的去重下一张牌张数（类型间可重叠） */
  outsByCategory: Partial<Record<OmahaSplitCategoryId, number>>
  /** 勾选类型的下一张牌并集大小（反超与平分合并去重，用于所选赔率） */
  selectedOuts: number
  /** 勾选并集对应默认赔率 */
  selectedOdds: OddsValue
  /** 并集 codes（排序，便于调试/展示） */
  unionCodes: string[]
  /** 可出现平分的下一张牌去重张数（不计入基础 OUTS） */
  tieOutsCount: number
  /** 勾选的非平分类型对应下一张牌并集张数 */
  selectedWinTypesUnionCount: number
  /** 各类型对应下一张牌明细（与直接 OUTS 口径一致） */
  categoryCardsDisplay: Partial<Record<OmahaSplitCategoryId, string>>
}

function finalizeSplitPurchaseMetrics(
  gameType: 'holdem' | 'omaha' | 'shortDeck',
  nextToCats: Map<string, Set<OmahaSplitCategoryId>>,
  street: 'flop' | 'turn',
  uniqSelected: OmahaSplitCategoryId[],
): OmahaSplitSelectionMetrics {
  const outsByCategory: Partial<Record<OmahaSplitCategoryId, number>> = {}
  for (const id of uniqSelected) {
    let n = 0
    for (const [, cats] of nextToCats) {
      if (cats.has(id)) {
        n += 1
      }
    }
    outsByCategory[id] = n
  }

  const union = new Set<string>()
  for (const [code, cats] of nextToCats) {
    for (const sel of uniqSelected) {
      if (cats.has(sel)) {
        union.add(code)
        break
      }
    }
  }

  const nonTieSelected = uniqSelected.filter((id) => id !== 'tie')
  const winPickUnion = new Set<string>()
  for (const [code, cats] of nextToCats) {
    for (const id of nonTieSelected) {
      if (cats.has(id)) {
        winPickUnion.add(code)
        break
      }
    }
  }

  let tieOutsCount = 0
  for (const [, cats] of nextToCats) {
    if (cats.has('tie')) {
      tieOutsCount += 1
    }
  }

  const selectedOuts = union.size
  const selectedOdds = getDefaultOdds(gameType, selectedOuts)

  const categoryCardsDisplay: Partial<Record<OmahaSplitCategoryId, string>> = {}
  for (const opt of OMAHA_SPLIT_PURCHASE_OPTIONS) {
    const codes: string[] = []
    for (const [code, cats] of nextToCats) {
      if (cats.has(opt.id)) {
        codes.push(code)
      }
    }
    const uniqSorted = [...new Set(codes)].sort()
    if (uniqSorted.length > 0) {
      categoryCardsDisplay[opt.id] = uniqSorted.map(formatCardCodeForDisplay).join(' ')
    }
  }

  return {
    nextStreetLabel: street === 'flop' ? '转牌' : '河牌',
    outsByCategory,
    selectedOuts,
    selectedOdds,
    unionCodes: [...union].sort(),
    tieOutsCount,
    selectedWinTypesUnionCount: winPickUnion.size,
    categoryCardsDisplay,
  }
}

/**
 * 按勾选类型计算：各类型 outs（按 code）、去重总 outs、所选赔率（沿用 omaha 赔率表，不按类型改表）。
 */
export function computeOmahaSplitSelectionMetrics(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
  street: 'flop' | 'turn',
  selected: OmahaSplitCategoryId[],
): OmahaSplitSelectionMetrics | null {
  const uniqSelected = [...new Set(selected)]
  if (uniqSelected.length === 0) {
    return null
  }
  if (street === 'flop' && board.length !== 3) {
    return null
  }
  if (street === 'turn' && board.length !== 4) {
    return null
  }

  const nextToCats = buildOmahaNextCardCategoryMap(underdog, playerA, playerB, board, street)
  return finalizeSplitPurchaseMetrics('omaha', nextToCats, street, uniqSelected)
}

/**
 * 德州普通翻牌 / 转牌：下一张公共牌 code → 可能出现的反超 / 平分类型（与奥马哈相同去重语义）。
 */
function buildHoldemNextCardCategoryMap(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
  street: 'flop' | 'turn',
): Map<string, Set<OmahaSplitCategoryId>> {
  const nextToCats = new Map<string, Set<OmahaSplitCategoryId>>()
  const udHole = underdogHoleCards(underdog, playerA, playerB)

  function addCat(nextCode: string, cat: OmahaSplitCategoryId) {
    let s = nextToCats.get(nextCode)
    if (!s) {
      s = new Set()
      nextToCats.set(nextCode, s)
    }
    s.add(cat)
  }

  const baseUsed = [...playerA, ...playerB, ...board]
  const deck = remainingDeckHoldem(baseUsed)

  if (street === 'flop' && board.length === 3) {
    for (const turn of deck) {
      const board4 = [...board, turn]
      const cmp = comparePartialShowdown(playerA, playerB, board4)
      if (cmp === 0) {
        addCat(turn.code, 'tie')
      } else {
        const winner: Player = cmp > 0 ? 'A' : 'B'
        if (winner === underdog) {
          const hr = bestHandFrom6([...udHole, ...board4])
          addCat(turn.code, omahaSplitCategoryFromHandRank(hr))
        }
      }
    }
    return nextToCats
  }

  if (street === 'turn' && board.length === 4) {
    for (const river of deck) {
      const board5 = [...board, river]
      const cmp = compareShowdown(playerA, playerB, board5)
      if (cmp === 0) {
        addCat(river.code, 'tie')
      } else {
        const winner: Player = cmp > 0 ? 'A' : 'B'
        if (winner === underdog) {
          const hr = bestHandFrom7([...udHole, ...board5])
          addCat(river.code, omahaSplitCategoryFromHandRank(hr))
        }
      }
    }
    return nextToCats
  }

  return nextToCats
}

/** 德州普通翻牌 / 转牌拆分购买指标（结构与奥马哈一致，赔率走 holdem 表）。 */
export type HoldemSplitSelectionMetrics = OmahaSplitSelectionMetrics

export function computeHoldemSplitSelectionMetrics(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
  street: 'flop' | 'turn',
  selected: OmahaSplitCategoryId[],
): HoldemSplitSelectionMetrics | null {
  const uniqSelected = [...new Set(selected)]
  if (uniqSelected.length === 0) {
    return null
  }
  if (street === 'flop' && board.length !== 3) {
    return null
  }
  if (street === 'turn' && board.length !== 4) {
    return null
  }

  const nextToCats = buildHoldemNextCardCategoryMap(underdog, playerA, playerB, board, street)
  return finalizeSplitPurchaseMetrics('holdem', nextToCats, street, uniqSelected)
}

function buildShortDeckNextCardCategoryMap(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
  street: 'flop' | 'turn',
): Map<string, Set<OmahaSplitCategoryId>> {
  const nextToCats = new Map<string, Set<OmahaSplitCategoryId>>()
  const udHole = underdogHoleCards(underdog, playerA, playerB)

  function addCat(nextCode: string, cat: OmahaSplitCategoryId) {
    let s = nextToCats.get(nextCode)
    if (!s) {
      s = new Set()
      nextToCats.set(nextCode, s)
    }
    s.add(cat)
  }

  const baseUsed = [...playerA, ...playerB, ...board]
  const deck = remainingDeckShortDeck(baseUsed)

  if (street === 'flop' && board.length === 3) {
    for (const turn of deck) {
      const board4 = [...board, turn]
      const cmp = comparePartialShowdownShortDeck(playerA, playerB, board4)
      if (cmp === 0) {
        addCat(turn.code, 'tie')
      } else {
        const winner: Player = cmp > 0 ? 'A' : 'B'
        if (winner === underdog) {
          const hr = bestHandFrom6ShortDeck([...udHole, ...board4])
          addCat(turn.code, shortDeckSplitCategoryFromHandRank(hr))
        }
      }
    }
    return nextToCats
  }

  if (street === 'turn' && board.length === 4) {
    for (const river of deck) {
      const board5 = [...board, river]
      const cmp = compareShowdownShortDeck(playerA, playerB, board5)
      if (cmp === 0) {
        addCat(river.code, 'tie')
      } else {
        const winner: Player = cmp > 0 ? 'A' : 'B'
        if (winner === underdog) {
          const hr = bestHandFrom7ShortDeck([...udHole, ...board5])
          addCat(river.code, shortDeckSplitCategoryFromHandRank(hr))
        }
      }
    }
    return nextToCats
  }

  return nextToCats
}

export function computeShortDeckSplitSelectionMetrics(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
  street: 'flop' | 'turn',
  selected: OmahaSplitCategoryId[],
): OmahaSplitSelectionMetrics | null {
  const uniqSelected = [...new Set(selected)]
  if (uniqSelected.length === 0) {
    return null
  }
  if (street === 'flop' && board.length !== 3) {
    return null
  }
  if (street === 'turn' && board.length !== 4) {
    return null
  }

  const nextToCats = buildShortDeckNextCardCategoryMap(underdog, playerA, playerB, board, street)
  return finalizeSplitPurchaseMetrics('shortDeck', nextToCats, street, uniqSelected)
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

/** 短牌选牌器：点数自上而下展示顺序（36 张：6–A） */
export const SHORT_DECK_GRID_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6'] as const

/** 德州扑克普通 OUTS 默认赔率表（版本 B）；16 outs 及以上不在表中，由 getDefaultOdds 返回 null，界面显示「待确认」。 */
export const holdemOddsTable: Record<number, number> = {
  1: 30,
  2: 15,
  3: 10,
  4: 8,
  5: 6,
  6: 5,
  7: 4,
  8: 3.5,
  9: 3,
  10: 2.5,
  11: 2.2,
  12: 2,
  13: 1.8,
  14: 1.6,
  15: 1.4,
}

/** 奥马哈默认赔率表（用户确认版）；31 outs 及以上不在表中，由 getDefaultOdds 返回 null，界面显示「待确认」。 */
export const omahaOddsTable: Record<number, OddsValue> = {
  1: 24,
  2: 12,
  3: 8,
  4: 6,
  5: 4.5,
  6: 4,
  7: 3.2,
  8: 2.7,
  9: 2.3,
  10: 2,
  11: 1.7,
  12: 1.5,
  13: 1.3,
  14: 1.2,
  15: 1.1,
  16: 1,
  17: 0.8,
  18: 0.7,
  19: 0.6,
  20: 0.5,
  21: 0.5,
  22: 0.5,
  23: 0.5,
  24: 0.5,
  25: 0.5,
  26: 0.5,
  27: 0.5,
  28: 0.5,
  29: 0.5,
  30: 0.5,
}

export const shortDeckOddsTable: Record<number, OddsValue> = {
  1: 30,
  2: 15,
  3: 10,
  4: 8,
  5: 6,
  6: 5,
  7: 4,
  8: 3.5,
  9: 3,
  10: 2.5,
  11: 2.2,
  12: 2,
  13: 1.8,
  14: 1.6,
  15: 1.4,
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

/** 短牌 5 张：编码 8 同花顺 > 7 四条 > 6 同花 > 5 葫芦 > 4 顺子 > 3 三条 > 2 两对 > 1 一对 > 0 高张；含 A6789 顺子。 */
function evaluate5CardsShortDeck(cards: Card[]): HandRank {
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

  const isWheelShort =
    uniqueSorted.length === 5 &&
    uniqueSorted[0] === 6 &&
    uniqueSorted[1] === 7 &&
    uniqueSorted[2] === 8 &&
    uniqueSorted[3] === 9 &&
    uniqueSorted[4] === 14

  let straightHigh = 0
  if (uniqueSorted.length === 5) {
    if (isWheelShort) {
      straightHigh = 9
    } else if (uniqueSorted[4]! - uniqueSorted[0]! === 4) {
      straightHigh = uniqueSorted[4]!
    }
  }
  const straight = straightHigh > 0

  if (flush && straight) {
    const cat = 8
    if (isWheelShort) {
      return [cat, 9] as const
    }
    if (straightHigh === 14) {
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
    return [5, groups[0]![0], groups[1]![0]] as const
  }

  if (flush) {
    return [6, ...vals] as const
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

function shortDeckSplitCategoryFromHandRank(h: HandRank): OmahaSplitCategoryId {
  const c = h[0] ?? 0
  if (c === 8) {
    return 'straightFlush'
  }
  if (c === 7) {
    return 'fourKind'
  }
  if (c === 6) {
    return 'flush'
  }
  if (c === 5) {
    return 'fullHouse'
  }
  if (c === 4) {
    return 'straight'
  }
  if (c === 3) {
    return 'trips'
  }
  if (c === 2) {
    return 'twoPair'
  }
  if (c === 1) {
    return 'onePair'
  }
  return 'highCard'
}

function bestHandFrom7ShortDeck(cards7: Card[]): HandRank {
  let best: HandRank | null = null
  for (const five of combinations5From7(cards7)) {
    const r = evaluate5CardsShortDeck(five)
    if (!best || compareHandRank(r, best) > 0) {
      best = r
    }
  }
  return best ?? [0]
}

function bestHandFrom6ShortDeck(cards6: Card[]): HandRank {
  let best: HandRank | null = null
  for (let omit = 0; omit < 6; omit++) {
    const five: Card[] = []
    for (let j = 0; j < 6; j++) {
      if (j !== omit) {
        five.push(cards6[j]!)
      }
    }
    const r = evaluate5CardsShortDeck(five)
    if (!best || compareHandRank(r, best) > 0) {
      best = r
    }
  }
  return best ?? [0]
}

function bestHandFromHoleAndBoardShortDeck(cards: Card[]): HandRank {
  const n = cards.length
  if (n === 7) {
    return bestHandFrom7ShortDeck(cards)
  }
  if (n === 6) {
    return bestHandFrom6ShortDeck(cards)
  }
  if (n === 5) {
    return evaluate5CardsShortDeck(cards)
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

function comparePartialShowdownShortDeck(playerA: Card[], playerB: Card[], board: Card[]): number {
  const aCards = [...playerA, ...board]
  const bCards = [...playerB, ...board]
  return compareHandRank(
    bestHandFromHoleAndBoardShortDeck(aCards),
    bestHandFromHoleAndBoardShortDeck(bCards),
  )
}

function compareShowdownShortDeck(playerA: Card[], playerB: Card[], board5: Card[]): number {
  return compareHandRank(
    bestHandFrom7ShortDeck([...playerA, ...board5]),
    bestHandFrom7ShortDeck([...playerB, ...board5]),
  )
}

function remainingDeckShortDeck(used: Card[]): Card[] {
  const usedSet = new Set(used.map((c) => c.code))
  return buildDeck('shortDeck').filter((c) => !usedSet.has(c.code))
}

/** 翻牌：runout 统计 + 下一张转牌直接反超 OUTS。 */
function enumerateShortDeckFlopWithOuts(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board3: Card[],
): {
  total: number
  underdogWins: number
  ties: number
  outs: number
  overtakeCardCodesSorted: string[]
  chopCardCodesSorted: string[]
} {
  const baseUsed = [...playerA, ...playerB, ...board3]
  const deck = remainingDeckShortDeck(baseUsed)
  const overtakeCardCodesSorted: string[] = []
  const chopCardCodesSorted: string[] = []
  for (const turn of deck) {
    const board4 = [...board3, turn]
    const cmp = comparePartialShowdownShortDeck(playerA, playerB, board4)
    if (cmp === 0) {
      chopCardCodesSorted.push(turn.code)
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        overtakeCardCodesSorted.push(turn.code)
      }
    }
  }
  overtakeCardCodesSorted.sort()
  chopCardCodesSorted.sort()

  let total = 0
  let underdogWins = 0
  let ties = 0
  const k = 5 - board3.length
  forEachCombination(deck, k, (combo) => {
    const board5 = [...board3, ...combo]
    total += 1
    const cmp = compareShowdownShortDeck(playerA, playerB, board5)
    if (cmp === 0) {
      ties += 1
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        underdogWins += 1
      }
    }
  })

  return {
    total,
    underdogWins,
    ties,
    outs: overtakeCardCodesSorted.length,
    overtakeCardCodesSorted,
    chopCardCodesSorted,
  }
}

/** 转牌：单张河牌枚举。 */
function enumerateShortDeckTurnWithOuts(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board4: Card[],
): {
  total: number
  underdogWins: number
  ties: number
  outs: number
  overtakeCardCodesSorted: string[]
  chopCardCodesSorted: string[]
} {
  const deck = remainingDeckShortDeck([...playerA, ...playerB, ...board4])
  const overtakeCardCodesSorted: string[] = []
  const chopCardCodesSorted: string[] = []
  let total = 0
  let underdogWins = 0
  let ties = 0
  for (const river of deck) {
    total += 1
    const board5 = [...board4, river]
    const cmp = compareShowdownShortDeck(playerA, playerB, board5)
    if (cmp === 0) {
      ties += 1
      chopCardCodesSorted.push(river.code)
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        underdogWins += 1
        overtakeCardCodesSorted.push(river.code)
      }
    }
  }
  overtakeCardCodesSorted.sort()
  chopCardCodesSorted.sort()
  return {
    total,
    underdogWins,
    ties,
    outs: overtakeCardCodesSorted.length,
    overtakeCardCodesSorted,
    chopCardCodesSorted,
  }
}

/** 奥马哈：4 张手牌 + 5 张公共牌，严格恰好 2 张来自手牌、3 张来自公共牌，取最佳 5 张牌力。 */
export function evaluateOmahaHand(playerCards: Card[], boardCards: Card[]): HandRank {
  if (playerCards.length !== 4 || boardCards.length !== 5) {
    return [0] as HandRank
  }
  let best: HandRank | null = null
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      const hole2 = [playerCards[a]!, playerCards[b]!]
      for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
          for (let k = j + 1; k < 5; k++) {
            const five: Card[] = [...hole2, boardCards[i]!, boardCards[j]!, boardCards[k]!]
            const r = evaluate5Cards(five)
            if (!best || compareHandRank(r, best) > 0) {
              best = r
            }
          }
        }
      }
    }
  }
  return best ?? ([0] as HandRank)
}

/** 1 = A 赢，-1 = B 赢，0 = 平局；奥马哈严格 2+3。 */
function compareOmahaShowdown(playerA: Card[], playerB: Card[], board5: Card[]): number {
  return compareHandRank(evaluateOmahaHand(playerA, board5), evaluateOmahaHand(playerB, board5))
}

/**
 * 奥马哈：公共牌 3 或 4 张时，严格 2 张手牌 + 3 张公共牌取最佳 5 张牌力。
 * 5 张公共牌时等价于 evaluateOmahaHand。
 */
function evaluateOmahaHandFlexible(playerCards: Card[], boardCards: Card[]): HandRank {
  if (playerCards.length !== 4) {
    return [0] as HandRank
  }
  const n = boardCards.length
  if (n === 5) {
    return evaluateOmahaHand(playerCards, boardCards)
  }
  if (n < 3) {
    return [0] as HandRank
  }
  let best: HandRank | null = null
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      const hole2 = [playerCards[a]!, playerCards[b]!]
      if (n === 3) {
        const five: Card[] = [...hole2, boardCards[0]!, boardCards[1]!, boardCards[2]!]
        const r = evaluate5Cards(five)
        if (!best || compareHandRank(r, best) > 0) {
          best = r
        }
      } else {
        for (let omit = 0; omit < 4; omit++) {
          const three = boardCards.filter((_, idx) => idx !== omit)
          const five: Card[] = [...hole2, three[0]!, three[1]!, three[2]!]
          const r = evaluate5Cards(five)
          if (!best || compareHandRank(r, best) > 0) {
            best = r
          }
        }
      }
    }
  }
  return best ?? ([0] as HandRank)
}

/** 1 = A 赢，-1 = B 赢，0 = 平局；奥马哈严格 2+3（公共牌 3 或 4 张）。 */
function compareOmahaPartialShowdown(playerA: Card[], playerB: Card[], board: Card[]): number {
  return compareHandRank(
    evaluateOmahaHandFlexible(playerA, board),
    evaluateOmahaHandFlexible(playerB, board),
  )
}

function remainingDeckOmaha(used: Card[]): Card[] {
  const usedSet = new Set(used.map((c) => c.code))
  return buildDeck('omaha').filter((c) => !usedSet.has(c.code))
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

/** 下一张公共牌发出后：严格反超的牌 code、平分的牌 code（各去重、排序）。 */
function collectHoldemNextCardOvertakeAndChopCodes(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board: Card[],
): { overtake: string[]; chop: string[] } {
  if (board.length >= 5) {
    return { overtake: [], chop: [] }
  }
  const deck = remainingDeckHoldem([...playerA, ...playerB, ...board])
  const overtake: string[] = []
  const chop: string[] = []
  for (const c of deck) {
    const nextBoard = [...board, c]
    const cmp = comparePartialShowdown(playerA, playerB, nextBoard)
    if (cmp === 0) {
      chop.push(c.code)
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        overtake.push(c.code)
      }
    }
  }
  return { overtake: [...new Set(overtake)].sort(), chop: [...new Set(chop)].sort() }
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

/** 翻牌（3 张公共牌）：一次 C(41,2) 枚举得到 runout 统计；「下一张有效 OUTS」仅看下一张转牌是否已严格反超。 */
function enumerateOmahaFlopWithOuts(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board3: Card[],
): {
  total: number
  underdogWins: number
  ties: number
  outs: number
  overtakeCardCodesSorted: string[]
  chopCardCodesSorted: string[]
} {
  const baseUsed = [...playerA, ...playerB, ...board3]
  const deck = remainingDeckOmaha(baseUsed)
  const overtakeCardCodesSorted: string[] = []
  const chopCardCodesSorted: string[] = []
  for (const turn of deck) {
    const board4 = [...board3, turn]
    const cmp = compareOmahaPartialShowdown(playerA, playerB, board4)
    if (cmp === 0) {
      chopCardCodesSorted.push(turn.code)
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        overtakeCardCodesSorted.push(turn.code)
      }
    }
  }
  overtakeCardCodesSorted.sort()
  chopCardCodesSorted.sort()

  let total = 0
  let underdogWins = 0
  let ties = 0
  forEachCombination(deck, 2, (combo) => {
    const turn = combo[0]!
    const river = combo[1]!
    const board5 = [...board3, turn, river]
    total += 1
    const cmp = compareOmahaShowdown(playerA, playerB, board5)
    if (cmp === 0) {
      ties += 1
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        underdogWins += 1
      }
    }
  })
  return {
    total,
    underdogWins,
    ties,
    outs: overtakeCardCodesSorted.length,
    overtakeCardCodesSorted,
    chopCardCodesSorted,
  }
}

/** 转牌（4 张公共牌）：单遍枚举河牌得统计与 OUTS（下一张河牌按 code 去重）。 */
function enumerateOmahaTurnWithOuts(
  underdog: Player,
  playerA: Card[],
  playerB: Card[],
  board4: Card[],
): {
  total: number
  underdogWins: number
  ties: number
  outs: number
  overtakeCardCodesSorted: string[]
  chopCardCodesSorted: string[]
} {
  const deck = remainingDeckOmaha([...playerA, ...playerB, ...board4])
  const overtakeCardCodesSorted: string[] = []
  const chopCardCodesSorted: string[] = []
  let total = 0
  let underdogWins = 0
  let ties = 0
  for (const river of deck) {
    total += 1
    const board5 = [...board4, river]
    const cmp = compareOmahaShowdown(playerA, playerB, board5)
    if (cmp === 0) {
      ties += 1
      chopCardCodesSorted.push(river.code)
    } else {
      const winner: Player = cmp > 0 ? 'A' : 'B'
      if (winner === underdog) {
        underdogWins += 1
        overtakeCardCodesSorted.push(river.code)
      }
    }
  }
  overtakeCardCodesSorted.sort()
  chopCardCodesSorted.sort()
  return {
    total,
    underdogWins,
    ties,
    outs: overtakeCardCodesSorted.length,
    overtakeCardCodesSorted,
    chopCardCodesSorted,
  }
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
    errors.push(
      gameType === 'omaha'
        ? '请补齐领先方手牌：奥马哈每人要选满 4 张；比牌时用其中的 2 张，配上公共牌里的 3 张。'
        : '请补齐领先方手牌：德州扑克每一方需要 2 张。',
    )
  }

  if (playerB.length !== handSize) {
    errors.push(
      gameType === 'omaha'
        ? '请补齐落后方手牌：奥马哈每人要选满 4 张；比牌时用其中的 2 张，配上公共牌里的 3 张。'
        : '请补齐落后方手牌：德州扑克每一方需要 2 张。',
    )
  }

  if (board.length > 5) {
    errors.push('公共牌太多：最多 5 张，请删掉多余的牌。')
  }

  if (gameType === 'holdem') {
    const bl = board.length
    if (bl !== 0 && bl !== 3 && bl !== 4 && bl !== 5) {
      errors.push('公共牌数量不对：德州扑克公共牌只能是 0 张、3 张、4 张或 5 张。')
    }
  }

  if (gameType === 'shortDeck') {
    const bl = board.length
    if (bl !== 0 && bl !== 3 && bl !== 4 && bl !== 5) {
      errors.push('公共牌数量不对：短牌公共牌只能是 0 张、3 张、4 张或 5 张。')
    }
  }

  allCards.forEach((card) => {
    if (card.code.length !== 2 || !validRanks.has(card.rank) || !validSuits.has(card.suit)) {
      const shown = formatCardCodeForDisplay(card.code || '')
      const label = shown.trim() ? `「${shown}」` : '这张牌'
      if (
        gameType === 'shortDeck' &&
        card.rank &&
        ['2', '3', '4', '5'].includes(card.rank) &&
        validSuits.has(card.suit)
      ) {
        errors.push(`短牌没有 ${shown}：短牌只用 6～A，不要选 2、3、4、5。`)
      } else {
        errors.push(
          `牌面格式不对：${label}。请写成 Ah、Kd、Qh、Jc 这样：先点数、后花色，多张牌中间用空格分开。`,
        )
      }
    }
  })

  const seen = new Set<string>()
  allCards.forEach((card) => {
    if (seen.has(card.code)) {
      errors.push(`这张牌重复了：${formatCardCodeForDisplay(card.code)}。全场每张牌只能用一次。`)
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

  if (gameType === 'shortDeck') {
    return shortDeckOddsTable[outs] ?? null
  }

  return null
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

/** 复制到剪贴板的统一结尾说明（与页面算法说明区分，偏转发场景） */
const CLIPBOARD_DISCLAIMER = '说明：结果仅供线下牌局保险计算参考，请以实际牌局规则为准。'

export function collectHoldemResultLines(
  result: InsuranceResult,
  opts?: { customBuyText?: string; potAmount?: number },
): string[] {
  const boardLine = result.boardDisplay?.trim() ? result.boardDisplay : '（无）'
  const hitProbLine =
    result.holdemPreflopPairSpecial === 'overtake35'
      ? '保险命中概率：固定赔率'
      : `保险命中概率：${formatPercent(result.hitProbability)}`
  const lines = [
    '扑克保险计算结果',
    `游戏类型：${HOLDEM_GAME_NAME}`,
    `领先方：${result.leaderHandDisplay ?? ''}`,
    `落后方：${result.underdogHandDisplay ?? ''}`,
    `公共牌：${boardLine}`,
    `反超 Outs：${result.outs} 张`,
    hitProbLine,
    `保险赔率：${formatOdds(result.defaultOdds)}`,
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
  lines.push(`建议买保：${formatAmount(result.breakEvenInsurance)}`)
  lines.push(`买满池参考：${formatAmount(result.fullPotInsurance)}`)
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
  lines.push(CLIPBOARD_DISCLAIMER)
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
  if (result.gameType === 'holdem' && result.leaderHandDisplay !== undefined) {
    return collectHoldemResultLines(result).join('\n')
  }

  if (result.gameType === 'omaha' && result.omahaCompactLayout) {
    const lines = [
      '扑克保险计算结果',
      `游戏类型：${gameLabels.omaha}`,
      `领先方：玩家${result.leader}`,
      `落后方：玩家${result.underdog}`,
      `反超 Outs：${result.outs} 张`,
      `保险命中概率：${formatPercent(result.hitProbability)}`,
      `保险赔率：${formatOdds(result.defaultOdds)}`,
      `建议买保：${formatAmount(result.breakEvenInsurance)}`,
      `买满池参考：${formatAmount(result.fullPotInsurance)}`,
    ]
    const direct = result.directOutCardCodesDisplay?.trim()
    if (direct) {
      lines.push(`反超牌：${direct}`)
    }
    const chop = result.chopOutCardCodesDisplay?.trim()
    if (chop) {
      lines.push(`平分牌：${chop}`)
    }
    lines.push(CLIPBOARD_DISCLAIMER)
    return lines.join('\n')
  }

  if (result.gameType === 'shortDeck' && result.shortDeckCompactLayout) {
    const lines = [
      '扑克保险计算结果',
      `游戏类型：${gameLabels.shortDeck}`,
      `领先方：玩家${result.leader}`,
      `落后方：玩家${result.underdog}`,
      `反超 Outs：${result.outs} 张`,
      `保险命中概率：${formatPercent(result.hitProbability)}`,
      `保险赔率：${formatOdds(result.defaultOdds)}`,
      `建议买保：${formatAmount(result.breakEvenInsurance)}`,
      `买满池参考：${formatAmount(result.fullPotInsurance)}`,
    ]
    const directSd = result.directOutCardCodesDisplay?.trim()
    if (directSd) {
      lines.push(`反超牌：${directSd}`)
    }
    const chopSd = result.chopOutCardCodesDisplay?.trim()
    if (chopSd) {
      lines.push(`平分牌：${chopSd}`)
    }
    lines.push(CLIPBOARD_DISCLAIMER)
    return lines.join('\n')
  }

  const lines = [
    '扑克保险计算结果',
    `游戏类型：${gameLabels[result.gameType]}`,
    `领先方：玩家${result.leader}`,
    `落后方：玩家${result.underdog}`,
    `反超 Outs：${result.outs} 张`,
    `保险命中概率：${formatPercent(result.hitProbability)}`,
    `保险赔率：${formatOdds(result.defaultOdds)}`,
    `建议买保：${formatAmount(result.breakEvenInsurance)}`,
    `买满池参考：${formatAmount(result.fullPotInsurance)}`,
  ]
  const directFb = result.directOutCardCodesDisplay?.trim()
  if (directFb) {
    lines.push(`反超牌：${directFb}`)
  }
  const chopFb = result.chopOutCardCodesDisplay?.trim()
  if (chopFb) {
    lines.push(`平分牌：${chopFb}`)
  }
  lines.push(CLIPBOARD_DISCLAIMER)
  return lines.join('\n')
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
    errors.push('请填写底池金额，并填一个大于 0 的数字。')
  }

  if (input.allInAmount <= 0) {
    errors.push('请填写投入金额，并填一个大于 0 的数字。')
  }

  if (input.potAmount > 0 && input.allInAmount > input.potAmount) {
    errors.push('投入不能大于底池，请检查两个数字是否填反了。')
  }

  if (input.gameType === 'holdem') {
    if (input.street === 'river') {
      errors.push('河牌阶段本工具不计算保险，请改选翻前、翻牌或转牌。')
    }
    if (input.street === 'preflop' && board.length !== 0) {
      errors.push('翻前不要选公共牌，请把公共牌清空。')
    }
    if (input.street === 'flop' && board.length !== 3) {
      errors.push('当前选择的是翻牌阶段，请先放满 3 张公共牌。')
    }
    if (input.street === 'turn' && board.length !== 4) {
      errors.push('当前选择的是转牌阶段，请先放满 4 张公共牌。')
    }
  }

  if (input.gameType === 'omaha') {
    if (input.street !== 'flop' && input.street !== 'turn') {
      errors.push('请先在上方选择「翻牌」或「转牌」，并补齐双方手牌与公共牌后再计算。')
    }
    if (input.street === 'flop' && board.length !== 3) {
      errors.push('当前选择的是翻牌阶段，请先放满 3 张公共牌。（奥马哈：每人 4 张手牌，比牌用 2 张手牌 + 3 张公共牌。）')
    }
    if (input.street === 'turn' && board.length !== 4) {
      errors.push('当前选择的是转牌阶段，请先放满 4 张公共牌。（奥马哈：每人 4 张手牌，比牌用 2 张手牌 + 3 张公共牌。）')
    }
  }

  if (input.gameType === 'shortDeck') {
    if (input.street !== 'flop' && input.street !== 'turn') {
      errors.push('请先在上方选择「翻牌」或「转牌」，并补齐双方手牌与公共牌后再计算。')
    }
    if (input.street === 'flop' && board.length !== 3) {
      errors.push('当前选择的是翻牌阶段，请先放满 3 张公共牌。（短牌只用 6～A，不要选 2、3、4、5。）')
    }
    if (input.street === 'turn' && board.length !== 4) {
      errors.push('当前选择的是转牌阶段，请先放满 4 张公共牌。（短牌只用 6～A，不要选 2、3、4、5。）')
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
  const omahaAlgoFootnote = '奥马哈按严格 2手牌 + 3公共牌枚举。'

  const pairVsPair =
    input.gameType === 'holdem' &&
    isHoldemPreflopPairVsPairScenario(input.gameType, input.street, playerA, playerB, board)

  /** 翻前对子 vs 对子特殊保险（4.5 / 3.5）均不跑完整河牌枚举 */
  const skipFullHoldemRunoutEnum = pairVsPair

  let outs: number
  let hitProbability: number
  let algorithmStatus: string
  let outsDisplayLabel: string

  let omahaEnum:
    | ReturnType<typeof enumerateOmahaFlopWithOuts>
    | ReturnType<typeof enumerateOmahaTurnWithOuts>
    | null = null

  let shortDeckEnum:
    | ReturnType<typeof enumerateShortDeckFlopWithOuts>
    | ReturnType<typeof enumerateShortDeckTurnWithOuts>
    | null = null

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
  } else if (input.gameType === 'omaha') {
    omahaEnum =
      input.street === 'flop'
        ? enumerateOmahaFlopWithOuts(underdog, playerA, playerB, board)
        : enumerateOmahaTurnWithOuts(underdog, playerA, playerB, board)
    const r = omahaEnum
    const enumResult: HoldemEnumResult = {
      total: r.total,
      underdogWins: r.underdogWins,
      ties: r.ties,
    }
    outs = r.outs
    hitProbability = enumResult.total > 0 ? enumResult.underdogWins / enumResult.total : 0
    algorithmStatus = omahaAlgoFootnote
    outsDisplayLabel = '下一张有效 OUTS'
  } else if (input.gameType === 'shortDeck') {
    shortDeckEnum =
      input.street === 'flop'
        ? enumerateShortDeckFlopWithOuts(underdog, playerA, playerB, board)
        : enumerateShortDeckTurnWithOuts(underdog, playerA, playerB, board)
    const r = shortDeckEnum
    outs = r.outs
    hitProbability = r.total > 0 ? r.underdogWins / r.total : 0
    algorithmStatus =
      '短牌 36 张（6–A）；牌型顺序同花顺＞四条＞同花＞葫芦＞顺子＞三条＞…；含 A6789 顺子（A 作低张）。概率按完整 runout 枚举。'
    outsDisplayLabel = '下一张有效 OUTS'
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

  let directOutCardCodesDisplay: string | undefined
  let chopOutCardCodesDisplay: string | undefined
  let chopOutsCount: number | undefined
  if (input.gameType === 'holdem' && !pairVsPair) {
    const h = collectHoldemNextCardOvertakeAndChopCodes(underdog, playerA, playerB, board)
    chopOutsCount = h.chop.length
    if (h.overtake.length > 0) {
      directOutCardCodesDisplay = h.overtake.map(formatCardCodeForDisplay).join(' ')
    }
    if (h.chop.length > 0) {
      chopOutCardCodesDisplay = h.chop.map(formatCardCodeForDisplay).join(' ')
    }
  } else if (omahaEnum) {
    chopOutsCount = omahaEnum.chopCardCodesSorted.length
    if (omahaEnum.overtakeCardCodesSorted.length > 0) {
      directOutCardCodesDisplay = omahaEnum.overtakeCardCodesSorted
        .map(formatCardCodeForDisplay)
        .join(' ')
    }
    if (omahaEnum.chopCardCodesSorted.length > 0) {
      chopOutCardCodesDisplay = omahaEnum.chopCardCodesSorted.map(formatCardCodeForDisplay).join(' ')
    }
  } else if (shortDeckEnum) {
    chopOutsCount = shortDeckEnum.chopCardCodesSorted.length
    if (shortDeckEnum.overtakeCardCodesSorted.length > 0) {
      directOutCardCodesDisplay = shortDeckEnum.overtakeCardCodesSorted
        .map(formatCardCodeForDisplay)
        .join(' ')
    }
    if (shortDeckEnum.chopCardCodesSorted.length > 0) {
      chopOutCardCodesDisplay = shortDeckEnum.chopCardCodesSorted.map(formatCardCodeForDisplay).join(' ')
    }
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
  } else if (input.gameType === 'omaha') {
    advice = ''
  } else if (input.gameType === 'shortDeck') {
    advice = ''
  } else if (defaultOdds) {
    advice = '可按默认赔率参考买保本或买满池，最终以现场确认赔率为准'
  } else {
    advice = '默认赔率待确认，暂不建议按本工具直接定价'
  }

  const oddsLineLabel =
    input.gameType === 'holdem' && pairVsPair ? '赔率' : input.gameType === 'holdem' ? '自动匹配赔率' : '默认赔率'
  const leaderHandDisplay =
    input.gameType === 'holdem' || input.gameType === 'shortDeck'
      ? formatCardSpaceStringForDisplay(input.playerAInput)
      : undefined
  const underdogHandDisplay =
    input.gameType === 'holdem' || input.gameType === 'shortDeck'
      ? formatCardSpaceStringForDisplay(input.playerBInput)
      : undefined
  const boardDisplay =
    input.gameType === 'holdem' || input.gameType === 'shortDeck'
      ? formatCardSpaceStringForDisplay(input.boardInput)
      : undefined

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
    omahaCompactLayout: input.gameType === 'omaha' ? true : undefined,
    shortDeckCompactLayout: input.gameType === 'shortDeck' ? true : undefined,
    directOutCardCodesDisplay,
    chopOutCardCodesDisplay,
    chopOutsCount,
  }
  const result: InsuranceResult = {
    ...resultBase,
    resultText: buildResultText(resultBase as InsuranceResult),
  }

  return { errors: [], result }
}
