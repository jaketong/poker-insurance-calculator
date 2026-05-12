import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  calculateInsurance,
  collectHoldemResultLines,
  formatAmount,
  formatOdds,
  formatPercent,
  formatCardCodeForDisplay,
  gameLabels,
  HOLDEM_GAME_NAME,
  HOLDEM_GRID_RANKS,
  isHoldemPreflopPairVsPairScenario,
  parseCards,
  type GameType,
  type HoldemPreflopPairInsurance,
  type InsuranceInput,
  type InsuranceResult,
  type Player,
  type Street,
} from './lib/insuranceCalculator'

const HOLDEM_SUITS = ['h', 's', 'd', 'c'] as const

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
    rules: ['标准 52 张牌', '每人 4 张手牌', '必须严格使用 2 张手牌 + 3 张公共牌', '不能按德州扑克规则计算'],
    placeholders: {
      playerA: 'Ah As Kd Qd',
      playerB: 'Jc Tc 9h 8h',
      board: 'Kh Qs 2d',
    },
  },
  {
    type: 'shortDeck',
    label: '短牌',
    rules: ['36 张牌，只使用 6 到 A', 'A6789 默认算顺子', '同花大于葫芦', '顺子大于三条'],
    placeholders: {
      playerA: 'Ah Kh',
      playerB: 'Qs Js',
      board: 'Ts 9s 6d',
    },
  },
]

const streetOptionsAll: { value: Street; label: string }[] = [
  { value: 'preflop', label: '翻前' },
  { value: 'flop', label: '翻牌' },
  { value: 'turn', label: '转牌' },
  { value: 'river', label: '河牌' },
]

const streetOptionsHoldem: { value: Street; label: string }[] = [
  { value: 'preflop', label: '翻前' },
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
  },
  shortDeck: {
    playerAInput: 'Ah Kh',
    playerBInput: 'Qs Js',
    boardInput: 'Ts 9s 6d',
    leader: 'A',
    street: 'flop',
    potAmount: '10000',
    allInAmount: '3000',
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
  const holdemLenRef = useRef<{ l: number; u: number; b: number } | null>(null)

  useEffect(() => {
    holdemLenRef.current = null
  }, [holdemPickerOpen])

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

  const activeConfig = useMemo(
    () => gameConfigs.find((game) => game.type === activeGame) ?? gameConfigs[0],
    [activeGame],
  )
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
        : raw

    const safeStreet: Street =
      activeGame === 'holdem' && form.street === 'river' ? 'turn' : form.street

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

    try {
      const calculation = calculateInsurance(payload)

      if (activeGame === 'holdem' && form.street === 'river') {
        setForms((c) => ({ ...c, holdem: { ...c.holdem, street: 'turn' } }))
      }

      setErrors(calculation.errors)
      setResult(calculation.result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrors([`计算过程出错：${msg}`])
      setResult(null)
    }

    setCopyStatus('')
    setPickerHint('')
    setHoldemPickerOpen(null)
    if (activeGame === 'holdem') {
      setHoldemResultCustomBuy('')
    }
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
    <main className="app-shell">
      <header className="app-header">
        <h1 className="app-title-main">扑克保险 V1</h1>
        {activeGame !== 'holdem' ? (
          <p className="subtitle">只做当前领先方买保险，领先方由用户手动指定。</p>
        ) : null}
      </header>

      <nav className="game-tabs" aria-label="游戏类型">
        {gameConfigs.map((game) => (
          <button
            className={game.type === activeGame ? 'tab is-active' : 'tab'}
            key={game.type}
            type="button"
            onClick={() => {
              setActiveGame(game.type)
              setResult(null)
              setErrors([])
              setCopyStatus('')
              setPickerHint('')
              setHoldemPickerOpen(null)
              setHoldemResultCustomBuy('')
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

      {activeGame !== 'holdem' ? (
        <section className="panel">
          <div className="section-title">
            <span>{activeConfig.label}</span>
            <strong>当前游戏</strong>
          </div>
          <ul className="rule-list">
            {activeConfig.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="format-tip">
            输入格式：A/K/Q/J/T/9/8/7/6/5/4/3/2 表示点数，h/s/d/c 表示花色，例如 Ah = 红桃 A，Ts = 黑桃 T。
          </p>
          <p className="format-tip">顶一张：当前街不买，先看下一张后重新计算。顶三张：翻前 All-in 时先等三张公共牌出来后重新计算。</p>
        </section>
      ) : null}

      <section className={`panel form-panel${activeGame === 'holdem' ? ' form-panel-holdem' : ''}`}>
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
        ) : (
          <>
            <label>
              玩家 A 手牌
              <input
                value={activeForm.playerAInput}
                placeholder={activeConfig.placeholders.playerA}
                onChange={(event) => updateForm('playerAInput', event.target.value)}
              />
            </label>

            <label>
              玩家 B 手牌
              <input
                value={activeForm.playerBInput}
                placeholder={activeConfig.placeholders.playerB}
                onChange={(event) => updateForm('playerBInput', event.target.value)}
              />
            </label>

            <label>
              公共牌
              <input
                value={activeForm.boardInput}
                placeholder={activeConfig.placeholders.board}
                onChange={(event) => updateForm('boardInput', event.target.value)}
              />
            </label>

            <div className="field-group">
              <span>当前领先方</span>
              <div className="segmented">
                {(['A', 'B'] as Player[]).map((player) => (
                  <button
                    className={activeForm.leader === player ? 'segment is-active' : 'segment'}
                    key={player}
                    type="button"
                    onClick={() => updateForm('leader', player)}
                  >
                    玩家 {player}
                  </button>
                ))}
              </div>
            </div>

            <label>
              当前街
              <select value={activeForm.street} onChange={(event) => updateForm('street', event.target.value)}>
                {streetOptionsAll.map((street) => (
                  <option key={street.value} value={street.value}>
                    {street.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {activeGame !== 'holdem' ? (
          <>
            <label>
              总底池
              <input
                inputMode="decimal"
                min="0"
                type="number"
                value={activeForm.potAmount}
                onChange={(event) => updateForm('potAmount', event.target.value)}
              />
            </label>

            <label>
              领先方本次 All-in 投入
              <input
                inputMode="decimal"
                min="0"
                type="number"
                value={activeForm.allInAmount}
                onChange={(event) => updateForm('allInAmount', event.target.value)}
              />
            </label>
          </>
        ) : null}

        {errors.length > 0 && (
          <div className="error-box">
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
        <section className="result-card" aria-label="保险计算结果">
          {result.gameType === 'holdem' && result.leaderHandDisplay !== undefined ? (
            <div className="result-card-header result-card-header-holdem">
              <h2 className="holdem-game-title">{HOLDEM_GAME_NAME}保险结果</h2>
            </div>
          ) : (
            <div className="result-card-header">
              <div>
                <p className="eyebrow">截图转发卡片</p>
                <h2>{`${gameLabels[result.gameType]}保险结果`}</h2>
              </div>
              <span className="result-game-badge">{gameLabels[result.gameType]}</span>
            </div>
          )}

          {result.gameType === 'holdem' && result.leaderHandDisplay !== undefined ? (
            <>
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

              <p className="holdem-result-footnote">{result.algorithmStatus}</p>
            </>
          ) : (
            <>
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

              <div className="advice-box">
                <strong>行动建议</strong>
                <p>{result.advice}</p>
              </div>

              <div className="algorithm-box">
                <strong>算法状态说明</strong>
                <p>{result.algorithmStatus}</p>
              </div>
            </>
          )}

          <button className="copy-button" type="button" onClick={handleCopy}>
            复制结果文本
          </button>
          {copyStatus && <p className="copy-status">{copyStatus}</p>}
        </section>
      )}
    </main>
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
    <>
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
                  className="holdem-chip holdem-chip-sm"
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
    </>
  )
}

function HoldemHandMini({
  title,
  selectedCodes,
  onToggle,
  isOpen,
  onToggleOpen,
}: {
  title: string
  selectedCodes: string[]
  onToggle: (code: string) => void
  isOpen: boolean
  onToggleOpen: () => void
}) {
  return (
    <div className="holdem-hand-mini">
      <div className="holdem-hand-mini-head">
        <span className="holdem-pick-title">{title}</span>
        <button type="button" className="pick-toggle pick-toggle-compact" onClick={onToggleOpen}>
          {isOpen ? '收起' : '改牌'}
        </button>
      </div>
      <div className="holdem-selected-row holdem-selected-row-tight">
        {selectedCodes.length === 0 ? (
          <span className="holdem-selected-empty">未选择</span>
        ) : (
          selectedCodes.map((code) => (
            <button key={code} type="button" className="holdem-chip holdem-chip-sm" onClick={() => onToggle(code)}>
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
}: {
  ariaLabel: string
  selectedCodes: string[]
  maxCount: number
  otherCodes: Set<string>
  onToggle: (code: string) => void
}) {
  return (
    <div className="holdem-picker-sheet">
      <p className="picker-legend picker-legend-inline">♥红桃 ♠黑桃 ♦方块 ♣梅花</p>
      <div className="card-grid" aria-label={ariaLabel}>
        {HOLDEM_GRID_RANKS.map((rank) => (
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
