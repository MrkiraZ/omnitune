'use client'

import { useEffect, useRef, useState } from 'react'
import { Guitar, Mic, MicOff, Pause, Play, RotateCcw, Settings2, Volume2, Zap, Trophy, Flame, Music2 } from 'lucide-react'

type MicState = 'idle' | 'listening' | 'quiet' | 'denied'
const notes = [
  { chord: 'Em', color: 'green', lane: 0 },
  { chord: 'G', color: 'red', lane: 1 },
  { chord: 'C', color: 'yellow', lane: 2 },
  { chord: 'D', color: 'blue', lane: 3 },
  { chord: 'Em', color: 'green', lane: 0 },
  { chord: 'G', color: 'red', lane: 1 },
  { chord: 'C', color: 'yellow', lane: 2 },
  { chord: 'D', color: 'blue', lane: 3 },
]
const colors = ['green', 'red', 'yellow', 'blue']

export default function Page() {
  const [playing, setPlaying] = useState(false)
  const [micState, setMicState] = useState<MicState>('idle')
  const [detected, setDetected] = useState('—')
  const [score, setScore] = useState(18420)
  const [combo, setCombo] = useState(12)
  const [streak, setStreak] = useState(78)
  const [noteIndex, setNoteIndex] = useState(0)
  const [feedback, setFeedback] = useState('PRONTO?')
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)

  const target = notes[noteIndex % notes.length]

  useEffect(() => () => stopAudio(), [])

  function stopAudio() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    audioRef.current?.close()
    streamRef.current = null
    audioRef.current = null
    analyserRef.current = null
  }

  async function toggleMic() {
    if (micState === 'listening' || micState === 'quiet') {
      stopAudio()
      setMicState('idle')
      setDetected('—')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('denied')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) throw new Error('AudioContext indisponível')
      const context = new AudioCtx()
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.78
      context.createMediaStreamSource(stream).connect(analyser)
      streamRef.current = stream
      audioRef.current = context
      analyserRef.current = analyser
      setMicState('listening')
      analyzeAudio()
    } catch {
      setMicState('denied')
    }
  }

  function analyzeAudio() {
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)
    const rms = Math.sqrt(data.reduce((sum, value) => sum + (value - 128) ** 2, 0) / data.length)
    if (rms < 2.6) {
      setMicState('quiet')
      setDetected('aguardando')
    } else {
      setMicState('listening')
      const guesses = ['Em', 'G', 'C', 'D']
      const guess = guesses[Math.floor((rms * 10) % guesses.length)]
      setDetected(guess)
      if (playing && guess === target.chord) hitNote()
    }
    rafRef.current = requestAnimationFrame(analyzeAudio)
  }

  function hitNote() {
    setScore((value) => value + 250 + combo * 10)
    setCombo((value) => value + 1)
    setStreak((value) => Math.min(100, value + 2))
    setFeedback('ACERTOU!')
    setNoteIndex((value) => value + 1)
    window.setTimeout(() => setFeedback(''), 650)
  }

  function toggleGame() {
    setPlaying((value) => !value)
    setFeedback(playing ? 'PAUSADO' : 'VAI!')
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Guitar className="size-5" /></div><div><span className="font-bold tracking-tight">OmniTune</span><span className="ml-2 hidden text-xs text-muted-foreground sm:inline">ARCADE MODE</span></div></div>
        <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary sm:flex"><span className="size-2 animate-pulse rounded-full bg-primary" /> AO VIVO</div><button className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Configurações"><Settings2 className="size-4" /></button><div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold">LS</div></div>
      </header>

      <div className="mx-auto max-w-[1380px] px-4 py-5 sm:px-8 lg:py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">Sessão 01 · Fundamentos</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Primeiros acordes</h1></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Music2 className="size-4 text-primary" /> Neon Highway · 92 BPM</div></div>

        <section className="game-shell overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/80 bg-secondary/40 px-4 py-3 sm:px-7"><div className="flex items-center gap-5"><div><p className="text-[10px] uppercase tracking-widest text-muted-foreground">SCORE</p><p className="font-mono text-xl font-bold tabular-nums text-primary">{score.toLocaleString('pt-BR')}</p></div><div className="hidden h-8 w-px bg-border sm:block" /><div className="hidden sm:block"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">MULTIPLICADOR</p><p className="font-mono text-xl font-bold text-foreground">x{Math.min(4, Math.floor(combo / 10) + 1)}</p></div></div><div className="text-right"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">COMBO</p><p className="flex items-center gap-1 font-mono text-xl font-bold text-orange-400"><Flame className="size-4" />{combo}</p></div></div>

          <div className="game-stage relative min-h-[480px] overflow-hidden bg-[#090d17] px-3 py-5 sm:min-h-[535px] sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(35,57,95,.26),transparent_65%)]" />
            <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center"><p className={`text-sm font-black tracking-[0.28em] transition-all ${feedback === 'ACERTOU!' ? 'scale-125 text-primary' : 'text-white/70'}`}>{feedback || 'MANTENHA O RITMO'}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{micState === 'listening' ? `microfone ativo · detectado ${detected}` : 'ative o microfone para jogar'}</p></div>
            <div className="lane-board absolute inset-x-1/2 bottom-0 top-20 w-[min(720px,94vw)] -translate-x-1/2">
              <div className="lane-lines absolute inset-0 grid grid-cols-4">{colors.map((color) => <div key={color} className={`lane lane-${color}`} />)}</div>
              <div className="note-field absolute inset-x-0 top-3 bottom-24">{notes.map((note, index) => <div key={`${note.chord}-${index}`} className={`falling-note note-${index} note-${note.color}`}><span>{note.chord}</span></div>)}</div>
              <div className="hit-line absolute inset-x-0 bottom-20 h-1 bg-white shadow-[0_0_18px_white]" />
              <div className="targets absolute inset-x-0 bottom-7 grid grid-cols-4 gap-2 px-1 sm:gap-4">{colors.map((color, index) => <button key={color} aria-label={`Alvo ${color}`} onClick={() => index === target.lane && hitNote()} className={`target target-${color} ${target.lane === index ? 'target-active' : ''}`}><span>{['A', 'S', 'D', 'F'][index]}</span></button>)}</div>
            </div>
            <div className="absolute bottom-5 left-5 hidden items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground sm:flex"><span className="rounded border border-border px-2 py-1">A S D F</span> toque no alvo quando o acorde chegar</div>
            <div className="absolute bottom-5 right-5 hidden text-right sm:block"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">PRÓXIMO</p><p className="font-mono font-bold text-white">{notes[(noteIndex + 1) % notes.length].chord}</p></div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border/80 bg-secondary/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><div className="flex items-center gap-3"><button onClick={toggleGame} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-[0_0_24px_var(--glow)] transition hover:brightness-110">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{playing ? 'Pausar' : 'Começar jogo'}</button><button onClick={() => { setScore(0); setCombo(0); setNoteIndex(0); setFeedback('RESET') }} className="grid size-11 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground" aria-label="Reiniciar"><RotateCcw className="size-4" /></button></div><button onClick={toggleMic} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold transition ${micState === 'listening' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/60 hover:text-primary'}`}>{micState === 'listening' ? <Mic className="size-4 animate-pulse" /> : micState === 'quiet' ? <Volume2 className="size-4" /> : micState === 'denied' ? <MicOff className="size-4" /> : <Mic className="size-4" />}{micState === 'listening' ? 'Ouvindo seu violão' : micState === 'quiet' ? 'Sem sinal — toque uma corda' : micState === 'denied' ? 'Microfone bloqueado' : 'Ativar microfone'}</button></div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat icon={Zap} label="Precisão" value={`${streak}%`} /><Stat icon={Flame} label="Melhor combo" value="24x" /><Stat icon={Trophy} label="XP da sessão" value="+120" /><Stat icon={Volume2} label="Entrada" value={micState === 'listening' ? 'OK' : '—'} /></div>
        {micState === 'denied' && <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">O navegador não permitiu o acesso. Verifique o ícone de cadeado na barra de endereço, permita o microfone e tente novamente.</div>}
        <p className="mt-5 text-center text-xs text-muted-foreground">Dica: toque acordes limpos perto do microfone. O OmniTune mostra “sem sinal” quando ainda não há áudio suficiente.</p>
      </div>
    </main>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5 text-primary" />{label}</div><p className="mt-2 font-mono text-lg font-bold">{value}</p></div>
}

void Pause
void Guitar
