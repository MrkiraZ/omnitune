'use client'

import { useState } from 'react'
import {
  Activity,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Disc3,
  Guitar,
  Headphones,
  Mic,
  Pause,
  Play,
  Radio,
  Settings2,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  Waves,
  Zap,
} from 'lucide-react'

const chords = ['Em', 'G', 'C', 'D', 'Am']
const phases = [
  { label: 'Captura', detail: 'Entrada de áudio', icon: Mic, active: true },
  { label: 'Análise', detail: 'Detecção de acordes', icon: Waves, active: false },
  { label: 'Jogo', detail: 'Timing e feedback', icon: Zap, active: false },
  { label: 'Progresso', detail: 'Histórico e evolução', icon: Trophy, active: false },
]

export default function Page() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [micState, setMicState] = useState<'idle' | 'listening' | 'denied'>('idle')
  const [chordIndex, setChordIndex] = useState(0)
  const [combo, setCombo] = useState(12)

  const currentChord = chords[chordIndex]
  const nextChord = chords[(chordIndex + 1) % chords.length]

  async function toggleMicrophone() {
    if (micState === 'listening') {
      setMicState('idle')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('denied')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setMicState('listening')
    } catch {
      setMicState('denied')
    }
  }

  function advanceChord() {
    setChordIndex((index) => (index + 1) % chords.length)
    setCombo((value) => value + 1)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1520px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/70 px-6 py-7 lg:flex">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_28px_var(--glow)]"><Guitar className="size-5" /></div>
            <div><p className="font-semibold tracking-tight">OmniTune</p><p className="text-xs text-muted-foreground">treine diferente</p></div>
          </div>
          <nav className="mt-14 flex flex-col gap-2" aria-label="Navegação principal">
            <a className="flex items-center gap-3 rounded-xl bg-primary/10 px-3 py-3 text-sm font-medium text-primary" href="#treinar"><Disc3 className="size-4" />Treinar</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground" href="#explorar"><Headphones className="size-4" />Explorar</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground" href="#progresso"><BarChart3 className="size-4" />Progresso</a>
          </nav>
          <div className="mt-auto rounded-2xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">SEU NÍVEL</span><Sparkles className="size-4 text-primary" /></div>
            <p className="text-2xl font-semibold">Nível 04</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[68%] rounded-full bg-primary" /></div><p className="mt-2 text-xs text-muted-foreground">340 / 500 XP</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-8 lg:px-12 lg:pb-10 lg:pt-8">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Guitar className="size-4" /></div><span className="font-semibold">OmniTune</span></div>
            <div className="hidden lg:block"><p className="text-sm text-muted-foreground">Quarta-feira, 10 de setembro</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Hora de tocar, Lucas.</h1></div>
            <div className="ml-auto flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex"><span className="size-2 rounded-full bg-primary shadow-[0_0_10px_var(--glow)]" />Sistema pronto</div><button className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground" aria-label="Configurações"><Settings2 className="size-4" /></button><div className="grid size-9 place-items-center rounded-xl bg-secondary text-xs font-semibold">LS</div></div>
          </header>

          <div id="treinar" className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border border-primary/10" /><div className="pointer-events-none absolute -right-4 -top-8 size-44 rounded-full border border-primary/10" />
                <div className="relative flex flex-wrap items-start justify-between gap-5"><div><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary"><Target className="size-4" />Sessão guiada · 01</div><h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Primeiros acordes</h2><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Construa sua base com quatro acordes essenciais. Sem pressão, só progresso.</p></div><div className="rounded-2xl border border-border bg-background/50 px-4 py-3"><p className="text-xs text-muted-foreground">PROGRESSO</p><p className="mt-1 text-xl font-semibold">3 <span className="text-sm font-normal text-muted-foreground">/ 8 min</span></p></div></div>
                <div className="relative mt-8 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[38%] rounded-full bg-primary" /></div><span className="text-xs font-medium text-primary">38%</span></div>
                <button onClick={() => setIsPlaying((value) => !value)} className="relative mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_8px_26px_var(--glow)] transition hover:brightness-110">{isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}{isPlaying ? 'Pausar sessão' : 'Começar sessão'}<ChevronRight className="size-4" /></button>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3"><Metric icon={Zap} label="Sequência" value={`${combo}`} suffix="acordes" /><Metric icon={Target} label="Precisão" value="94" suffix="%" /><Metric icon={Trophy} label="XP ganho" value="+120" suffix="hoje" /></div>

              <div className="mt-6 rounded-3xl border border-border bg-card p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${micState === 'listening' ? 'animate-pulse bg-primary shadow-[0_0_12px_var(--glow)]' : 'bg-muted-foreground'}`} /><h3 className="font-semibold">Detector ao vivo</h3></div><p className="mt-1 text-sm text-muted-foreground">{micState === 'listening' ? 'Ouvindo seu instrumento...' : 'Ative o microfone para começar'}</p></div><button onClick={toggleMicrophone} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium transition hover:border-primary/50 hover:text-primary"><Mic className="size-4" />{micState === 'listening' ? 'Desativar' : 'Ativar microfone'}</button></div>
                  {micState === 'denied' && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">Não foi possível acessar o microfone. Você ainda pode navegar pela sessão no modo demonstração.</p>}
                  <div className="mt-7 flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-background px-4 py-8 text-center"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Acorde detectado</p><p className="mt-3 text-7xl font-semibold tracking-tighter text-primary">{currentChord}</p><div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />{micState === 'listening' ? '92% de confiança' : 'aguardando entrada'}<Volume2 className="ml-1 size-3.5" /></div><div className="mt-6 flex w-full max-w-md items-end justify-center gap-1.5" aria-label="Visualização da entrada de áudio">{[22,38,56,31,72,45,63,29,48,76,39,58,26,44,67,35,52,24].map((height, index) => <span key={index} className={`w-1.5 rounded-full transition-all ${micState === 'listening' ? 'bg-primary' : 'bg-muted'} `} style={{ height: `${height}px`, opacity: micState === 'listening' ? 0.35 + (index % 4) * 0.15 : 0.5 }} />)}</div></div>
                  <div className="mt-6 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Próximo acorde</p><p className="mt-1 text-lg font-semibold">{nextChord}</p></div><button onClick={advanceChord} disabled={!isPlaying} className="rounded-xl bg-secondary px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Confirmar acorde <Check className="ml-1 inline size-3.5" /></button></div>
                </div>
              </div>

            <aside className="flex flex-col gap-6">
              <div id="explorar" className="rounded-3xl border border-border bg-card p-5">
                <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Trilha atual</p><h3 className="mt-1 font-semibold">Fundamentos</h3></div><button className="text-muted-foreground hover:text-foreground" aria-label="Ajuda"><CircleHelp className="size-4" /></button></div>
                <div className="mt-6 flex items-center gap-2">{chords.map((chord, index) => <button key={chord} onClick={() => setChordIndex(index)} className={`grid size-11 place-items-center rounded-xl text-xs font-semibold transition ${index === chordIndex ? 'bg-primary text-primary-foreground shadow-[0_0_18px_var(--glow)]' : index < chordIndex ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>{chord}</button>)}</div>
                <div className="mt-6 flex items-center justify-between border-t border-border pt-5"><span className="text-xs text-muted-foreground">Aula 1 de 12</span><span className="text-xs font-medium text-primary">8% completo</span></div>
              </div>
              <div id="progresso" className="rounded-3xl border border-border bg-card p-5">
                <div className="flex items-center gap-2"><Radio className="size-4 text-primary" /><h3 className="font-semibold">Como funciona</h3></div>
                <div className="mt-5 flex flex-col gap-4">{phases.map(({ label, detail, icon: Icon, active }, index) => <div key={label} className="flex items-center gap-3"><div className={`grid size-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div>{index === 0 && <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">agora</span>}</div>)}</div>
              </div>
            </aside>
          </div>
        </section>
      </div>
      <nav className="fixed inset-x-4 bottom-4 z-10 flex items-center justify-around rounded-2xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur lg:hidden" aria-label="Navegação móvel"><a className="flex flex-col items-center gap-1 rounded-xl bg-primary/10 px-5 py-2 text-primary" href="#treinar"><Disc3 className="size-4" /><span className="text-[10px] font-medium">Treinar</span></a><a className="flex flex-col items-center gap-1 px-5 py-2 text-muted-foreground" href="#explorar"><Headphones className="size-4" /><span className="text-[10px] font-medium">Explorar</span></a><a className="flex flex-col items-center gap-1 px-5 py-2 text-muted-foreground" href="#progresso"><BarChart3 className="size-4" /><span className="text-[10px] font-medium">Progresso</span></a></nav>
    </main>
  )
}

function Metric({ icon: Icon, label, value, suffix }: { icon: typeof Zap; label: string; value: string; suffix: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><Icon className="size-4 text-primary" /><p className="mt-5 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value} <span className="text-xs font-normal text-muted-foreground">{suffix}</span></p></div>
}
