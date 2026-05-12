import { useMemo, useState } from 'react'
import './App.css'
import {
  calculateInsurance,
  formatAmount,
  formatOdds,
  formatPercent,
  gameLabels,
  type GameType,
  type InsuranceResult,
  type Player,
  type Street,
} from './lib/insuranceCalculator'

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
}

const gameConfigs: GameConfig[] = [
  {
    type: 'holdem',
    label: '德州扑克',
    rules: ['标准 52 张牌', '每人 2 张手牌', '使用公共牌组成最佳五张牌'],
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

const streetOptions: { value: Street; label: string }[] = [
  { value: 'preflop', label: '翻前' },
  { value: 'flop', label: '翻牌' },
  { value: 'turn', label: '转牌' },
  { value: 'river', label: '河牌' },
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

function App() {
  const [activeGame, setActiveGame] = useState<GameType>('holdem')
  const [forms, setForms] = useState<Record<GameType, FormState>>(initialForms)
  const [result, setResult] = useState<InsuranceResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [copyStatus, setCopyStatus] = useState('')
  const activeConfig = useMemo(
    () => gameConfigs.find((game) => game.type === activeGame) ?? gameConfigs[0],
    [activeGame],
  )
  const activeForm = forms[activeGame]

  function updateForm(field: keyof FormState, value: string) {
    setForms((current) => ({
      ...current,
      [activeGame]: {
        ...current[activeGame],
        [field]: value,
      },
    }))
  }

  function handleCalculate() {
    const calculation = calculateInsurance({
      gameType: activeGame,
      playerAInput: activeForm.playerAInput,
      playerBInput: activeForm.playerBInput,
      boardInput: activeForm.boardInput,
      leader: activeForm.leader,
      street: activeForm.street,
      potAmount: Number(activeForm.potAmount),
      allInAmount: Number(activeForm.allInAmount),
    })

    setErrors(calculation.errors)
    setResult(calculation.result)
    setCopyStatus('')
  }

  async function handleCopy() {
    if (!result) {
      return
    }

    await navigator.clipboard.writeText(result.resultText)
    setCopyStatus('结果文本已复制')
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">线下两家 All-in</p>
        <h1>扑克保险工具 V1</h1>
        <p className="subtitle">只做当前领先方买保险，领先方由用户手动指定。</p>
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
            }}
          >
            {game.label}
          </button>
        ))}
      </nav>

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

      <section className="panel form-panel">
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
            {streetOptions.map((street) => (
              <option key={street.value} value={street.value}>
                {street.label}
              </option>
            ))}
          </select>
        </label>

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
          <div className="result-card-header">
            <div>
              <p className="eyebrow">截图转发卡片</p>
              <h2>{gameLabels[result.gameType]}保险结果</h2>
            </div>
            <span>{gameLabels[activeGame]}</span>
          </div>

          <div className="result-grid">
            <ResultItem label="当前领先方" value={`玩家 ${result.leader}`} />
            <ResultItem label="当前落后方" value={`玩家 ${result.underdog}`} />
            <ResultItem label={result.outsDisplayLabel} value={`${result.outs}`} />
            <ResultItem label="保险命中概率" value={formatPercent(result.hitProbability)} />
            <ResultItem label="默认赔率" value={formatOdds(result.defaultOdds)} />
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

          <button className="copy-button" type="button" onClick={handleCopy}>
            复制结果文本
          </button>
          {copyStatus && <p className="copy-status">{copyStatus}</p>}
        </section>
      )}
    </main>
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
