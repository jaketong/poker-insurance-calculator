import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  calculateInsurance,
  collectHoldemResultLines,
  computeHoldemSplitSelectionMetrics,
  computeOmahaSplitSelectionMetrics,
  computeShortDeckSplitSelectionMetrics,
  formatAmount,
  formatOdds,
  formatPercent,
  formatCardCodeForDisplay,
  gameLabels,
  HOLDEM_GAME_NAME,
  isHoldemPreflopPairVsPairScenario,
  OMAHA_SPLIT_PURCHASE_OPTIONS,
  parseCards,
  SHORT_DECK_GRID_RANKS,
  SHORT_DECK_SPLIT_PURCHASE_OPTIONS,
  type GameType,
  type HoldemPreflopPairInsurance,
  type InsuranceInput,
  type InsuranceResult,
  type OmahaSplitCategoryId,
  type Player,
  type Street,
} from './lib/insuranceCalculator'

const HOLDEM_SUITS = ['h', 's', 'd', 'c'] as const

const HOLDEM_GRID_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const

/** 拆分购买类型按钮：0 outs 时弱化样式（不改变点击逻辑）。 */
function splitPurchaseChipClass(isOn: boolean, outsInCategory: number): string {
  const base = 'omaha-split-chip'
  if (isOn) {
    return `${base} is-on`
  }
  if (outsInCategory === 0) {
    return `${base} is-zero-dim`
  }
  return base
}

function buildHoldemClipboardTextUi(
  result: InsuranceResult,
  customBuyText: string,
  potAmount: number,
): string {
  return collectHoldemResultLines(result, { customBuyText, potAmount }).join('\n')
}

type GameConfig = {
  type: GameType
  label: string
  rules: string[]
  placeholders: {
    playerA: string
    playerB: string
    board: string
  }
}

type FormState = {
  playerAInput: string
  playerBInput: string
  boardInput: string
  leader: Player
  street: Street
  potAmount: string
  allInAmount: string
  holdemPreflopPairInsurance?: HoldemPreflopPairInsurance
  holdemLeaderCodes?: string[]
  holdemUnderdogCodes?: string[]
  holdemBoardCodes?: string[]
  omahaLeaderCodes?: string[]
  omahaUnderdogCodes?: string[]
  omahaBoardCodes?: string[]
  shortDeckLeaderCodes?: string[]
  shortDeckUnderdogCodes?: string[]
  shortDeckBoardCodes?: string[]
}

const gameConfigs: GameConfig[] = [
  {
    type: 'holdem',
    label: '德州扑克',
    rules: ['选择领先方、落后方和公共牌，输入底池后计算保险。'],
    placeholders: {
      playerA: 'Ah As',
      playerB: 'Kd Qd',
      board: 'Jh Th 2c',
    },
  },
  {
    type: 'omaha',
    label: '奥马哈',
    rules: [],
    placeholders: {
      playerA: 'Ah As Kd Qd',
      playerB: 'Jc Tc 9h 8h',
      board: 'Kh Qs 2d',
    },
  },
  {
    type: 'shortDeck',
    label: '短牌',
    rules: [
      '36 张牌：仅 6–A，无 2–5',
      'A6789 为顺子；同花＞葫芦；顺子＞三条',
      '仅翻牌/转牌启动保险；领先方手动指定',
    ],
    placeholders: {
      playerA: 'Ah Kh',
      playerB: 'Qs Js',
      board: 'Ts 9s 6d',
    },
  },
]

const streetOptionsHoldem: { value: Street; label: string }[] = [
  { value: 'preflop', label: '翻前' },
  { value: 'flop', label: '翻牌' },
  { value: 'turn', label: '转牌' },
]

const streetOptionsOmaha: { value: Street; label: string }[] = [
  { value: 'flop', label: '翻牌' },
  { value: 'turn', label: '转牌' },
]

const streetOptionsShortDeck: { value: Street; label: string }[] = [
  { value: 'flop', label: '翻牌' },
  { value: 'turn', label: '转牌' },
]

const initialForms: Record<GameType, FormState> = {
  holdem: {
    playerAInput: 'Ah As',
    playerBInput: 'Kd Qd',
    boardInput: 'Jh Th 2c',
    leader: 'A',
    street: 'flop',
    potAmount: '10000',
    allInAmount: '3000',
    holdemPreflopPairInsurance: 'setMining45',
    holdemLeaderCodes: ['Ah', 'As'],
    holdemUnderdogCodes: ['Kd', 'Qd'],
    holdemBoardCodes: ['Jh', 'Th', '2c'],
  },
  omaha: {
    playerAInput: 'Ah As Kd Qd',
    playerBInput: 'Jc Tc 9h 8h',
    boardInput: 'Kh Qs 2d',
    leader: 'A',
    street: 'flop',
    potAmount: '10000',
    allInAmount: '3000',
    omahaLeaderCodes: ['Ah', 'As', 'Kd', 'Qd'],
    omahaUnderdogCodes: ['Jc', 'Tc', '9h', '8h'],
    omahaBoardCodes: ['Kh', 'Qs', '2d'],
  },
  shortDeck: {
    playerAInput: 'As Ks',
    playerBInput: '8h 7d',
    boardInput: '6c 9s Qd',
    leader: 'A',
    street: 'flop',
    potAmount: '10000',
    allInAmount: '3000',
    shortDeckLeaderCodes: ['As', 'Ks'],
    shortDeckUnderdogCodes: ['8h', '7d'],
    shortDeckBoardCodes: ['6c', '9s', 'Qd'],
  },
}

function holdemMaxBoardCards(street: Street): number {
  if (street === 'preflop') {
    return 0
  }
  if (street === 'flop') {
    return 3
  }
  if (street === 'turn') {
    return 4
  }
  return 0
}

function omahaMaxBoardCards(street: Street): number {
  if (street === 'flop') {
    return 3
  }
  if (street === 'turn') {
    return 4
  }
  return 0
}

function omahaEffectiveStreet(street: Street): Street {
  return street === 'flop' || street === 'turn' ? street : 'flop'
}

function shortDeckMaxBoardCards(street: Street): number {
  if (street === 'flop') {
    return 3
  }
  if (street === 'turn') {
    return 4
  }
  return 0
}

function shortDeckEffectiveStreet(street: Street): Street {
  return street === 'flop' || street === 'turn' ? street : 'flop'
}

function syncShortDeckTextFromCodes(f: FormState): FormState {
  const leader = f.shortDeckLeaderCodes ?? []
  const under = f.shortDeckUnderdogCodes ?? []
  const board = f.shortDeckBoardCodes ?? []
  return {
    ...f,
    playerAInput: leader.join(' '),
    playerBInput: under.join(' '),
    boardInput: board.join(' '),
  }
}

function syncHoldemTextFromCodes(f: FormState): FormState {
  const leader = f.holdemLeaderCodes ?? []
  const under = f.holdemUnderdogCodes ?? []
  const board = f.holdemBoardCodes ?? []
  return {
    ...f,
    playerAInput: leader.join(' '),
    playerBInput: under.join(' '),
    boardInput: board.join(' '),
  }
}

function syncOmahaTextFromCodes(f: FormState): FormState {
  const leader = f.omahaLeaderCodes ?? []
  const under = f.omahaUnderdogCodes ?? []
  const board = f.omahaBoardCodes ?? []
  return {
    ...f,
    playerAInput: leader.join(' '),
    playerBInput: under.join(' '),
    boardInput: board.join(' '),
  }
}

function App() {
  const [activeGame, setActiveGame] = useState<GameType>('holdem')
  const [forms, setForms] = useState<Record<GameType, FormState>>(initialForms)
  const [result, setResult] = useState<InsuranceResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [copyStatus, setCopyStatus] = useState('')
  const [pickerHint, setPickerHint] = useState('')
  const [holdemPickerOpen, setHoldemPickerOpen] = useState<'leader' | 'underdog' | 'board' | null>(null)
  /** 仅在结果卡片内填写，与表单分离 */
  const [holdemResultCustomBuy, setHoldemResultCustomBuy] = useState('')
  const [omahaSplitSelected, setOmahaSplitSelected] = useState<OmahaSplitCategoryId[]>([])
  const [omahaSplitPurchase, setOmahaSplitPurchase] = useState('')
  const [omahaSplitBringback, setOmahaSplitBringback] = useState(false)
  const [holdemSplitSelected, setHoldemSplitSelected] = useState<OmahaSplitCategoryId[]>([])
  const [holdemSplitPurchase, setHoldemSplitPurchase] = useState('')
  const [holdemSplitBringback, setHoldemSplitBringback] = useState(false)
  const [omahaPickerOpen, setOmahaPickerOpen] = useState<'leader' | 'underdog' | 'board' | null>(null)
  const [shortDeckPickerOpen, setShortDeckPickerOpen] = useState<'leader' | 'underdog' | 'board' | null>(null)
  const [shortDeckSplitSelected, setShortDeckSplitSelected] = useState<OmahaSplitCategoryId[]>([])
  const [shortDeckSplitPurchase, setShortDeckSplitPurchase] = useState('')
  const [shortDeckSplitBringback, setShortDeckSplitBringback] = useState(false)
  const holdemLenRef = useRef<{ l: number; u: number; b: number } | null>(null)
  const omahaLenRef = useRef<{ l: number; u: number; b: number } | null>(null)
  const shortDeckLenRef = useRef<{ l: number; u: number; b: number } | null>(null)

  useEffect(() => {
    holdemLenRef.current = null
  }, [holdemPickerOpen])

  useEffect(() => {
    omahaLenRef.current = null
  }, [omahaPickerOpen])

  useEffect(() => {
    shortDeckLenRef.current = null
  }, [shortDeckPickerOpen])

  useEffect(() => {
    if (activeGame !== 'holdem' || !holdemPickerOpen) {
      return
    }
    const h = forms.holdem
    const lens = {
      l: (h.holdemLeaderCodes ?? []).length,
      u: (h.holdemUnderdogCodes ?? []).length,
      b: (h.holdemBoardCodes ?? []).length,
    }
    const cap =
      holdemPickerOpen === 'leader' || holdemPickerOpen === 'underdog'
        ? 2
        : holdemMaxBoardCards(h.street)
    if (cap <= 0) {
      holdemLenRef.current = lens
      return
    }
    const cur = holdemPickerOpen === 'leader' ? lens.l : holdemPickerOpen === 'underdog' ? lens.u : lens.b
    const prev = holdemLenRef.current
    holdemLenRef.current = lens
    if (!prev) {
      return
    }
    const prevLen = holdemPickerOpen === 'leader' ? prev.l : holdemPickerOpen === 'underdog' ? prev.u : prev.b
    if (cur >= cap && prevLen < cap) {
      setHoldemPickerOpen(null)
    }
  }, [activeGame, forms.holdem, holdemPickerOpen])

  useEffect(() => {
    if (activeGame !== 'omaha' || !omahaPickerOpen) {
      return
    }
    const o = forms.omaha
    const lens = {
      l: (o.omahaLeaderCodes ?? []).length,
      u: (o.omahaUnderdogCodes ?? []).length,
      b: (o.omahaBoardCodes ?? []).length,
    }
    const cap =
      omahaPickerOpen === 'leader' || omahaPickerOpen === 'underdog'
        ? 4
        : omahaMaxBoardCards(omahaEffectiveStreet(o.street))
    if (cap <= 0) {
      omahaLenRef.current = lens
      return
    }
    const cur = omahaPickerOpen === 'leader' ? lens.l : omahaPickerOpen === 'underdog' ? lens.u : lens.b
    const prev = omahaLenRef.current
    omahaLenRef.current = lens
    if (!prev) {
      return
    }
    const prevLen = omahaPickerOpen === 'leader' ? prev.l : omahaPickerOpen === 'underdog' ? prev.u : prev.b
    if (cur >= cap && prevLen < cap) {
      setOmahaPickerOpen(null)
    }
  }, [activeGame, forms.omaha, omahaPickerOpen])

  useEffect(() => {
    if (activeGame !== 'shortDeck' || !shortDeckPickerOpen) {
      return
    }
    const s = forms.shortDeck
    const street = shortDeckEffectiveStreet(s.street)
    const lens = {
      l: (s.shortDeckLeaderCodes ?? []).length,
      u: (s.shortDeckUnderdogCodes ?? []).length,
      b: (s.shortDeckBoardCodes ?? []).length,
    }
    const cap =
      shortDeckPickerOpen === 'leader' || shortDeckPickerOpen === 'underdog'
        ? 2
        : shortDeckMaxBoardCards(street)
    if (cap <= 0) {
      shortDeckLenRef.current = lens
      return
    }
    const cur =
      shortDeckPickerOpen === 'leader' ? lens.l : shortDeckPickerOpen === 'underdog' ? lens.u : lens.b
    const prev = shortDeckLenRef.current
    shortDeckLenRef.current = lens
    if (!prev) {
      return
    }
    const prevLen =
      shortDeckPickerOpen === 'leader' ? prev.l : shortDeckPickerOpen === 'underdog' ? prev.u : prev.b
    if (cur >= cap && prevLen < cap) {
      setShortDeckPickerOpen(null)
    }
  }, [activeGame, forms.shortDeck, shortDeckPickerOpen])

  const activeForm = forms[activeGame]

  const showHoldemPairInsurance = useMemo(() => {
    if (activeGame !== 'holdem') {
      return false
    }
    const h = forms.holdem
    const effStreet: Street = h.street === 'river' ? 'turn' : h.street
    const boardCodes = effStreet === 'preflop' ? [] : h.holdemBoardCodes ?? []
    const synced = syncHoldemTextFromCodes({
      ...h,
      holdemLeaderCodes: h.holdemLeaderCodes ?? [],
      holdemUnderdogCodes: h.holdemUnderdogCodes ?? [],
      holdemBoardCodes: boardCodes,
    })
    return isHoldemPreflopPairVsPairScenario(
      'holdem',
      synced.street,
      parseCards(synced.playerAInput),
      parseCards(synced.playerBInput),
      parseCards(synced.boardInput),
    )
  }, [activeGame, forms.holdem])

  const holdemCustomPreview = useMemo(() => {
    if (!result || result.gameType !== 'holdem' || result.leaderHandDisplay === undefined) {
      return null
    }
    const pot = Number(forms.holdem.potAmount)
    const raw = holdemResultCustomBuy.trim()
    if (!raw) {
      return { kind: 'empty' as const }
    }
    const amt = Number(raw)
    if (!Number.isFinite(amt) || amt <= 0) {
      return { kind: 'invalid' as const }
    }
    const odds = result.defaultOdds
    if (!odds || odds <= 0) {
      return { kind: 'pending' as const, amount: amt }
    }
    const payout = amt * odds
    const exceeds = Number.isFinite(pot) && payout > pot
    return {
      kind: exceeds ? ('over' as const) : ('ok' as const),
      amount: amt,
      payout,
      maxBuyDisplay: formatAmount(result.fullPotInsurance),
    }
  }, [result, holdemResultCustomBuy, forms.holdem.potAmount])

  const omahaSplitUi = useMemo(() => {
    if (!result || result.gameType !== 'omaha' || !result.omahaCompactLayout) {
      return null
    }
    const o = forms.omaha
    const street: 'flop' | 'turn' = o.street === 'turn' ? 'turn' : 'flop'
    const board = parseCards(o.boardInput)
    const pa = parseCards(o.playerAInput)
    const pb = parseCards(o.playerBInput)
    const pot = Number(o.potAmount)
    const uniq = [...new Set(omahaSplitSelected)]
    if (uniq.length === 0) {
      return { pick: true as const, pot, mixedChopNote: false as const }
    }
    const metrics = computeOmahaSplitSelectionMetrics(result.underdog, pa, pb, board, street, uniq)
    if (!metrics) {
      return { pick: false as const, badBoard: true as const, uniq, pot, mixedChopNote: false as const }
    }
    const raw = omahaSplitPurchase.trim()
    const buyAmt = raw === '' ? null : Number(raw)
    const buyValid = buyAmt !== null && Number.isFinite(buyAmt) && buyAmt > 0
    const buyEmpty = raw === ''
    const odds = metrics.selectedOdds
    const payout = buyValid && odds && odds > 0 ? buyAmt! * odds : null
    const potOk = Number.isFinite(pot) && pot > 0
    const halfPot = potOk ? pot / 2 : null
    const includesChop = uniq.includes('tie')
    const nonTiePick = uniq.filter((id) => id !== 'tie')
    const tieOuts = metrics.tieOutsCount
    const winPickUnion = metrics.selectedWinTypesUnionCount
    const zeroUnion = metrics.selectedOuts === 0
    const mixedChopNote = includesChop && nonTiePick.length > 0
    let status:
      | 'ok'
      | 'overPot'
      | 'overChopHalf'
      | 'oddsPending'
      | 'invalidBuy'
      | 'noTieOuts'
      | 'noSelectedOuts' = 'ok'
    let warnLine: string | null = null
    if (!buyEmpty && !buyValid) {
      status = 'invalidBuy'
    } else if (includesChop && tieOuts === 0 && nonTiePick.length === 0) {
      status = 'noTieOuts'
    } else if (
      nonTiePick.length > 0 &&
      winPickUnion === 0 &&
      !(includesChop && tieOuts > 0)
    ) {
      status = 'noSelectedOuts'
    } else if (buyValid && (!odds || odds <= 0)) {
      status = 'oddsPending'
    } else if (buyValid && payout !== null && potOk && odds && odds > 0) {
      if (includesChop && halfPot !== null && payout > halfPot) {
        status = 'overChopHalf'
        warnLine = '平分赔付不能超过底池一半。'
      } else if (!includesChop && payout > pot) {
        status = 'overPot'
        const maxBuy = pot / odds
        warnLine = `预计赔付超过总底池，最多可买：${maxBuy.toFixed(2)}。`
      }
    }
    const bringbackAmt =
      omahaSplitBringback && buyValid && odds && odds > 0 ? buyAmt! / odds : null
    const detailLine = uniq
      .map((id) => {
        const lab = OMAHA_SPLIT_PURCHASE_OPTIONS.find((x) => x.id === id)?.label ?? id
        const n = metrics.outsByCategory[id] ?? 0
        return `${lab}${n}`
      })
      .join('·')
    return {
      pick: false as const,
      badBoard: false as const,
      uniq,
      pot,
      metrics,
      buyEmpty,
      buyValid,
      buyAmt,
      payout,
      odds,
      status,
      warnLine,
      includesChop,
      halfPot,
      bringbackAmt,
      detailLine,
      zeroUnion,
      mixedChopNote,
    }
  }, [
    result,
    forms.omaha,
    omahaSplitSelected,
    omahaSplitPurchase,
    omahaSplitBringback,
  ])

  const holdemSplitUi = useMemo(() => {
    if (!result || result.gameType !== 'holdem' || result.leaderHandDisplay === undefined) {
      return null
    }
    if (result.holdemPreflopPairSpecial) {
      return null
    }
    const h = forms.holdem
    if (h.street !== 'flop' && h.street !== 'turn') {
      return null
    }
    const street: 'flop' | 'turn' = h.street === 'turn' ? 'turn' : 'flop'
    const board = parseCards(h.boardInput)
    const pa = parseCards(h.playerAInput)
    const pb = parseCards(h.playerBInput)
    const pot = Number(h.potAmount)
    const uniq = [...new Set(holdemSplitSelected)]
    if (uniq.length === 0) {
      return { pick: true as const, pot, mixedChopNote: false as const }
    }
    const metrics = computeHoldemSplitSelectionMetrics(result.underdog, pa, pb, board, street, uniq)
    if (!metrics) {
      return { pick: false as const, badBoard: true as const, uniq, pot, mixedChopNote: false as const }
    }
    const raw = holdemSplitPurchase.trim()
    const buyAmt = raw === '' ? null : Number(raw)
    const buyValid = buyAmt !== null && Number.isFinite(buyAmt) && buyAmt > 0
    const buyEmpty = raw === ''
    const odds = metrics.selectedOdds
    const payout = buyValid && odds && odds > 0 ? buyAmt! * odds : null
    const potOk = Number.isFinite(pot) && pot > 0
    const halfPot = potOk ? pot / 2 : null
    const includesChop = uniq.includes('tie')
    const nonTiePick = uniq.filter((id) => id !== 'tie')
    const tieOuts = metrics.tieOutsCount
    const winPickUnion = metrics.selectedWinTypesUnionCount
    const zeroUnion = metrics.selectedOuts === 0
    const mixedChopNote = includesChop && nonTiePick.length > 0
    let status:
      | 'ok'
      | 'overPot'
      | 'overChopHalf'
      | 'oddsPending'
      | 'invalidBuy'
      | 'noTieOuts'
      | 'noSelectedOuts' = 'ok'
    let warnLine: string | null = null
    if (!buyEmpty && !buyValid) {
      status = 'invalidBuy'
    } else if (includesChop && tieOuts === 0 && nonTiePick.length === 0) {
      status = 'noTieOuts'
    } else if (
      nonTiePick.length > 0 &&
      winPickUnion === 0 &&
      !(includesChop && tieOuts > 0)
    ) {
      status = 'noSelectedOuts'
    } else if (buyValid && (!odds || odds <= 0)) {
      status = 'oddsPending'
    } else if (buyValid && payout !== null && potOk && odds && odds > 0) {
      if (includesChop && halfPot !== null && payout > halfPot) {
        status = 'overChopHalf'
        warnLine = '平分赔付不能超过底池一半。'
      } else if (!includesChop && payout > pot) {
        status = 'overPot'
        const maxBuy = pot / odds
        warnLine = `预计赔付超过总底池，最多可买：${maxBuy.toFixed(2)}。`
      }
    }
    const bringbackAmt =
      holdemSplitBringback && buyValid && odds && odds > 0 ? buyAmt! / odds : null
    const detailLine = uniq
      .map((id) => {
        const lab = OMAHA_SPLIT_PURCHASE_OPTIONS.find((x) => x.id === id)?.label ?? id
        const n = metrics.outsByCategory[id] ?? 0
        return `${lab}${n}`
      })
      .join('·')
    return {
      pick: false as const,
      badBoard: false as const,
      uniq,
      pot,
      metrics,
      buyEmpty,
      buyValid,
      buyAmt,
      payout,
      odds,
      status,
      warnLine,
      includesChop,
      halfPot,
      bringbackAmt,
      detailLine,
      zeroUnion,
      mixedChopNote,
    }
  }, [
    result,
    forms.holdem,
    holdemSplitSelected,
    holdemSplitPurchase,
    holdemSplitBringback,
  ])

  const shortDeckSplitUi = useMemo(() => {
    if (!result || result.gameType !== 'shortDeck' || !result.shortDeckCompactLayout) {
      return null
    }
    const s = forms.shortDeck
    const street: 'flop' | 'turn' = s.street === 'turn' ? 'turn' : 'flop'
    const board = parseCards(s.boardInput)
    const pa = parseCards(s.playerAInput)
    const pb = parseCards(s.playerBInput)
    const pot = Number(s.potAmount)
    const uniq = [...new Set(shortDeckSplitSelected)]
    if (uniq.length === 0) {
      return { pick: true as const, pot, mixedChopNote: false as const }
    }
    const metrics = computeShortDeckSplitSelectionMetrics(result.underdog, pa, pb, board, street, uniq)
    if (!metrics) {
      return { pick: false as const, badBoard: true as const, uniq, pot, mixedChopNote: false as const }
    }
    const raw = shortDeckSplitPurchase.trim()
    const buyAmt = raw === '' ? null : Number(raw)
    const buyValid = buyAmt !== null && Number.isFinite(buyAmt) && buyAmt > 0
    const buyEmpty = raw === ''
    const odds = metrics.selectedOdds
    const payout = buyValid && odds && odds > 0 ? buyAmt! * odds : null
    const potOk = Number.isFinite(pot) && pot > 0
    const halfPot = potOk ? pot / 2 : null
    const includesChop = uniq.includes('tie')
    const nonTiePick = uniq.filter((id) => id !== 'tie')
    const tieOuts = metrics.tieOutsCount
    const winPickUnion = metrics.selectedWinTypesUnionCount
    const zeroUnion = metrics.selectedOuts === 0
    const mixedChopNote = includesChop && nonTiePick.length > 0
    let status:
      | 'ok'
      | 'overPot'
      | 'overChopHalf'
      | 'oddsPending'
      | 'invalidBuy'
      | 'noTieOuts'
      | 'noSelectedOuts' = 'ok'
    let warnLine: string | null = null
    if (!buyEmpty && !buyValid) {
      status = 'invalidBuy'
    } else if (includesChop && tieOuts === 0 && nonTiePick.length === 0) {
      status = 'noTieOuts'
    } else if (
      nonTiePick.length > 0 &&
      winPickUnion === 0 &&
      !(includesChop && tieOuts > 0)
    ) {
      status = 'noSelectedOuts'
    } else if (buyValid && (!odds || odds <= 0)) {
      status = 'oddsPending'
    } else if (buyValid && payout !== null && potOk && odds && odds > 0) {
      if (includesChop && halfPot !== null && payout > halfPot) {
        status = 'overChopHalf'
        warnLine = '平分赔付不能超过底池一半。'
      } else if (!includesChop && payout > pot) {
        status = 'overPot'
        const maxBuy = pot / odds
        warnLine = `预计赔付超过总底池，最多可买：${maxBuy.toFixed(2)}。`
      }
    }
    const bringbackAmt =
      shortDeckSplitBringback && buyValid && odds && odds > 0 ? buyAmt! / odds : null
    const detailLine = uniq
      .map((id) => {
        const lab = SHORT_DECK_SPLIT_PURCHASE_OPTIONS.find((x) => x.id === id)?.label ?? id
        const n = metrics.outsByCategory[id] ?? 0
        return `${lab}${n}`
      })
      .join('·')
    return {
      pick: false as const,
      badBoard: false as const,
      uniq,
      pot,
      metrics,
      buyEmpty,
      buyValid,
      buyAmt,
      payout,
      odds,
      status,
      warnLine,
      includesChop,
      halfPot,
      bringbackAmt,
      detailLine,
      zeroUnion,
      mixedChopNote,
    }
  }, [
    result,
    forms.shortDeck,
    shortDeckSplitSelected,
    shortDeckSplitPurchase,
    shortDeckSplitBringback,
  ])

  function toggleHoldemSplitType(id: OmahaSplitCategoryId) {
    setHoldemSplitSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleOmahaSplitType(id: OmahaSplitCategoryId) {
    setOmahaSplitSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleShortDeckSplitType(id: OmahaSplitCategoryId) {
    setShortDeckSplitSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function updateForm(field: keyof FormState, value: string) {
    setPickerHint('')
    setForms((current) => ({
      ...current,
      [activeGame]: {
        ...current[activeGame],
        [field]: value,
      },
    }))
  }

  function updateHoldemStreet(nextStreet: Street) {
    setPickerHint('')
    setHoldemPickerOpen(null)
    setForms((current) => {
      const h = current.holdem
      const maxB = holdemMaxBoardCards(nextStreet)
      let board = [...(h.holdemBoardCodes ?? [])]
      if (board.length > maxB) {
        board = []
      }
      const nextH = syncHoldemTextFromCodes({
        ...h,
        street: nextStreet,
        holdemBoardCodes: board,
      })
      return { ...current, holdem: nextH }
    })
  }

  function toggleHoldemCard(zone: 'leader' | 'underdog' | 'board', code: string) {
    setPickerHint('')
    setForms((current) => {
      const h = current.holdem
      const leader = [...(h.holdemLeaderCodes ?? [])]
      const under = [...(h.holdemUnderdogCodes ?? [])]
      const board = [...(h.holdemBoardCodes ?? [])]
      const maxLeader = 2
      const maxUnder = 2
      const maxBoard = holdemMaxBoardCards(h.street)

      const usedElsewhere = new Set<string>()
      if (zone !== 'leader') {
        leader.forEach((c) => usedElsewhere.add(c))
      }
      if (zone !== 'underdog') {
        under.forEach((c) => usedElsewhere.add(c))
      }
      if (zone !== 'board') {
        board.forEach((c) => usedElsewhere.add(c))
      }

      const pickFrom = () => (zone === 'leader' ? leader : zone === 'underdog' ? under : board)

      let target = pickFrom()
      if (target.includes(code)) {
        target = target.filter((c) => c !== code)
      } else {
        if (usedElsewhere.has(code)) {
          queueMicrotask(() => setPickerHint('该牌已被其他区域选中'))
          return current
        }
        const cap = zone === 'leader' ? maxLeader : zone === 'underdog' ? maxUnder : maxBoard
        if (target.length >= cap) {
          queueMicrotask(() =>
            setPickerHint(zone === 'board' ? `公共牌当前街最多 ${cap} 张` : '该区域已选满'),
          )
          return current
        }
        target = [...target, code]
      }

      const nextH = syncHoldemTextFromCodes(
        zone === 'leader'
          ? { ...h, holdemLeaderCodes: target }
          : zone === 'underdog'
            ? { ...h, holdemUnderdogCodes: target }
            : { ...h, holdemBoardCodes: target },
      )
      return { ...current, holdem: nextH }
    })
  }

  const updateOmahaStreet = useCallback((nextStreet: Street) => {
    setPickerHint('')
    setOmahaPickerOpen(null)
    setForms((current) => {
      const o = current.omaha
      const maxB = omahaMaxBoardCards(nextStreet)
      let board = [...(o.omahaBoardCodes ?? [])]
      if (board.length > maxB) {
        board = board.slice(0, maxB)
      }
      const nextO = syncOmahaTextFromCodes({
        ...o,
        street: nextStreet,
        omahaBoardCodes: board,
      })
      return { ...current, omaha: nextO }
    })
  }, [])

  function toggleOmahaCard(zone: 'leader' | 'underdog' | 'board', code: string) {
    setPickerHint('')
    setForms((current) => {
      const o = current.omaha
      const leader = [...(o.omahaLeaderCodes ?? [])]
      const under = [...(o.omahaUnderdogCodes ?? [])]
      const board = [...(o.omahaBoardCodes ?? [])]
      const maxLeader = 4
      const maxUnder = 4
      const maxBoard = omahaMaxBoardCards(omahaEffectiveStreet(o.street))

      const usedElsewhere = new Set<string>()
      if (zone !== 'leader') {
        leader.forEach((c) => usedElsewhere.add(c))
      }
      if (zone !== 'underdog') {
        under.forEach((c) => usedElsewhere.add(c))
      }
      if (zone !== 'board') {
        board.forEach((c) => usedElsewhere.add(c))
      }

      const pickFrom = () => (zone === 'leader' ? leader : zone === 'underdog' ? under : board)

      let target = pickFrom()
      if (target.includes(code)) {
        target = target.filter((c) => c !== code)
      } else {
        if (usedElsewhere.has(code)) {
          queueMicrotask(() => setPickerHint('该牌已被其他区域选中'))
          return current
        }
        const cap = zone === 'leader' ? maxLeader : zone === 'underdog' ? maxUnder : maxBoard
        if (target.length >= cap) {
          queueMicrotask(() =>
            setPickerHint(zone === 'board' ? `公共牌当前街最多 ${cap} 张` : '该区域已选满'),
          )
          return current
        }
        target = [...target, code]
      }

      const nextO = syncOmahaTextFromCodes(
        zone === 'leader'
          ? { ...o, omahaLeaderCodes: target }
          : zone === 'underdog'
            ? { ...o, omahaUnderdogCodes: target }
            : { ...o, omahaBoardCodes: target },
      )
      return { ...current, omaha: nextO }
    })
  }

  const updateShortDeckStreet = useCallback((nextStreet: Street) => {
    setPickerHint('')
    setShortDeckPickerOpen(null)
    setForms((current) => {
      const s = current.shortDeck
      const maxB = shortDeckMaxBoardCards(nextStreet)
      let board = [...(s.shortDeckBoardCodes ?? [])]
      if (board.length > maxB) {
        board = board.slice(0, maxB)
      }
      const nextS = syncShortDeckTextFromCodes({
        ...s,
        street: nextStreet,
        shortDeckBoardCodes: board,
      })
      return { ...current, shortDeck: nextS }
    })
  }, [])

  function toggleShortDeckCard(zone: 'leader' | 'underdog' | 'board', code: string) {
    setPickerHint('')
    setForms((current) => {
      const s = current.shortDeck
      const leader = [...(s.shortDeckLeaderCodes ?? [])]
      const under = [...(s.shortDeckUnderdogCodes ?? [])]
      const board = [...(s.shortDeckBoardCodes ?? [])]
      const maxLeader = 2
      const maxUnder = 2
      const maxBoard = shortDeckMaxBoardCards(shortDeckEffectiveStreet(s.street))

      const usedElsewhere = new Set<string>()
      if (zone !== 'leader') {
        leader.forEach((c) => usedElsewhere.add(c))
      }
      if (zone !== 'underdog') {
        under.forEach((c) => usedElsewhere.add(c))
      }
      if (zone !== 'board') {
        board.forEach((c) => usedElsewhere.add(c))
      }

      const pickFrom = () => (zone === 'leader' ? leader : zone === 'underdog' ? under : board)

      let target = pickFrom()
      if (target.includes(code)) {
        target = target.filter((c) => c !== code)
      } else {
        if (usedElsewhere.has(code)) {
          queueMicrotask(() => setPickerHint('该牌已被其他区域选中'))
          return current
        }
        const cap = zone === 'leader' ? maxLeader : zone === 'underdog' ? maxUnder : maxBoard
        if (target.length >= cap) {
          queueMicrotask(() =>
            setPickerHint(zone === 'board' ? `公共牌当前街最多 ${cap} 张` : '该区域已选满'),
          )
          return current
        }
        target = [...target, code]
      }

      const nextS = syncShortDeckTextFromCodes(
        zone === 'leader'
          ? { ...s, shortDeckLeaderCodes: target }
          : zone === 'underdog'
            ? { ...s, shortDeckUnderdogCodes: target }
            : { ...s, shortDeckBoardCodes: target },
      )
      return { ...current, shortDeck: nextS }
    })
  }

  function handleCalculate() {
    const raw = forms[activeGame]
    let form: FormState =
      activeGame === 'holdem'
        ? syncHoldemTextFromCodes({
            ...raw,
            holdemLeaderCodes: raw.holdemLeaderCodes ?? [],
            holdemUnderdogCodes: raw.holdemUnderdogCodes ?? [],
            holdemBoardCodes: raw.holdemBoardCodes ?? [],
          })
        : activeGame === 'omaha'
          ? syncOmahaTextFromCodes({
              ...raw,
              omahaLeaderCodes: raw.omahaLeaderCodes ?? [],
              omahaUnderdogCodes: raw.omahaUnderdogCodes ?? [],
              omahaBoardCodes: raw.omahaBoardCodes ?? [],
            })
          : syncShortDeckTextFromCodes({
              ...raw,
              shortDeckLeaderCodes: raw.shortDeckLeaderCodes ?? [],
              shortDeckUnderdogCodes: raw.shortDeckUnderdogCodes ?? [],
              shortDeckBoardCodes: raw.shortDeckBoardCodes ?? [],
            })

    const safeStreet: Street =
      activeGame === 'holdem' && form.street === 'river'
        ? 'turn'
        : activeGame === 'shortDeck' && (form.street === 'river' || form.street === 'preflop')
          ? 'flop'
          : form.street

    if (activeGame === 'holdem' && safeStreet === 'preflop') {
      form = syncHoldemTextFromCodes({
        ...form,
        street: safeStreet,
        holdemBoardCodes: [],
      })
    }

    const payload: InsuranceInput = {
      gameType: activeGame,
      playerAInput: form.playerAInput,
      playerBInput: form.playerBInput,
      boardInput: form.boardInput,
      leader: activeGame === 'holdem' ? 'A' : form.leader,
      street: safeStreet,
      potAmount: Number(form.potAmount),
      allInAmount: Number(form.allInAmount),
      ...(activeGame === 'holdem' &&
      isHoldemPreflopPairVsPairScenario(
        'holdem',
        safeStreet,
        parseCards(form.playerAInput),
        parseCards(form.playerBInput),
        parseCards(form.boardInput),
      )
        ? { holdemPreflopPairInsurance: form.holdemPreflopPairInsurance ?? 'setMining45' }
        : {}),
    }

    const applyCalculation = () => {
      try {
        const calculation = calculateInsurance(payload)

        if (activeGame === 'holdem' && form.street === 'river') {
          setForms((c) => ({ ...c, holdem: { ...c.holdem, street: 'turn' } }))
        }

        setErrors(calculation.errors)
        setResult(calculation.result)
      } catch {
        setErrors(['计算暂时遇到问题，请检查牌面、底池和投入是否都已按提示填好，稍后再试。'])
        setResult(null)
      }
    }

    const finishCalculateUi = () => {
      setCopyStatus('')
      setPickerHint('')
      setHoldemPickerOpen(null)
      setOmahaPickerOpen(null)
      setShortDeckPickerOpen(null)
      if (activeGame === 'holdem') {
        setHoldemResultCustomBuy('')
        setHoldemSplitSelected([])
        setHoldemSplitPurchase('')
        setHoldemSplitBringback(false)
      }
      if (activeGame === 'omaha') {
        setOmahaSplitSelected([])
        setOmahaSplitPurchase('')
        setOmahaSplitBringback(false)
      }
      if (activeGame === 'shortDeck') {
        setShortDeckSplitSelected([])
        setShortDeckSplitPurchase('')
        setShortDeckSplitBringback(false)
      }
    }

    applyCalculation()
    finishCalculateUi()
  }

  async function handleCopy() {
    if (!result) {
      return
    }

    const text =
      result.gameType === 'holdem' && result.leaderHandDisplay !== undefined
        ? buildHoldemClipboardTextUi(result, holdemResultCustomBuy, Number(forms.holdem.potAmount))
        : result.resultText
    await navigator.clipboard.writeText(text)
    setCopyStatus('结果文本已复制')
  }

  return (
    <main className="app-shell app-shell-safe">
      <header className="app-header">
        <h1 className="app-title-main">扑克保险 V1</h1>
        <p className="release-tagline">
          线下两家 All-in 保险计算工具，支持德州扑克、奥马哈、短牌。
        </p>
        {activeGame !== 'holdem' ? (
          <p className="subtitle">只做当前领先方买保险，领先方由用户手动指定。</p>
        ) : null}
      </header>

      <section className="panel release-usage-panel" aria-label="使用说明">
        <p className="release-usage-text">
          选择玩法 → 输入手牌和公共牌 → 选择领先方 → 输入底池和投入 → 计算保险
        </p>
      </section>

      <nav className="game-tabs game-tabs-dock" aria-label="游戏类型">
        {gameConfigs.map((game) => (
          <button
            className={game.type === activeGame ? 'tab is-active' : 'tab'}
            key={game.type}
            type="button"
            role="tab"
            aria-selected={game.type === activeGame}
            onClick={() => {
              setActiveGame(game.type)
              setResult(null)
              setErrors([])
              setCopyStatus('')
              setPickerHint('')
              setHoldemPickerOpen(null)
              setOmahaPickerOpen(null)
              setHoldemResultCustomBuy('')
              setHoldemSplitSelected([])
              setHoldemSplitPurchase('')
              setHoldemSplitBringback(false)
              setOmahaSplitSelected([])
              setOmahaSplitPurchase('')
              setOmahaSplitBringback(false)
              setShortDeckPickerOpen(null)
              setShortDeckSplitSelected([])
              setShortDeckSplitPurchase('')
              setShortDeckSplitBringback(false)
              if (game.type === 'omaha') {
                setForms((c) => {
                  const o = c.omaha
                  const street: Street = o.street === 'flop' || o.street === 'turn' ? o.street : 'flop'
                  const maxB = omahaMaxBoardCards(street)
                  let board = [...(o.omahaBoardCodes ?? [])]
                  if (board.length > maxB) {
                    board = board.slice(0, maxB)
                  }
                  return {
                    ...c,
                    omaha: syncOmahaTextFromCodes({ ...o, street, omahaBoardCodes: board }),
                  }
                })
              }
              if (game.type === 'shortDeck') {
                setForms((c) => {
                  const s = c.shortDeck
                  const street: Street = s.street === 'flop' || s.street === 'turn' ? s.street : 'flop'
                  const maxB = shortDeckMaxBoardCards(street)
                  let board = [...(s.shortDeckBoardCodes ?? [])]
                  if (board.length > maxB) {
                    board = board.slice(0, maxB)
                  }
                  return {
                    ...c,
                    shortDeck: syncShortDeckTextFromCodes({ ...s, street, shortDeckBoardCodes: board }),
                  }
                })
              }
            }}
          >
            {game.type === 'holdem' ? (
              <span className="holdem-game-title">{HOLDEM_GAME_NAME}</span>
            ) : (
              game.label
            )}
          </button>
        ))}
      </nav>

      <section
        className={`panel form-panel form-panel-unified${activeGame === 'holdem' || activeGame === 'omaha' || activeGame === 'shortDeck' ? ' form-panel-holdem' : ''}`}
      >
        {activeGame === 'holdem' ? (
          <HoldemForm
            form={activeForm}
            showPairInsurance={showHoldemPairInsurance}
            pickerHint={pickerHint}
            openZone={holdemPickerOpen}
            onTogglePickerZone={(zone) => {
              setHoldemPickerOpen((z) => (z === zone ? null : zone))
            }}
            onToggleCard={toggleHoldemCard}
            onStreetChange={updateHoldemStreet}
            onPotChange={(value) => updateForm('potAmount', value)}
            onAllInChange={(value) => updateForm('allInAmount', value)}
            onPairInsuranceChange={(mode) => {
              setForms((c) => ({
                ...c,
                holdem: { ...c.holdem, holdemPreflopPairInsurance: mode },
              }))
            }}
          />
        ) : activeGame === 'omaha' ? (
          <OmahaForm
            form={activeForm}
            pickerHint={pickerHint}
            openZone={omahaPickerOpen}
            onTogglePickerZone={(zone) => {
              setOmahaPickerOpen((z) => (z === zone ? null : zone))
            }}
            onToggleCard={toggleOmahaCard}
            onStreetChange={updateOmahaStreet}
            onPotChange={(value) => updateForm('potAmount', value)}
            onAllInChange={(value) => updateForm('allInAmount', value)}
            onLeaderChange={(player) => updateForm('leader', player)}
          />
        ) : (
          <ShortDeckForm
            form={activeForm}
            pickerHint={pickerHint}
            openZone={shortDeckPickerOpen}
            onTogglePickerZone={(zone) => {
              setShortDeckPickerOpen((z) => (z === zone ? null : zone))
            }}
            onToggleCard={toggleShortDeckCard}
            onStreetChange={updateShortDeckStreet}
            onPotChange={(value) => updateForm('potAmount', value)}
            onAllInChange={(value) => updateForm('allInAmount', value)}
            onLeaderChange={(player) => updateForm('leader', player)}
          />
        )}

        {errors.length > 0 && (
          <div className="error-box error-box-emphasis" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}

        <button className="primary-button" type="button" onClick={handleCalculate}>
          计算保险
        </button>
      </section>

      {result && (
        <section className="result-card result-card-screenshot" aria-label="保险计算结果">
          <header className="result-share-hero" aria-label="结果标题">
            <p className="result-share-kicker">线下牌局 · 两家 All-in 保险</p>
            <h2 className="result-share-title">扑克保险计算结果</h2>
            <p className="result-share-game">{gameLabels[result.gameType]}</p>
          </header>

          {result.gameType === 'holdem' && result.leaderHandDisplay !== undefined ? (
            <div className="result-share-players" aria-label="领先与落后方">
              <div className="result-share-player-row is-leader">
                <span className="result-share-player-label">领先方</span>
                <strong className="result-share-player-value">{result.leaderHandDisplay}</strong>
              </div>
              <div className="result-share-player-row is-underdog">
                <span className="result-share-player-label">落后方</span>
                <strong className="result-share-player-value">{result.underdogHandDisplay ?? ''}</strong>
              </div>
            </div>
          ) : null}
          {(result.gameType === 'omaha' && result.omahaCompactLayout) ||
          (result.gameType === 'shortDeck' && result.shortDeckCompactLayout) ? (
            <div className="result-share-players" aria-label="领先与落后方">
              <div className="result-share-player-row is-leader">
                <span className="result-share-player-label">领先方</span>
                <strong className="result-share-player-value">玩家 {result.leader}</strong>
              </div>
              <div className="result-share-player-row is-underdog">
                <span className="result-share-player-label">落后方</span>
                <strong className="result-share-player-value">玩家 {result.underdog}</strong>
              </div>
            </div>
          ) : null}

          {result.gameType === 'omaha' && result.omahaCompactLayout ? (
            <>
              <div className="result-share-metrics" aria-label="核心数据">
                <p className="result-share-section-label">核心数据</p>
                <div className="holdem-result-compact">
                  <div className="holdem-rcell">
                    <span>{result.outsDisplayLabel}</span>
                    <strong>{result.outs}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>命中概率</span>
                    <strong>{formatPercent(result.hitProbability)}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>赔率</span>
                    <strong>{formatOdds(result.defaultOdds)}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>买保本</span>
                    <strong>{formatAmount(result.breakEvenInsurance)}</strong>
                  </div>
                  <div className="holdem-rcell holdem-rcell-span2">
                    <span>买满池</span>
                    <strong>{formatAmount(result.fullPotInsurance)}</strong>
                  </div>
                </div>
              </div>

              <div className="result-share-outs" aria-label="反超与平分牌">
                <p className="result-share-section-label">反超与平分</p>
                <p className="holdem-out-cards-line">
                  反超牌：{result.directOutCardCodesDisplay?.trim() ? result.directOutCardCodesDisplay : '无'}
                </p>
                <p className="holdem-out-cards-line">
                  平分牌：{result.chopOutCardCodesDisplay?.trim() ? result.chopOutCardCodesDisplay : '无'}
                </p>
              </div>

              {omahaSplitUi ? (
                <div className="omaha-split-box">
                  <p className="holdem-custom-heading">保险类型选择</p>
                  <div className="omaha-split-chips" role="group" aria-label="反超类型">
                    {OMAHA_SPLIT_PURCHASE_OPTIONS.map((opt) => {
                      const on = omahaSplitSelected.includes(opt.id)
                      const outsN = omahaSplitUi.metrics?.outsByCategory?.[opt.id] ?? 0
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={splitPurchaseChipClass(on, outsN)}
                          aria-pressed={on}
                          onClick={() => toggleOmahaSplitType(opt.id)}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>

                  {omahaSplitUi.pick ? (
                    <p className="omaha-split-hint">请选择要购买的反超类型。</p>
                  ) : null}

                  {!omahaSplitUi.pick && omahaSplitUi.badBoard ? (
                    <p className="holdem-custom-invalid">当前公共牌与街不匹配。</p>
                  ) : null}

                  {!omahaSplitUi.pick && !omahaSplitUi.badBoard ? (
                    <>
                      <p className="split-purchase-hint">
                        金额仅作用于上方已选的「反超类型」，与下方「平分带回」不同。
                      </p>
                      <div className="holdem-custom-buy-row omaha-split-buy-row">
                        <span className="holdem-custom-buy-label">购买金额：</span>
                        <input
                          className="holdem-custom-input holdem-custom-input-inline"
                          inputMode="decimal"
                          min="0"
                          type="number"
                          value={omahaSplitPurchase}
                          onChange={(event) => setOmahaSplitPurchase(event.target.value)}
                          aria-label="拆分购买金额"
                        />
                      </div>

                      <p className="omaha-split-line">
                        所选OUTS（{omahaSplitUi.metrics.nextStreetLabel}去重）：
                        <strong>{omahaSplitUi.metrics.selectedOuts}</strong>
                      </p>
                      <p className="omaha-split-line omaha-split-subtle">
                        平分OUTS：{omahaSplitUi.metrics.tieOutsCount} · 反超所选：
                        {omahaSplitUi.metrics.selectedWinTypesUnionCount}
                      </p>
                      {!omahaSplitUi.zeroUnion ? (
                        <>
                          <p className="omaha-split-line omaha-split-subtle">明细：{omahaSplitUi.detailLine}</p>
                          {omahaSplitUi.uniq.map((id) => {
                            const lab = OMAHA_SPLIT_PURCHASE_OPTIONS.find((x) => x.id === id)?.label ?? id
                            const cards = omahaSplitUi.metrics.categoryCardsDisplay[id]?.trim()
                            const n = omahaSplitUi.metrics.outsByCategory[id] ?? 0
                            return (
                              <p key={id} className="omaha-split-line omaha-split-card-detail">
                                {lab}：{cards || '无'}
                                {n > 0 ? `（${n}）` : ''}
                              </p>
                            )
                          })}
                        </>
                      ) : null}

                      <p className="omaha-split-line">
                        所选赔率：<strong>{formatOdds(omahaSplitUi.metrics.selectedOdds)}</strong>
                      </p>

                      {omahaSplitUi.includesChop ? (
                        <p className="omaha-split-line">
                          平分赔付上限：
                          {omahaSplitUi.halfPot !== null ? omahaSplitUi.halfPot.toFixed(2) : '待确认'}
                        </p>
                      ) : null}

                      {omahaSplitUi.buyEmpty && !omahaSplitUi.zeroUnion ? (
                        <p className="omaha-split-hint">输入购买金额后显示预计赔付。</p>
                      ) : null}
                      {omahaSplitUi.status === 'invalidBuy' ? (
                        <p className="holdem-custom-invalid">请输入大于 0 的金额。</p>
                      ) : null}
                      {!omahaSplitUi.buyEmpty &&
                      omahaSplitUi.buyValid &&
                      !omahaSplitUi.zeroUnion &&
                      omahaSplitUi.status === 'oddsPending' ? (
                        <p className="omaha-split-line">
                          预计赔付：<strong>待确认</strong>
                        </p>
                      ) : null}
                      {!omahaSplitUi.buyEmpty && omahaSplitUi.buyValid && omahaSplitUi.payout !== null ? (
                        <p
                          className={
                            omahaSplitUi.status === 'overPot' || omahaSplitUi.status === 'overChopHalf'
                              ? 'omaha-split-line omaha-split-warn'
                              : 'omaha-split-line'
                          }
                        >
                          预计赔付：<strong>{omahaSplitUi.payout.toFixed(2)}</strong>
                        </p>
                      ) : null}
                      {omahaSplitUi.warnLine ? (
                        <p className="omaha-split-line omaha-split-warn">{omahaSplitUi.warnLine}</p>
                      ) : null}
                      {omahaSplitUi.mixedChopNote ? (
                        <p className="omaha-split-line omaha-split-subtle">
                          包含平分购买，平分赔付最高为底池一半，现场确认赔付规则。
                        </p>
                      ) : null}

                      <label className="omaha-split-bringback omaha-split-bringback-distinguished">
                        <input
                          type="checkbox"
                          checked={omahaSplitBringback}
                          onChange={(event) => setOmahaSplitBringback(event.target.checked)}
                        />
                        <span>平分带回</span>
                      </label>

                      {omahaSplitBringback ? (
                        <p className="omaha-split-line">
                          平分带回：
                          <strong>
                            {!omahaSplitUi.pick && !omahaSplitUi.badBoard && omahaSplitUi.bringbackAmt !== null
                              ? omahaSplitUi.bringbackAmt.toFixed(2)
                              : '待确认'}
                          </strong>
                        </p>
                      ) : null}

                      {!omahaSplitUi.pick && !omahaSplitUi.badBoard && (omahaSplitUi.zeroUnion || !omahaSplitUi.buyEmpty) ? (
                        <p className="omaha-split-line omaha-split-status">
                          状态：
                          {omahaSplitUi.status === 'invalidBuy'
                            ? '金额无效'
                            : omahaSplitUi.status === 'noTieOuts'
                              ? '当前没有可买的平分 OUTS。'
                              : omahaSplitUi.status === 'noSelectedOuts'
                                ? '当前所选类型没有可买 OUTS。'
                                : omahaSplitUi.status === 'oddsPending'
                                  ? '赔率待确认'
                                  : omahaSplitUi.status === 'overPot'
                                    ? '超过总底池'
                                    : omahaSplitUi.status === 'overChopHalf'
                                      ? '平分赔付超过底池一半'
                                      : '可买'}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}

              <p className="holdem-result-footnote">{result.algorithmStatus}</p>
            </>
          ) : result.gameType === 'shortDeck' && result.shortDeckCompactLayout ? (
            <>
              <div className="result-share-metrics" aria-label="核心数据">
                <p className="result-share-section-label">核心数据</p>
                <div className="holdem-result-compact">
                  <div className="holdem-rcell">
                    <span>{result.outsDisplayLabel}</span>
                    <strong>{result.outs}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>命中概率</span>
                    <strong>{formatPercent(result.hitProbability)}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>赔率</span>
                    <strong>{formatOdds(result.defaultOdds)}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>买保本</span>
                    <strong>{formatAmount(result.breakEvenInsurance)}</strong>
                  </div>
                  <div className="holdem-rcell holdem-rcell-span2">
                    <span>买满池</span>
                    <strong>{formatAmount(result.fullPotInsurance)}</strong>
                  </div>
                </div>
              </div>

              <div className="result-share-outs" aria-label="反超与平分牌">
                <p className="result-share-section-label">反超与平分</p>
                <p className="holdem-out-cards-line">
                  反超牌：{result.directOutCardCodesDisplay?.trim() ? result.directOutCardCodesDisplay : '无'}
                </p>
                <p className="holdem-out-cards-line">
                  平分牌：{result.chopOutCardCodesDisplay?.trim() ? result.chopOutCardCodesDisplay : '无'}
                </p>
              </div>

              {shortDeckSplitUi ? (
                <div className="omaha-split-box">
                  <p className="holdem-custom-heading">保险类型选择</p>
                  <div className="omaha-split-chips" role="group" aria-label="短牌反超类型">
                    {SHORT_DECK_SPLIT_PURCHASE_OPTIONS.map((opt) => {
                      const on = shortDeckSplitSelected.includes(opt.id)
                      const outsN = shortDeckSplitUi.metrics?.outsByCategory?.[opt.id] ?? 0
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={splitPurchaseChipClass(on, outsN)}
                          aria-pressed={on}
                          onClick={() => toggleShortDeckSplitType(opt.id)}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>

                  {shortDeckSplitUi.pick ? (
                    <p className="omaha-split-hint">请选择要购买的反超类型。</p>
                  ) : null}

                  {!shortDeckSplitUi.pick && shortDeckSplitUi.badBoard ? (
                    <p className="holdem-custom-invalid">当前公共牌与街不匹配。</p>
                  ) : null}

                  {!shortDeckSplitUi.pick && !shortDeckSplitUi.badBoard ? (
                    <>
                      <p className="split-purchase-hint">
                        金额仅作用于上方已选的「反超类型」，与下方「平分带回」不同。
                      </p>
                      <div className="holdem-custom-buy-row omaha-split-buy-row">
                        <span className="holdem-custom-buy-label">购买金额：</span>
                        <input
                          className="holdem-custom-input holdem-custom-input-inline"
                          inputMode="decimal"
                          min="0"
                          type="number"
                          value={shortDeckSplitPurchase}
                          onChange={(event) => setShortDeckSplitPurchase(event.target.value)}
                          aria-label="短牌拆分购买金额"
                        />
                      </div>

                      <p className="omaha-split-line">
                        所选OUTS（{shortDeckSplitUi.metrics.nextStreetLabel}去重）：
                        <strong>{shortDeckSplitUi.metrics.selectedOuts}</strong>
                      </p>
                      <p className="omaha-split-line omaha-split-subtle">
                        平分OUTS：{shortDeckSplitUi.metrics.tieOutsCount} · 反超所选：
                        {shortDeckSplitUi.metrics.selectedWinTypesUnionCount}
                      </p>
                      {!shortDeckSplitUi.zeroUnion ? (
                        <>
                          <p className="omaha-split-line omaha-split-subtle">明细：{shortDeckSplitUi.detailLine}</p>
                          {shortDeckSplitUi.uniq.map((id) => {
                            const lab = SHORT_DECK_SPLIT_PURCHASE_OPTIONS.find((x) => x.id === id)?.label ?? id
                            const cards = shortDeckSplitUi.metrics.categoryCardsDisplay[id]?.trim()
                            const n = shortDeckSplitUi.metrics.outsByCategory[id] ?? 0
                            return (
                              <p key={id} className="omaha-split-line omaha-split-card-detail">
                                {lab}：{cards || '无'}
                                {n > 0 ? `（${n}）` : ''}
                              </p>
                            )
                          })}
                        </>
                      ) : null}

                      <p className="omaha-split-line">
                        所选赔率：<strong>{formatOdds(shortDeckSplitUi.metrics.selectedOdds)}</strong>
                      </p>

                      {shortDeckSplitUi.includesChop ? (
                        <p className="omaha-split-line">
                          平分赔付上限：
                          {shortDeckSplitUi.halfPot !== null ? shortDeckSplitUi.halfPot.toFixed(2) : '待确认'}
                        </p>
                      ) : null}

                      {shortDeckSplitUi.buyEmpty && !shortDeckSplitUi.zeroUnion ? (
                        <p className="omaha-split-hint">输入购买金额后显示预计赔付。</p>
                      ) : null}
                      {shortDeckSplitUi.status === 'invalidBuy' ? (
                        <p className="holdem-custom-invalid">请输入大于 0 的金额。</p>
                      ) : null}
                      {!shortDeckSplitUi.buyEmpty &&
                      shortDeckSplitUi.buyValid &&
                      !shortDeckSplitUi.zeroUnion &&
                      shortDeckSplitUi.status === 'oddsPending' ? (
                        <p className="omaha-split-line">
                          预计赔付：<strong>待确认</strong>
                        </p>
                      ) : null}
                      {!shortDeckSplitUi.buyEmpty && shortDeckSplitUi.buyValid && shortDeckSplitUi.payout !== null ? (
                        <p
                          className={
                            shortDeckSplitUi.status === 'overPot' || shortDeckSplitUi.status === 'overChopHalf'
                              ? 'omaha-split-line omaha-split-warn'
                              : 'omaha-split-line'
                          }
                        >
                          预计赔付：<strong>{shortDeckSplitUi.payout.toFixed(2)}</strong>
                        </p>
                      ) : null}
                      {shortDeckSplitUi.warnLine ? (
                        <p className="omaha-split-line omaha-split-warn">{shortDeckSplitUi.warnLine}</p>
                      ) : null}
                      {shortDeckSplitUi.mixedChopNote ? (
                        <p className="omaha-split-line omaha-split-subtle">
                          包含平分购买，平分赔付最高为底池一半，现场确认赔付规则。
                        </p>
                      ) : null}

                      <label className="omaha-split-bringback omaha-split-bringback-distinguished">
                        <input
                          type="checkbox"
                          checked={shortDeckSplitBringback}
                          onChange={(event) => setShortDeckSplitBringback(event.target.checked)}
                        />
                        <span>平分带回</span>
                      </label>

                      {shortDeckSplitBringback ? (
                        <p className="omaha-split-line">
                          平分带回：
                          <strong>
                            {!shortDeckSplitUi.pick &&
                            !shortDeckSplitUi.badBoard &&
                            shortDeckSplitUi.bringbackAmt !== null
                              ? shortDeckSplitUi.bringbackAmt.toFixed(2)
                              : '待确认'}
                          </strong>
                        </p>
                      ) : null}

                      {!shortDeckSplitUi.pick &&
                      !shortDeckSplitUi.badBoard &&
                      (shortDeckSplitUi.zeroUnion || !shortDeckSplitUi.buyEmpty) ? (
                        <p className="omaha-split-line omaha-split-status">
                          状态：
                          {shortDeckSplitUi.status === 'invalidBuy'
                            ? '金额无效'
                            : shortDeckSplitUi.status === 'noTieOuts'
                              ? '当前没有可买的平分 OUTS。'
                              : shortDeckSplitUi.status === 'noSelectedOuts'
                                ? '当前所选类型没有可买 OUTS。'
                                : shortDeckSplitUi.status === 'oddsPending'
                                  ? '赔率待确认'
                                  : shortDeckSplitUi.status === 'overPot'
                                    ? '超过总底池'
                                    : shortDeckSplitUi.status === 'overChopHalf'
                                      ? '平分赔付超过底池一半'
                                      : '可买'}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}

              <p className="holdem-result-footnote">{result.algorithmStatus}</p>
            </>
          ) : result.gameType === 'holdem' && result.leaderHandDisplay !== undefined ? (
            <>
              <div className="result-share-metrics" aria-label="核心数据">
                <p className="result-share-section-label">核心数据</p>
                <div className="holdem-result-compact">
                  <div className="holdem-rcell">
                    <span>OUTS</span>
                    <strong>{result.outs}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>命中概率</span>
                    <strong>
                      {result.holdemPreflopPairSpecial === 'overtake35'
                        ? '固定赔率'
                        : formatPercent(result.hitProbability)}
                    </strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>赔率</span>
                    <strong>{formatOdds(result.defaultOdds)}</strong>
                  </div>
                  <div className="holdem-rcell">
                    <span>买保本</span>
                    <strong>{formatAmount(result.breakEvenInsurance)}</strong>
                  </div>
                  <div className="holdem-rcell holdem-rcell-span2">
                    <span>买满池</span>
                    <strong>{formatAmount(result.fullPotInsurance)}</strong>
                  </div>
                </div>
              </div>

              {!result.holdemPreflopPairSpecial ? (
                <div className="result-share-outs" aria-label="反超与平分牌">
                  <p className="result-share-section-label">反超与平分</p>
                  <p className="holdem-out-cards-line">
                    反超牌：{result.directOutCardCodesDisplay?.trim() ? result.directOutCardCodesDisplay : '无'}
                  </p>
                  <p className="holdem-out-cards-line">
                    平分牌：{result.chopOutCardCodesDisplay?.trim() ? result.chopOutCardCodesDisplay : '无'}
                  </p>
                </div>
              ) : null}

              {result.holdemInsuranceTypeLabel ? (
                <div className="holdem-pair-extra">
                  <div className="holdem-rcell holdem-rcell-span2">
                    <span>保险类型</span>
                    <strong>{result.holdemInsuranceTypeLabel}</strong>
                  </div>
                  {result.holdemSetMiningCardsDisplay ? (
                    <div className="holdem-rcell holdem-rcell-span2">
                      <span>命中牌</span>
                      <strong>{result.holdemSetMiningCardsDisplay}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {result.holdemPairRuleHint ? (
                <p className="holdem-pair-rule-hint">{result.holdemPairRuleHint}</p>
              ) : null}

              <div className="holdem-result-custom holdem-result-custom-tight">
                <p className="holdem-custom-heading">自定义保额</p>
                <div className="holdem-custom-buy-row">
                  <span className="holdem-custom-buy-label">金额：</span>
                  <input
                    id="holdem-custom-buy-input"
                    className="holdem-custom-input holdem-custom-input-inline"
                    inputMode="decimal"
                    min="0"
                    type="number"
                    value={holdemResultCustomBuy}
                    onChange={(event) => setHoldemResultCustomBuy(event.target.value)}
                  />
                </div>
                {holdemCustomPreview?.kind === 'empty' ? (
                  <p className="holdem-custom-placeholder">可输入任意金额测算。</p>
                ) : null}
                {holdemCustomPreview?.kind === 'invalid' ? (
                  <p className="holdem-custom-invalid">请输入大于 0 的有效金额。</p>
                ) : null}
                {holdemCustomPreview?.kind === 'pending' ? (
                  <p className="holdem-custom-line">
                    预计赔付：<strong>待确认</strong> · 状态：待确认
                  </p>
                ) : null}
                {holdemCustomPreview?.kind === 'ok' ? (
                  <p className="holdem-custom-line">
                    预计赔付：<strong>{holdemCustomPreview.payout.toFixed(2)}</strong> · 状态：可买
                  </p>
                ) : null}
                {holdemCustomPreview?.kind === 'over' ? (
                  <p className="holdem-custom-line holdem-custom-line-warn">
                    预计赔付：<strong>{holdemCustomPreview.payout.toFixed(2)}</strong> · 状态：超过底池，最多可买{' '}
                    {holdemCustomPreview.maxBuyDisplay.replace(/\.00$/, '')}
                  </p>
                ) : null}
              </div>

              {holdemSplitUi ? (
                <div className="omaha-split-box">
                  <p className="holdem-custom-heading">保险类型选择</p>
                  <div className="omaha-split-chips" role="group" aria-label="反超类型">
                    {OMAHA_SPLIT_PURCHASE_OPTIONS.map((opt) => {
                      const on = holdemSplitSelected.includes(opt.id)
                      const outsN = holdemSplitUi.metrics?.outsByCategory?.[opt.id] ?? 0
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={splitPurchaseChipClass(on, outsN)}
                          aria-pressed={on}
                          onClick={() => toggleHoldemSplitType(opt.id)}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>

                  {holdemSplitUi.pick ? (
                    <p className="omaha-split-hint">请选择要购买的反超类型。</p>
                  ) : null}

                  {!holdemSplitUi.pick && holdemSplitUi.badBoard ? (
                    <p className="holdem-custom-invalid">当前公共牌与街不匹配。</p>
                  ) : null}

                  {!holdemSplitUi.pick && !holdemSplitUi.badBoard ? (
                    <>
                      <p className="split-purchase-hint">
                        金额仅作用于上方已选的「反超类型」，与下方「平分带回」不同。
                      </p>
                      <div className="holdem-custom-buy-row omaha-split-buy-row">
                        <span className="holdem-custom-buy-label">购买金额：</span>
                        <input
                          className="holdem-custom-input holdem-custom-input-inline"
                          inputMode="decimal"
                          min="0"
                          type="number"
                          value={holdemSplitPurchase}
                          onChange={(event) => setHoldemSplitPurchase(event.target.value)}
                          aria-label="德州拆分购买金额"
                        />
                      </div>

                      <p className="omaha-split-line">
                        所选OUTS（{holdemSplitUi.metrics.nextStreetLabel}去重）：
                        <strong>{holdemSplitUi.metrics.selectedOuts}</strong>
                      </p>
                      <p className="omaha-split-line omaha-split-subtle">
                        平分OUTS：{holdemSplitUi.metrics.tieOutsCount} · 反超所选：
                        {holdemSplitUi.metrics.selectedWinTypesUnionCount}
                      </p>
                      {!holdemSplitUi.zeroUnion ? (
                        <>
                          <p className="omaha-split-line omaha-split-subtle">明细：{holdemSplitUi.detailLine}</p>
                          {holdemSplitUi.uniq.map((id) => {
                            const lab = OMAHA_SPLIT_PURCHASE_OPTIONS.find((x) => x.id === id)?.label ?? id
                            const cards = holdemSplitUi.metrics.categoryCardsDisplay[id]?.trim()
                            const n = holdemSplitUi.metrics.outsByCategory[id] ?? 0
                            return (
                              <p key={id} className="omaha-split-line omaha-split-card-detail">
                                {lab}：{cards || '无'}
                                {n > 0 ? `（${n}）` : ''}
                              </p>
                            )
                          })}
                        </>
                      ) : null}

                      <p className="omaha-split-line">
                        所选赔率：<strong>{formatOdds(holdemSplitUi.metrics.selectedOdds)}</strong>
                      </p>

                      {holdemSplitUi.includesChop ? (
                        <p className="omaha-split-line">
                          平分赔付上限：
                          {holdemSplitUi.halfPot !== null ? holdemSplitUi.halfPot.toFixed(2) : '待确认'}
                        </p>
                      ) : null}

                      {holdemSplitUi.buyEmpty && !holdemSplitUi.zeroUnion ? (
                        <p className="omaha-split-hint">输入购买金额后显示预计赔付。</p>
                      ) : null}
                      {holdemSplitUi.status === 'invalidBuy' ? (
                        <p className="holdem-custom-invalid">请输入大于 0 的金额。</p>
                      ) : null}
                      {!holdemSplitUi.buyEmpty &&
                      holdemSplitUi.buyValid &&
                      !holdemSplitUi.zeroUnion &&
                      holdemSplitUi.status === 'oddsPending' ? (
                        <p className="omaha-split-line">
                          预计赔付：<strong>待确认</strong>
                        </p>
                      ) : null}
                      {!holdemSplitUi.buyEmpty && holdemSplitUi.buyValid && holdemSplitUi.payout !== null ? (
                        <p
                          className={
                            holdemSplitUi.status === 'overPot' || holdemSplitUi.status === 'overChopHalf'
                              ? 'omaha-split-line omaha-split-warn'
                              : 'omaha-split-line'
                          }
                        >
                          预计赔付：<strong>{holdemSplitUi.payout.toFixed(2)}</strong>
                        </p>
                      ) : null}
                      {holdemSplitUi.warnLine ? (
                        <p className="omaha-split-line omaha-split-warn">{holdemSplitUi.warnLine}</p>
                      ) : null}
                      {holdemSplitUi.mixedChopNote ? (
                        <p className="omaha-split-line omaha-split-subtle">
                          包含平分购买，平分赔付最高为底池一半，现场确认赔付规则。
                        </p>
                      ) : null}

                      <label className="omaha-split-bringback omaha-split-bringback-distinguished">
                        <input
                          type="checkbox"
                          checked={holdemSplitBringback}
                          onChange={(event) => setHoldemSplitBringback(event.target.checked)}
                        />
                        <span>平分带回</span>
                      </label>

                      {holdemSplitBringback ? (
                        <p className="omaha-split-line">
                          平分带回：
                          <strong>
                            {!holdemSplitUi.pick && !holdemSplitUi.badBoard && holdemSplitUi.bringbackAmt !== null
                              ? holdemSplitUi.bringbackAmt.toFixed(2)
                              : '待确认'}
                          </strong>
                        </p>
                      ) : null}

                      {!holdemSplitUi.pick && !holdemSplitUi.badBoard && (holdemSplitUi.zeroUnion || !holdemSplitUi.buyEmpty) ? (
                        <p className="omaha-split-line omaha-split-status">
                          状态：
                          {holdemSplitUi.status === 'invalidBuy'
                            ? '金额无效'
                            : holdemSplitUi.status === 'noTieOuts'
                              ? '当前没有可买的平分 OUTS。'
                              : holdemSplitUi.status === 'noSelectedOuts'
                                ? '当前所选类型没有可买 OUTS。'
                                : holdemSplitUi.status === 'oddsPending'
                                  ? '赔率待确认'
                                  : holdemSplitUi.status === 'overPot'
                                    ? '超过总底池'
                                    : holdemSplitUi.status === 'overChopHalf'
                                      ? '平分赔付超过底池一半'
                                      : '可买'}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}

              <p className="holdem-result-footnote">{result.algorithmStatus}</p>
            </>
          ) : (
            <>
              <div className="result-share-metrics" aria-label="核心数据">
                <p className="result-share-section-label">核心数据</p>
                <div className="result-grid">
                  <ResultItem label="当前领先方" value={`玩家 ${result.leader}`} />
                  <ResultItem label="当前落后方" value={`玩家 ${result.underdog}`} />
                  <ResultItem label={result.outsDisplayLabel} value={`${result.outs}`} />
                  <ResultItem label="保险命中概率" value={formatPercent(result.hitProbability)} />
                  <ResultItem label={result.oddsLineLabel} value={formatOdds(result.defaultOdds)} />
                  <ResultItem label="剩余牌数" value={`${result.remainingCards}`} />
                  <ResultItem label="买保本金额" value={formatAmount(result.breakEvenInsurance)} />
                  <ResultItem label="买满池金额" value={formatAmount(result.fullPotInsurance)} />
                </div>
              </div>

              <div className="result-share-secondary">
                <div className="advice-box">
                  <strong>行动建议</strong>
                  <p>{result.advice}</p>
                </div>

                <div className="algorithm-box">
                  <strong>算法状态说明</strong>
                  <p>{result.algorithmStatus}</p>
                </div>
              </div>
            </>
          )}

          <p className="result-share-disclaimer" role="note">
            说明：结果仅供线下牌局保险计算参考，请以实际牌局规则为准。
          </p>
          <div className="result-share-actions">
            <button className="copy-button" type="button" onClick={handleCopy}>
              复制结果文本
            </button>
            {copyStatus && <p className="copy-status">{copyStatus}</p>}
          </div>
        </section>
      )}

      <footer className="release-footer">
        <p className="release-footer-line">
          测试版提示：本工具仅辅助计算，实际保险赔率和结算请以牌局约定为准。
        </p>
        <p className="release-footer-line">
          隐私说明：所有计算仅在本机浏览器完成，不登录，不上传，不保存牌局数据。
        </p>
      </footer>
    </main>
  )
}

function ShortDeckForm({
  form,
  pickerHint,
  openZone,
  onTogglePickerZone,
  onToggleCard,
  onStreetChange,
  onPotChange,
  onAllInChange,
  onLeaderChange,
}: {
  form: FormState
  pickerHint: string
  openZone: 'leader' | 'underdog' | 'board' | null
  onTogglePickerZone: (zone: 'leader' | 'underdog' | 'board') => void
  onToggleCard: (zone: 'leader' | 'underdog' | 'board', code: string) => void
  onStreetChange: (street: Street) => void
  onPotChange: (value: string) => void
  onAllInChange: (value: string) => void
  onLeaderChange: (player: Player) => void
}) {
  const leader = form.shortDeckLeaderCodes ?? []
  const under = form.shortDeckUnderdogCodes ?? []
  const board = form.shortDeckBoardCodes ?? []
  const sdStreet = shortDeckEffectiveStreet(form.street)
  const maxBoard = shortDeckMaxBoardCards(sdStreet)

  useEffect(() => {
    if (form.street !== 'flop' && form.street !== 'turn') {
      onStreetChange('flop')
    }
  }, [form.street, onStreetChange])

  return (
    <div className="game-form-body">
      <p className="format-tip short-deck-format-tip">
        只可选 6–A（36 张），无 2–5。花色：h 红桃、s 黑桃、d 方块、c 梅花。
      </p>
      <div className="holdem-hands-row">
        <HoldemHandMini
          title="领先方"
          selectedCodes={leader}
          isOpen={openZone === 'leader'}
          onToggleOpen={() => onTogglePickerZone('leader')}
          onToggle={(code) => onToggleCard('leader', code)}
        />
        <HoldemHandMini
          title="落后方"
          selectedCodes={under}
          isOpen={openZone === 'underdog'}
          onToggleOpen={() => onTogglePickerZone('underdog')}
          onToggle={(code) => onToggleCard('underdog', code)}
        />
      </div>
      {openZone === 'leader' ? (
        <HoldemCardPickerSheet
          ariaLabel="领先方选牌"
          maxCount={2}
          selectedCodes={leader}
          otherCodes={new Set([...under, ...board])}
          onToggle={(code) => onToggleCard('leader', code)}
          gridRanks={SHORT_DECK_GRID_RANKS}
        />
      ) : null}
      {openZone === 'underdog' ? (
        <HoldemCardPickerSheet
          ariaLabel="落后方选牌"
          maxCount={2}
          selectedCodes={under}
          otherCodes={new Set([...leader, ...board])}
          onToggle={(code) => onToggleCard('underdog', code)}
          gridRanks={SHORT_DECK_GRID_RANKS}
        />
      ) : null}

      <div className={`holdem-board-wrap${maxBoard === 0 ? ' is-disabled' : ''}`}>
        <div className="holdem-board-inline">
          <span className="holdem-board-title">公共牌</span>
          <div className="holdem-board-chips">
            {board.length === 0 ? (
              <span className="holdem-selected-empty">未选择</span>
            ) : (
              board.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="holdem-chip holdem-chip-sm playing-card-chip"
                  onClick={() => onToggleCard('board', code)}
                >
                  {formatCardCodeForDisplay(code)}
                </button>
              ))
            )}
          </div>
          {maxBoard > 0 ? (
            <button
              type="button"
              className="pick-toggle pick-toggle-compact"
              onClick={() => onTogglePickerZone('board')}
            >
              {openZone === 'board' ? '收起' : '改牌'}
            </button>
          ) : null}
        </div>
      </div>
      {openZone === 'board' && maxBoard > 0 ? (
        <HoldemCardPickerSheet
          ariaLabel="公共牌选牌"
          maxCount={maxBoard}
          selectedCodes={board}
          otherCodes={new Set([...leader, ...under])}
          onToggle={(code) => onToggleCard('board', code)}
          gridRanks={SHORT_DECK_GRID_RANKS}
        />
      ) : null}

      <div className="holdem-fields-compact">
        <div className="field-group holdem-leader-row">
          <span className="holdem-field-label">当前领先方</span>
          <div className="segmented holdem-seg-inline">
            {(['A', 'B'] as Player[]).map((player) => (
              <button
                key={player}
                type="button"
                className={form.leader === player ? 'segment is-active' : 'segment'}
                onClick={() => onLeaderChange(player)}
              >
                玩家 {player}
              </button>
            ))}
          </div>
        </div>
        <label className="holdem-street-row">
          <span className="holdem-field-label">当前街</span>
          <select
            className="holdem-select-tight"
            value={sdStreet}
            onChange={(event) => onStreetChange(event.target.value as Street)}
          >
            {streetOptionsShortDeck.map((street) => (
              <option key={street.value} value={street.value}>
                {street.label}
              </option>
            ))}
          </select>
        </label>
        <div className="holdem-money-row">
          <label className="holdem-money-pair">
            <span className="holdem-field-label">总底池</span>
            <input
              className="holdem-input-tight"
              inputMode="decimal"
              min="0"
              type="number"
              value={form.potAmount}
              onChange={(event) => onPotChange(event.target.value)}
            />
          </label>
          <label className="holdem-money-pair">
            <span className="holdem-field-label">投入</span>
            <input
              className="holdem-input-tight"
              inputMode="decimal"
              min="0"
              type="number"
              value={form.allInAmount}
              onChange={(event) => onAllInChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      {pickerHint ? <p className="picker-hint">{pickerHint}</p> : null}
    </div>
  )
}

function OmahaForm({
  form,
  pickerHint,
  openZone,
  onTogglePickerZone,
  onToggleCard,
  onStreetChange,
  onPotChange,
  onAllInChange,
  onLeaderChange,
}: {
  form: FormState
  pickerHint: string
  openZone: 'leader' | 'underdog' | 'board' | null
  onTogglePickerZone: (zone: 'leader' | 'underdog' | 'board') => void
  onToggleCard: (zone: 'leader' | 'underdog' | 'board', code: string) => void
  onStreetChange: (street: Street) => void
  onPotChange: (value: string) => void
  onAllInChange: (value: string) => void
  onLeaderChange: (player: Player) => void
}) {
  const leader = form.omahaLeaderCodes ?? []
  const under = form.omahaUnderdogCodes ?? []
  const board = form.omahaBoardCodes ?? []
  const omahaStreet = omahaEffectiveStreet(form.street)
  const maxBoard = omahaMaxBoardCards(omahaStreet)

  useEffect(() => {
    if (form.street !== 'flop' && form.street !== 'turn') {
      onStreetChange('flop')
    }
  }, [form.street, onStreetChange])

  return (
    <div className="game-form-body">
      <div className="holdem-hands-row">
        <HoldemHandMini
          title="领先方"
          selectedCodes={leader}
          isOpen={openZone === 'leader'}
          onToggleOpen={() => onTogglePickerZone('leader')}
          onToggle={(code) => onToggleCard('leader', code)}
          selectedRowClassName="holdem-selected-row-omaha"
        />
        <HoldemHandMini
          title="落后方"
          selectedCodes={under}
          isOpen={openZone === 'underdog'}
          onToggleOpen={() => onTogglePickerZone('underdog')}
          onToggle={(code) => onToggleCard('underdog', code)}
          selectedRowClassName="holdem-selected-row-omaha"
        />
      </div>
      {openZone === 'leader' ? (
        <HoldemCardPickerSheet
          ariaLabel="领先方选牌"
          maxCount={4}
          selectedCodes={leader}
          otherCodes={new Set([...under, ...board])}
          onToggle={(code) => onToggleCard('leader', code)}
        />
      ) : null}
      {openZone === 'underdog' ? (
        <HoldemCardPickerSheet
          ariaLabel="落后方选牌"
          maxCount={4}
          selectedCodes={under}
          otherCodes={new Set([...leader, ...board])}
          onToggle={(code) => onToggleCard('underdog', code)}
        />
      ) : null}

      <div className={`holdem-board-wrap${maxBoard === 0 ? ' is-disabled' : ''}`}>
        <div className="holdem-board-inline">
          <span className="holdem-board-title">公共牌</span>
          <div className="holdem-board-chips">
            {board.length === 0 ? (
              <span className="holdem-selected-empty">未选择</span>
            ) : (
              board.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="holdem-chip holdem-chip-sm playing-card-chip"
                  onClick={() => onToggleCard('board', code)}
                >
                  {formatCardCodeForDisplay(code)}
                </button>
              ))
            )}
          </div>
          {maxBoard > 0 ? (
            <button
              type="button"
              className="pick-toggle pick-toggle-compact"
              onClick={() => onTogglePickerZone('board')}
            >
              {openZone === 'board' ? '收起' : '改牌'}
            </button>
          ) : null}
        </div>
      </div>
      {openZone === 'board' && maxBoard > 0 ? (
        <HoldemCardPickerSheet
          ariaLabel="公共牌选牌"
          maxCount={maxBoard}
          selectedCodes={board}
          otherCodes={new Set([...leader, ...under])}
          onToggle={(code) => onToggleCard('board', code)}
        />
      ) : null}

      <div className="holdem-fields-compact">
        <div className="field-group holdem-leader-row">
          <span className="holdem-field-label">当前领先方</span>
          <div className="segmented holdem-seg-inline">
            {(['A', 'B'] as Player[]).map((player) => (
              <button
                key={player}
                type="button"
                className={form.leader === player ? 'segment is-active' : 'segment'}
                onClick={() => onLeaderChange(player)}
              >
                玩家 {player}
              </button>
            ))}
          </div>
        </div>
        <label className="holdem-street-row">
          <span className="holdem-field-label">当前街</span>
          <select
            className="holdem-select-tight"
            value={omahaStreet}
            onChange={(event) => onStreetChange(event.target.value as Street)}
          >
            {streetOptionsOmaha.map((street) => (
              <option key={street.value} value={street.value}>
                {street.label}
              </option>
            ))}
          </select>
        </label>
        <div className="holdem-money-row">
          <label className="holdem-money-pair">
            <span className="holdem-field-label">总底池</span>
            <input
              className="holdem-input-tight"
              inputMode="decimal"
              min="0"
              type="number"
              value={form.potAmount}
              onChange={(event) => onPotChange(event.target.value)}
            />
          </label>
          <label className="holdem-money-pair">
            <span className="holdem-field-label">投入</span>
            <input
              className="holdem-input-tight"
              inputMode="decimal"
              min="0"
              type="number"
              value={form.allInAmount}
              onChange={(event) => onAllInChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      {pickerHint ? <p className="picker-hint">{pickerHint}</p> : null}
    </div>
  )
}

function HoldemForm({
  form,
  showPairInsurance,
  pickerHint,
  openZone,
  onTogglePickerZone,
  onToggleCard,
  onStreetChange,
  onPotChange,
  onAllInChange,
  onPairInsuranceChange,
}: {
  form: FormState
  showPairInsurance: boolean
  pickerHint: string
  openZone: 'leader' | 'underdog' | 'board' | null
  onTogglePickerZone: (zone: 'leader' | 'underdog' | 'board') => void
  onToggleCard: (zone: 'leader' | 'underdog' | 'board', code: string) => void
  onStreetChange: (street: Street) => void
  onPotChange: (value: string) => void
  onAllInChange: (value: string) => void
  onPairInsuranceChange: (mode: HoldemPreflopPairInsurance) => void
}) {
  const leader = form.holdemLeaderCodes ?? []
  const under = form.holdemUnderdogCodes ?? []
  const board = form.holdemBoardCodes ?? []
  const maxBoard = holdemMaxBoardCards(form.street)

  return (
    <div className="game-form-body">
      <div className="holdem-hands-row">
        <HoldemHandMini
          title="领先方"
          selectedCodes={leader}
          isOpen={openZone === 'leader'}
          onToggleOpen={() => onTogglePickerZone('leader')}
          onToggle={(code) => onToggleCard('leader', code)}
        />
        <HoldemHandMini
          title="落后方"
          selectedCodes={under}
          isOpen={openZone === 'underdog'}
          onToggleOpen={() => onTogglePickerZone('underdog')}
          onToggle={(code) => onToggleCard('underdog', code)}
        />
      </div>
      {openZone === 'leader' ? (
        <HoldemCardPickerSheet
          ariaLabel="领先方选牌"
          maxCount={2}
          selectedCodes={leader}
          otherCodes={new Set([...under, ...board])}
          onToggle={(code) => onToggleCard('leader', code)}
        />
      ) : null}
      {openZone === 'underdog' ? (
        <HoldemCardPickerSheet
          ariaLabel="落后方选牌"
          maxCount={2}
          selectedCodes={under}
          otherCodes={new Set([...leader, ...board])}
          onToggle={(code) => onToggleCard('underdog', code)}
        />
      ) : null}

      <div className={`holdem-board-wrap${maxBoard === 0 ? ' is-disabled' : ''}`}>
        <div className="holdem-board-inline">
          <span className="holdem-board-title">公共牌</span>
          <div className="holdem-board-chips">
            {board.length === 0 ? (
              <span className="holdem-selected-empty">未选择</span>
            ) : (
              board.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="holdem-chip holdem-chip-sm playing-card-chip"
                  onClick={() => onToggleCard('board', code)}
                >
                  {formatCardCodeForDisplay(code)}
                </button>
              ))
            )}
          </div>
          {maxBoard > 0 ? (
            <button
              type="button"
              className="pick-toggle pick-toggle-compact"
              onClick={() => onTogglePickerZone('board')}
            >
              {openZone === 'board' ? '收起' : '改牌'}
            </button>
          ) : null}
        </div>
      </div>
      {openZone === 'board' && maxBoard > 0 ? (
        <HoldemCardPickerSheet
          ariaLabel="公共牌选牌"
          maxCount={maxBoard}
          selectedCodes={board}
          otherCodes={new Set([...leader, ...under])}
          onToggle={(code) => onToggleCard('board', code)}
        />
      ) : null}

      <div className="holdem-fields-compact">
        <label className="holdem-street-row">
          <span className="holdem-field-label">当前街</span>
          <select
            className="holdem-select-tight"
            value={form.street === 'river' ? 'turn' : form.street}
            onChange={(event) => onStreetChange(event.target.value as Street)}
          >
            {streetOptionsHoldem.map((street) => (
              <option key={street.value} value={street.value}>
                {street.label}
              </option>
            ))}
          </select>
        </label>
        <div className="holdem-money-row">
          <label className="holdem-money-pair">
            <span className="holdem-field-label">总底池</span>
            <input
              className="holdem-input-tight"
              inputMode="decimal"
              min="0"
              type="number"
              value={form.potAmount}
              onChange={(event) => onPotChange(event.target.value)}
            />
          </label>
          <label className="holdem-money-pair">
            <span className="holdem-field-label">投入</span>
            <input
              className="holdem-input-tight"
              inputMode="decimal"
              min="0"
              type="number"
              value={form.allInAmount}
              onChange={(event) => onAllInChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      {showPairInsurance ? (
        <div className="holdem-pair-insurance field-group">
          <span className="holdem-field-label">保险类型</span>
          <div className="segmented holdem-pair-insurance-seg">
            <button
              type="button"
              className={
                (form.holdemPreflopPairInsurance ?? 'setMining45') === 'setMining45'
                  ? 'segment is-active'
                  : 'segment'
              }
              onClick={() => onPairInsuranceChange('setMining45')}
            >
              中暗三保险 4.5倍
            </button>
            <button
              type="button"
              className={
                form.holdemPreflopPairInsurance === 'overtake35' ? 'segment is-active' : 'segment'
              }
              onClick={() => onPairInsuranceChange('overtake35')}
            >
              普通反超保险 3.5倍
            </button>
          </div>
        </div>
      ) : null}

      {pickerHint ? <p className="picker-hint">{pickerHint}</p> : null}
    </div>
  )
}

function HoldemHandMini({
  title,
  selectedCodes,
  onToggle,
  isOpen,
  onToggleOpen,
  selectedRowClassName,
}: {
  title: string
  selectedCodes: string[]
  onToggle: (code: string) => void
  isOpen: boolean
  onToggleOpen: () => void
  /** 附加在已选牌行上的 class，奥马哈 4 张时可换行 */
  selectedRowClassName?: string
}) {
  const rowCls = ['holdem-selected-row', 'holdem-selected-row-tight', selectedRowClassName].filter(Boolean).join(' ')
  return (
    <div className="holdem-hand-mini">
      <div className="holdem-hand-mini-head">
        <span className="holdem-pick-title">{title}</span>
        <button type="button" className="pick-toggle pick-toggle-compact" onClick={onToggleOpen}>
          {isOpen ? '收起' : '改牌'}
        </button>
      </div>
      <div className={rowCls}>
        {selectedCodes.length === 0 ? (
          <span className="holdem-selected-empty">未选择</span>
        ) : (
          selectedCodes.map((code) => (
            <button key={code} type="button" className="holdem-chip holdem-chip-sm playing-card-chip" onClick={() => onToggle(code)}>
              {formatCardCodeForDisplay(code)}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function HoldemCardPickerSheet({
  ariaLabel,
  selectedCodes,
  maxCount,
  otherCodes,
  onToggle,
  gridRanks,
}: {
  ariaLabel: string
  selectedCodes: string[]
  maxCount: number
  otherCodes: Set<string>
  onToggle: (code: string) => void
  gridRanks?: readonly string[]
}) {
  const ranks: readonly string[] = gridRanks ?? HOLDEM_GRID_RANKS
  return (
    <div className="holdem-picker-sheet">
      <p className="picker-legend picker-legend-inline">♥红桃 ♠黑桃 ♦方块 ♣梅花</p>
      <div className="card-grid" aria-label={ariaLabel}>
        {ranks.map((rank) => (
          <div className="card-grid-row" key={rank}>
            {HOLDEM_SUITS.map((suit) => {
              const code = `${rank}${suit}`
              const isSelected = selectedCodes.includes(code)
              const isBlocked = !isSelected && otherCodes.has(code)
              const atCap = !isSelected && selectedCodes.length >= maxCount
              const cls = ['card-btn']
              if (isSelected) {
                cls.push('is-selected')
              }
              if (isBlocked || atCap) {
                cls.push('is-blocked')
              }
              cls.push(`suit-${suit}`)
              return (
                <button
                  key={code}
                  type="button"
                  className={cls.join(' ')}
                  disabled={isBlocked || atCap}
                  onClick={() => onToggle(code)}
                >
                  {formatCardCodeForDisplay(code)}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App
