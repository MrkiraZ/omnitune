"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Headphones, Mic, Pause, Play, RotateCcw, Waves } from "lucide-react"

type NoteEvent = { note: string; string: number; fret: number; time: number }
type Track = { id: string; title: string; description: string; key: string; bpm: number; events: NoteEvent[] }

const tracks: Track[] = [
  { id: "spider", title: "Aranha 1-2-3-4", description: "Exercício de coordenação", key: "E", bpm: 60, events: ["E","F","F#","G","G#","A","A#","B","C","C#","D","D#"].map((note, i) => ({ note, string: 6, fret: i, time: i })) },
  { id: "joy", title: "Ode à Alegria", description: "Melodia de Beethoven", key: "C", bpm: 72, events: ["E","E","F","G","G","F","E","D","C","C","D","E","E","D","D"].map((note, i) => ({ note, string: 1, fret: Math.max(0, i % 5), time: i })) },
  { id: "smoke", title: "Smoke on the Water", description: "Riff principal", key: "G", bpm: 90, events: ["G","A#","C","G","A#","C","G","A#","C","D#"].map((note, i) => ({ note, string: 4, fret: [0,3,5,0,3,5,0,3,5,6][i], time: i })) },
]

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const harmonic: Record<string, string[]> = { C: ["C", "Dm", "Em", "F", "G", "Am"], G: ["G", "Am", "Bm", "C", "D", "Em"], E: ["E", "F#m", "G#m", "A", "B", "C#m"] }
const strings = ["e", "B", "G", "D", "A", "E"]

function detectPitch(buffer: Float32Array, sampleRate: number) {
  let rms = 0
  for (const value of buffer) rms += value * value
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.012) return { rms, note: null as string | null, frequency: null as number | null }
  let bestOffset = -1
  let bestCorrelation = 0
  for (let offset = Math.floor(sampleRate / 1000); offset < Math.min(Math.floor(sampleRate / 70), buffer.length - 1); offset += 2) {
    let correlation = 0
    for (let i = 0; i < buffer.length - offset; i += 4) correlation += 1 - Math.abs(buffer[i] - buffer[i + offset])
    correlation /= buffer.length / 4
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestOffset = offset }
  }
  if (bestOffset < 0 || bestCorrelation < 0.45) return { rms, note: null, frequency: null }
  const frequency = sampleRate / bestOffset
  if (frequency < 70 || frequency > 1200) return { rms, note: null, frequency }
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
  return { rms, note: noteNames[(midi % 12 + 12) % 12], frequency }
}

export default function Home() {
  const [track, setTrack] = useState(tracks[0])
  const [mode, setMode] = useState<"song" | "free">("song")
  const [targetIndex, setTargetIndex] = useState(0)
  const [detected, setDetected] = useState<string | null>(null)
  const [frequency, setFrequency] = useState<number | null>(null)
  const [listening, setListening] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState("Ative o microfone e toque uma nota")
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [lastAccepted, setLastAccepted] = useState<string | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const raf = useRef<number | null>(null)
  const stableNote = useRef("")
  const stableCount = useRef(0)
  const acceptedForTarget = useRef(false)
  const advanceTimer = useRef<number | null>(null)

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
  }, [])

  const current = track.events[targetIndex]
  const next = track.events[targetIndex + 1]
  const suggestion = harmonic[track.key]?.[(targetIndex + 1) % (harmonic[track.key]?.length || 1)] || "C"
  const targetNote = current?.note || "—"

  const stopMicrophone = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((item) => item.stop())
    audioContext.current?.close()
    raf.current = null
    stream.current = null
    audioContext.current = null
    analyser.current = null
    setListening(false)
  }, [])

  const handleDetected = useCallback((note: string) => {
    setDetected(note)
    if (!running) return
    if (mode === "free") {
      setMessage(`Você tocou ${note}. Próxima sugestão: ${suggestion}`)
      return
    }
    if (acceptedForTarget.current) return
    if (note === targetNote) {
      acceptedForTarget.current = true
      setLastAccepted(note)
      setScore((value) => value + 100)
      setCombo((value) => value + 1)
      setMessage(`Acertou ${note}. Prepare ${next?.note || "fim da música"}`)
      clearAdvanceTimer()
      advanceTimer.current = window.setTimeout(() => {
        setTargetIndex((value) => Math.min(value + 1, track.events.length - 1))
        acceptedForTarget.current = false
        setLastAccepted(null)
        stableNote.current = ""
        stableCount.current = 0
        advanceTimer.current = null
      }, 650)
    } else {
      setCombo(0)
      setMessage(`Você tocou ${note}. Ainda falta ${targetNote}`)
    }
  }, [clearAdvanceTimer, mode, next?.note, running, suggestion, targetNote, track.events.length])

  const analyze = useCallback(() => {
    const currentAnalyser = analyser.current
    const context = audioContext.current
    if (!currentAnalyser || !context) return
    const data = new Float32Array(currentAnalyser.fftSize)
    currentAnalyser.getFloatTimeDomainData(data)
    const result = detectPitch(data, context.sampleRate)
    setFrequency(result.frequency)
    if (result.note) {
      if (stableNote.current === result.note) stableCount.current += 1
      else { stableNote.current = result.note; stableCount.current = 1 }
      if (stableCount.current >= 3) handleDetected(result.note)
    } else {
      stableNote.current = ""
      stableCount.current = 0
    }
    raf.current = requestAnimationFrame(analyze)
  }, [handleDetected])

  const startMicrophone = async () => {
    try {
      stopMicrophone()
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const context = new AudioContext()
      await context.resume()
      const nextAnalyser = context.createAnalyser()
      nextAnalyser.fftSize = 4096
      nextAnalyser.smoothingTimeConstant = 0.15
      context.createMediaStreamSource(nextStream).connect(nextAnalyser)
      stream.current = nextStream
      audioContext.current = context
      analyser.current = nextAnalyser
      setListening(true)
      setMessage("Ouvindo. Toque uma nota por vez")
      analyze()
    } catch {
      setMessage("Microfone bloqueado. Libere a permissão do navegador")
    }
  }

  const selectTrack = (item: Track) => {
    clearAdvanceTimer()
    setTrack(item); setTargetIndex(0); setDetected(null); setLastAccepted(null); setScore(0); setCombo(0); setRunning(false); acceptedForTarget.current = false; stableNote.current = ""; stableCount.current = 0; setMessage(`Faixa selecionada: ${item.title}`)
  }

  useEffect(() => () => {
    clearAdvanceTimer()
    stopMicrophone()
  }, [clearAdvanceTimer, stopMicrophone])
  const fretPositions = useMemo(() => Array.from({ length: 13 }, (_, index) => index), [])

  return <main className="min-h-screen bg-[#090912] text-white">
    <header className="flex items-center gap-3 border-b border-[#29243f] bg-[#12111e] px-3 py-3 sm:px-6"><div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-400"><Waves className="size-5" /></div><div><strong className="text-lg">OmniTune</strong><p className="hidden text-xs text-slate-400 sm:block">Treine uma nota por vez, sem adivinhação</p></div><div className="ml-auto flex items-center gap-4 text-right"><div><small className="block text-[10px] text-slate-400">BPM</small><b>{track.bpm}</b></div><div><small className="block text-[10px] text-slate-400">PONTOS</small><b className="text-cyan-300">{score}</b></div></div></header>
    <section className="mx-auto max-w-6xl px-3 py-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">Treino atual</p><h1 className="text-xl font-bold">{track.title}</h1><p className="text-sm text-slate-400">{track.description} · Tom {track.key}</p></div><div className="flex gap-2"><button onClick={() => setLibraryOpen((value) => !value)} className="rounded-lg border border-fuchsia-400/60 px-3 py-2 text-xs font-bold">Biblioteca</button><button onClick={listening ? stopMicrophone : startMicrophone} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950"><Mic className="size-4" />{listening ? "Parar microfone" : "Ativar microfone"}</button></div></div>
      {libraryOpen && <div className="mt-3 grid gap-2 sm:grid-cols-3">{tracks.map((item) => <button key={item.id} onClick={() => { selectTrack(item); setLibraryOpen(false) }} className={`rounded-xl border p-3 text-left ${item.id === track.id ? "border-cyan-300 bg-cyan-400/10" : "border-[#302552] bg-[#12111e]"}`}><b className="block text-sm">{item.title}</b><span className="text-xs text-slate-400">{item.description} · {item.bpm} BPM</span></button>)}</div>}
    </section>
    <section className="mx-auto grid max-w-6xl gap-3 px-3 sm:px-6 lg:grid-cols-[1fr_290px]">
      <div className="rounded-2xl border border-[#302552] bg-[#10101c] p-3 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-widest text-fuchsia-300">{mode === "song" ? "Nota alvo" : "Free play"}</p><div className="mt-1 flex items-end gap-3"><strong className="text-5xl text-white">{mode === "song" ? targetNote : detected || "—"}</strong>{mode === "song" && next && <span className="mb-2 text-sm text-cyan-300">Depois: {next.note}</span>}</div><p className="mt-2 text-sm text-slate-300">{message}</p></div><div className="flex gap-2"><button onClick={() => { clearAdvanceTimer(); acceptedForTarget.current = false; setMode("song"); setRunning(false); setMessage("Modo música pronto. Pressione iniciar") }} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === "song" ? "bg-fuchsia-500" : "border border-white/10 text-slate-400"}`}>Música</button><button onClick={() => { clearAdvanceTimer(); acceptedForTarget.current = false; setMode("free"); setRunning(false); setMessage("Modo livre pronto. Pressione iniciar") }} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === "free" ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-400"}`}>Free play</button></div></div>
        <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-3"><button onClick={() => setRunning((value) => !value)} className="grid size-11 place-items-center rounded-full bg-fuchsia-500" aria-label={running ? "Pausar" : "Iniciar"}>{running ? <Pause className="size-5" /> : <Play className="size-5" />}</button><button onClick={() => { clearAdvanceTimer(); setTargetIndex(0); setScore(0); setCombo(0); setLastAccepted(null); acceptedForTarget.current = false; stableNote.current = ""; stableCount.current = 0; setRunning(false); setMessage("Treino reiniciado. Pressione iniciar para começar") }} className="grid size-11 place-items-center rounded-full border border-white/15" aria-label="Reiniciar"><RotateCcw className="size-4" /></button><span className="text-xs text-slate-400">{running ? "Treino em andamento" : "Pressione iniciar quando estiver pronto"}</span></div>
      </div>
      <aside className="rounded-2xl border border-cyan-400/25 bg-[#10101c] p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">Próxima sugestão</p><strong className="mt-2 block text-3xl text-cyan-300">{mode === "free" ? suggestion : next?.note || "Fim"}</strong><p className="mt-1 text-sm text-slate-400">{mode === "free" ? `Campo harmônico de ${track.key}` : "Só avança quando você acertar"}</p><div className="mt-4 flex flex-wrap gap-2">{(harmonic[track.key] || harmonic.C).map((chord) => <span key={chord} className={`rounded-md px-2 py-1 text-xs ${chord.replace("m", "") === (mode === "free" ? detected : next?.note) ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-400"}`}>{chord}</span>)}</div></aside>
    </section>
    <section className="mx-auto mt-3 max-w-6xl px-3 pb-8 sm:px-6"><div className="overflow-x-auto rounded-2xl border border-[#302552] bg-[#0d0d18] p-3"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-slate-300">Braço do violão · localize a nota</span><span className="text-xs text-slate-500">Atual: {detected || "—"} · Alvo: {mode === "song" ? targetNote : "livre"}</span></div><div className="min-w-[760px]">{strings.map((stringName, stringIndex) => <div key={stringName} className="flex h-10 items-center"><span className="w-7 font-mono text-xs text-cyan-300">{stringName}</span><div className="flex flex-1">{fretPositions.map((fret) => { const open = stringIndex === 0 ? "E" : stringIndex === 1 ? "B" : stringIndex === 2 ? "G" : stringIndex === 3 ? "D" : stringIndex === 4 ? "A" : "E"; const note = noteNames[(noteNames.indexOf(open) + fret) % 12]; const isCurrent = detected === note; const isTarget = mode === "song" && targetNote === note; return <div key={`${stringName}-${fret}`} className={`relative flex h-9 w-14 items-center justify-center border-r border-[#3a3550] text-xs ${fret === 0 ? "border-l-2 border-cyan-300/60" : ""}`}><span className={`relative z-10 grid size-6 place-items-center rounded-full ${isCurrent ? "bg-cyan-300 text-slate-950 shadow-[0_0_16px_#67e8f9]" : isTarget ? "border border-fuchsia-300 text-fuchsia-200" : "text-slate-500"}`}>{note}</span></div> })}</div></div>)}</div></div></section>
    <div className="fixed bottom-3 left-3 right-3 z-20 flex items-center justify-between rounded-xl border border-cyan-300/40 bg-[#141322]/95 px-3 py-2 shadow-2xl backdrop-blur sm:hidden"><span className="flex items-center gap-2 text-xs"><span className={`size-2 rounded-full ${listening ? "bg-emerald-400" : "bg-slate-500"}`} />{listening ? `Ouvindo ${detected || "..."}` : "Microfone desligado"}</span><button onClick={listening ? stopMicrophone : startMicrophone} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950">{listening ? "Parar" : "Ativar"}</button></div>
  </main>
}
