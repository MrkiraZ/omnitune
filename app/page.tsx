"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, BookOpen, ChevronDown, CircleHelp, Gauge, Headphones, Mic, Pause, Play, RotateCcw, Settings, SlidersHorizontal, Square, Volume2, Waves } from "lucide-react"

type AudioMode = "microphone" | "file"
type EventItem = { chord: string; color: string; lane: number; top: number; delay: string }

const events: EventItem[] = [
  { chord: "E", color: "red", lane: 0, top: 54, delay: "-.4s" },
  { chord: "A", color: "yellow", lane: 1, top: 47, delay: "-1.4s" },
  { chord: "D", color: "blue", lane: 2, top: 40, delay: "-2.25s" },
  { chord: "G", color: "green", lane: 3, top: 33, delay: "-3.2s" },
  { chord: "Em", color: "purple", lane: 4, top: 25, delay: "-4.1s" },
]

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let rms = 0
  for (const value of buffer) rms += value * value
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.006) return { rms, frequency: null as number | null }
  let bestOffset = -1
  let bestCorrelation = 0
  const minOffset = Math.floor(sampleRate / 1000)
  const maxOffset = Math.min(Math.floor(sampleRate / 55), buffer.length - 1)
  for (let offset = minOffset; offset < maxOffset; offset += 2) {
    let correlation = 0
    for (let i = 0; i < buffer.length - offset; i += 3) correlation += 1 - Math.abs(buffer[i] - buffer[i + offset])
    correlation /= buffer.length / 3
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestOffset = offset }
  }
  return { rms, frequency: bestOffset > 0 && bestCorrelation > 0.42 ? sampleRate / bestOffset : null }
}

function frequencyToNote(frequency: number | null) {
  if (!frequency || frequency < 45 || frequency > 1400) return null
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
  return { name: noteNames[(midi % 12 + 12) % 12], frequency: Math.round(frequency) }
}

export default function Home() {
  const [mode, setMode] = useState<AudioMode>("microphone")
  const [listening, setListening] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState("Pronto para ouvir")
  const [signal, setSignal] = useState(0)
  const [detectedNote, setDetectedNote] = useState("—")
  const [detectedFrequency, setDetectedFrequency] = useState("—")
  const [detectedChord, setDetectedChord] = useState("Em")
  const [confidence, setConfidence] = useState(0)
  const [targetChord, setTargetChord] = useState("E")
  const [feedback, setFeedback] = useState("Aguardando sua próxima nota")
  const [combo, setCombo] = useState(0)
  const [accuracy, setAccuracy] = useState(0)
  const [recentNotes, setRecentNotes] = useState<string[]>([])
  const feedbackTimerRef = useRef<number | null>(null)
  const lastScoredRef = useRef("")
  const [fileUrl, setFileUrl] = useState("")
  const [fileName, setFileName] = useState("")
  const [volume, setVolume] = useState(62)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(12)
  const [diagnostic, setDiagnostic] = useState("Microfone não iniciado")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null)
  const lastNoteRef = useRef({ value: "", count: 0 })
  const noteHistoryRef = useRef<string[]>([])

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    contextRef.current?.close()
    streamRef.current = null
    sourceRef.current = null
    contextRef.current = null
    analyserRef.current = null
    setListening(false)
    setPlaying(false)
    setSignal(0)
    setStatus("Pronto para ouvir")
  }, [])

  const scoreDetectedNote = useCallback((noteName: string, level: number) => {
    setRecentNotes((current) => [noteName, ...current.filter((item) => item !== noteName)].slice(0, 6))
    if (lastScoredRef.current === noteName) return
    lastScoredRef.current = noteName
    const matches = noteName === targetChord || (targetChord === "Em" && noteName === "E")
    setFeedback(matches ? `Acertou ${noteName}` : `Ouvi ${noteName} — alvo ${targetChord}`)
    setCombo((current) => matches ? current + 1 : 0)
    setAccuracy((current) => Math.round(current * 0.7 + (matches ? 100 : Math.min(40, level)) * 0.3))
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => { lastScoredRef.current = "" }, 500)
  }, [targetChord])

  const analyze = useCallback(() => {
    const analyser = analyserRef.current
    const context = contextRef.current
    if (!analyser || !context) return
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    const result = autoCorrelate(data, context.sampleRate)
    const level = Math.min(100, Math.round(result.rms * 2100))
    setSignal(level)
    const note = frequencyToNote(result.frequency)
    if (note) {
      setDetectedNote(note.name)
      setDetectedFrequency(`${note.frequency} Hz`)
      setStatus("Sinal detectado")
      scoreDetectedNote(note.name, level)
      lastNoteRef.current = lastNoteRef.current.value === note.name ? { value: note.name, count: lastNoteRef.current.count + 1 } : { value: note.name, count: 1 }
      if (lastNoteRef.current.count >= 4) {
        const chord = note.name === "E" ? "Em" : note.name === "A" ? "A" : note.name === "D" ? "D" : note.name === "G" ? "G" : note.name === "C" ? "C" : note.name === "F" ? "F" : "—"
        if (chord !== "—") { setDetectedChord(chord); setConfidence(Math.min(98, 66 + level / 3)) }
      }
    } else if (level < 3) {
      setStatus("Sem sinal — toque ou cante perto do microfone")
      setDetectedNote("—")
      setDetectedFrequency("—")
    } else setStatus("Sinal detectado — procurando uma nota estável")
    rafRef.current = requestAnimationFrame(analyze)
  }, [scoreDetectedNote])

  const startMicrophone = async () => {
    try {
      stop()
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não oferece acesso ao microfone")
      setStatus("Solicitando permissão do microfone...")
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const context = new AudioContext()
      await context.resume()
      const analyser = context.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.25
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      streamRef.current = stream
      sourceRef.current = source
      contextRef.current = context
      analyserRef.current = analyser
      setMode("microphone")
      setListening(true)
      setDiagnostic(`Microfone ativo: ${stream.getAudioTracks()[0]?.label || "entrada padrão"}`)
      setStatus("Ouvindo — toque uma nota ou acorde")
      analyze()
    } catch (error) {
      setListening(false)
      setDiagnostic(error instanceof Error ? error.message : "Não foi possível acessar o microfone")
      setStatus("Microfone indisponível — confira a permissão do navegador")
    }
  }

  const startFile = async () => {
    if (!fileUrl || !audioRef.current) return
    try {
      stop()
      const context = new AudioContext()
      await context.resume()
      const analyser = context.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.35
      const source = context.createMediaElementSource(audioRef.current)
      source.connect(analyser)
      analyser.connect(context.destination)
      contextRef.current = context
      analyserRef.current = analyser
      sourceRef.current = source
      setMode("file")
      setListening(true)
      setPlaying(true)
      setStatus("Analisando áudio")
      setDiagnostic(`Arquivo carregado: ${fileName}`)
      await audioRef.current.play()
      analyze()
    } catch { setStatus("Não foi possível analisar este arquivo") }
  }

  const playReference = useCallback(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const frequencies: Record<string, number> = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392, A: 440, B: 493.88 }
    const root = frequencies[targetChord.replace("m", "")] || 329.63
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "triangle"
    oscillator.frequency.value = root
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.2)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 1.25)
    window.setTimeout(() => context.close(), 1400)
  }, [targetChord])

  const togglePlayback = async () => {
    if (!audioRef.current) return
    if (audioRef.current.paused) { await audioRef.current.play(); setPlaying(true) } else { audioRef.current.pause(); setPlaying(false) }
  }

  useEffect(() => () => stop(), [stop])
  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (fileUrl) URL.revokeObjectURL(fileUrl); setFileName(file.name); setFileUrl(URL.createObjectURL(file)); setMode("file"); setStatus("Arquivo pronto — pressione analisar") }
  const waveform = useMemo(() => Array.from({ length: 86 }, (_, index) => 10 + ((index * 31) % 62)), [])

  return <main className="min-h-screen bg-[#090912] text-foreground">
    <header className="flex h-16 items-center gap-4 border-b border-[#252443] bg-[#12111e] px-3 sm:px-6"><button className="grid size-10 place-items-center rounded-xl bg-[#242337] text-foreground hover:bg-[#302e4b]" aria-label="Voltar"><ArrowLeft className="size-5" /></button><div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-white"><Waves className="size-5" /></div><div className="min-w-0"><div className="flex items-center gap-2"><strong className="truncate text-lg">OmniTune</strong><span className="rounded-full border border-primary/70 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-primary">ao vivo</span></div><p className="hidden text-[11px] text-muted-foreground sm:block">MODO APRENDER · Reconhecimento de áudio · Iniciante</p></div><div className="ml-auto hidden items-center gap-8 text-center sm:flex"><div><p className="text-[10px] font-bold uppercase text-muted-foreground">BPM</p><strong className="text-2xl">60</strong></div><div><p className="text-[10px] font-bold uppercase text-muted-foreground">ACORDES</p><strong className="text-2xl text-cyan-300">{Math.max(1, Math.round(progress / 2))}</strong></div></div><div className="ml-auto flex items-center gap-2 sm:ml-6"><button className="grid size-9 place-items-center rounded-full border border-cyan-400/70 text-cyan-300"><Settings className="size-4" /></button><button className="grid size-9 place-items-center rounded-full border border-fuchsia-400/70 text-fuchsia-300"><BookOpen className="size-4" /></button></div></header>
    <section className="border-b border-[#252443] bg-[#0e0d18] px-3 py-3 sm:px-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="font-mono text-xs text-muted-foreground">EXERCÍCIO</span><strong className="text-sm">Ouça e acompanhe</strong><span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">MICROFONE</span></div><span className="hidden text-xs text-muted-foreground sm:block">A pista acompanha o áudio detectado</span></div></section>
    <section className="relative mx-2 mt-2 h-[390px] overflow-hidden rounded-2xl border border-[#302552] bg-[#0b0b15] sm:mx-4 sm:h-[510px]"><div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-indigo-950/60 via-purple-950/20 to-transparent" /><div className="absolute inset-x-0 top-24 h-px bg-gradient-to-r from-fuchsia-500/70 via-cyan-400/40 to-transparent shadow-[0_0_20px_#9c5cff]" /><div className="absolute inset-x-[4%] bottom-0 top-20 grid grid-cols-6 [transform:perspective(900px)_rotateX(12deg)] [transform-origin:bottom]">{Array.from({ length: 6 }).map((_, index) => <div key={index} className={`border-x border-white/[0.055] ${index % 2 ? "bg-white/[0.015]" : "bg-transparent"}`} />)}</div><div className="absolute inset-x-[4%] bottom-0 top-20">{Array.from({ length: 7 }).map((_, index) => <div key={index} className="absolute bottom-0 top-0 border-l border-white/[0.06]" style={{ left: `${index * 16.66}%`, transform: "perspective(500px) rotateX(12deg)" }} />)}{events.map((event, index) => <div key={event.chord} className={`absolute flex h-8 items-center justify-center rounded-md border text-xs font-bold shadow-[0_0_18px_currentColor] animate-[noteDrop_5s_linear_infinite] ${event.color === "red" ? "border-red-400 bg-red-500/80 text-red-100" : event.color === "yellow" ? "border-yellow-300 bg-yellow-400/80 text-yellow-950" : event.color === "blue" ? "border-blue-300 bg-blue-500/80 text-white" : event.color === "green" ? "border-emerald-300 bg-emerald-500/80 text-emerald-950" : "border-fuchsia-300 bg-fuchsia-500/80 text-white"}`} style={{ left: `${6 + event.lane * 18}%`, top: `${event.top}%`, width: `${8 + index * 1.2}%`, animationDelay: event.delay }}>{event.chord}</div>)}</div><div className="absolute inset-x-[4%] bottom-[27%] border-t border-fuchsia-500/60 shadow-[0_0_12px_#f43f5e]"><span className="absolute -top-3 left-0 bg-[#0b0b15] pr-3 font-mono text-xs font-bold text-fuchsia-400">OUVINDO</span></div><div className="absolute bottom-8 left-[4%] right-[4%] grid grid-cols-6 gap-2 sm:gap-5"><div className="h-11 rounded-full border-2 border-red-400/80 bg-red-500/10 shadow-[0_0_16px_#ef4444]" /><div className="h-11 rounded-full border-2 border-yellow-300/80 bg-yellow-400/10 shadow-[0_0_16px_#eab308]" /><div className="h-11 rounded-full border-2 border-blue-400/80 bg-blue-500/10 shadow-[0_0_16px_#3b82f6]" /><div className="h-11 rounded-full border-2 border-emerald-400/80 bg-emerald-500/10 shadow-[0_0_16px_#10b981]" /><div className="h-11 rounded-full border-2 border-fuchsia-400/80 bg-fuchsia-500/10 shadow-[0_0_16px_#d946ef]" /><div className="h-11 rounded-full border-2 border-cyan-400/80 bg-cyan-500/10 shadow-[0_0_16px_#06b6d4]" /></div></section>
    <section className="px-2 py-3 sm:px-4"><div className="relative h-8 rounded bg-[#171625]"><div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 bg-[#2b2a3e]" /><div className="absolute left-0 top-1/2 h-1 w-[12%] -translate-y-1/2 bg-fuchsia-400 shadow-[0_0_10px_#f0f]" /><div className="absolute left-[12%] top-0 h-8 w-px bg-white" />{Array.from({ length: 13 }).map((_, index) => <span key={index} className="absolute top-1 text-[9px] text-muted-foreground" style={{ left: `${index * 8.3}%` }}>{index + 1}</span>)}</div><div className="mt-2 flex items-center justify-center gap-2"><button onClick={() => setProgress(Math.max(0, progress - 1))} className="grid size-9 place-items-center rounded-full bg-[#242337] text-muted-foreground"><RotateCcw className="size-4" /></button><button onClick={mode === "microphone" ? (listening ? stop : startMicrophone) : togglePlayback} className="grid size-11 place-items-center rounded-full bg-fuchsia-500 text-white shadow-[0_0_20px_#d946ef]">{playing || listening ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}</button><button onClick={() => setIsMuted(!isMuted)} className="grid size-9 place-items-center rounded-full bg-[#242337] text-muted-foreground"><Volume2 className="size-4" /></button><input aria-label="Volume" className="hidden accent-cyan-400 sm:block" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /><span className="ml-auto text-xs text-muted-foreground">00:12 / 00:49</span></div></section>
    <section className="mx-2 mb-3 grid gap-3 sm:mx-4 sm:grid-cols-[1fr_1.2fr_1fr]"><div className="rounded-2xl border border-fuchsia-400/30 bg-[#12111e] p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Alvo atual</p><div className="mt-2 flex items-end justify-between"><strong className="text-5xl text-fuchsia-300">{targetChord}</strong><button onClick={playReference} className="rounded-lg bg-fuchsia-500/20 px-3 py-2 text-xs font-bold text-fuchsia-200"><Volume2 className="mr-1 inline size-3.5" /> Ouvir</button></div><div className="mt-3 flex gap-2">{["E", "A", "D", "G", "C", "Em"].map((chord) => <button key={chord} onClick={() => { setTargetChord(chord); setFeedback(`Novo alvo: ${chord}`); lastScoredRef.current = "" }} className={`rounded-md px-2.5 py-1 text-xs font-bold ${targetChord === chord ? "bg-fuchsia-500 text-white" : "bg-[#242337] text-muted-foreground"}`}>{chord}</button>)}</div></div><div className={`rounded-2xl border p-4 ${feedback.startsWith("Acertou") ? "border-emerald-400/60 bg-emerald-950/30" : "border-cyan-400/30 bg-[#12111e]"}`}><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Feedback ao vivo</p><strong className="mt-3 block text-xl">{feedback}</strong><div className="mt-4 flex items-center gap-6"><div><span className="block text-[10px] text-muted-foreground">COMBO</span><strong className="text-2xl text-primary">{combo}x</strong></div><div><span className="block text-[10px] text-muted-foreground">PRECISÃO</span><strong className="text-2xl text-cyan-300">{accuracy}%</strong></div></div></div><div className="rounded-2xl border border-[#302552] bg-[#12111e] p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Últimas notas</p><div className="mt-4 flex flex-wrap gap-2">{recentNotes.length ? recentNotes.map((note, index) => <span key={`${note}-${index}`} className="rounded-full bg-cyan-400/15 px-3 py-1 text-sm font-bold text-cyan-200">{note}</span>) : <span className="text-sm text-muted-foreground">Toque para começar</span>}</div></div></section>
    <section className="grid gap-3 px-2 pb-6 sm:px-4 lg:grid-cols-[1fr_420px]"><div className="rounded-2xl border border-[#302552] bg-[#12111e] p-4"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${listening ? "animate-pulse bg-primary" : "bg-red-400"}`} /><strong className="text-sm text-primary">{listening ? "A OUVIR" : "PRONTO"}</strong></div><span className="text-xs text-muted-foreground">{status}</span></div><div className="grid gap-3 sm:grid-cols-[160px_1fr_160px]"><label className="rounded-xl border border-cyan-400/70 bg-[#171728] p-3 text-xs"><span className="block text-muted-foreground">FONTE</span><span className="mt-2 flex items-center gap-2 font-semibold"><Mic className="size-4 text-cyan-300" /> Microfone <ChevronDown className="ml-auto size-3" /></span><input className="sr-only" type="file" accept="audio/*" onChange={onFile} /></label><div className="rounded-xl bg-[#171728] p-3"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">NOTA DETECTADA</span><strong className="text-2xl text-white">{detectedNote}</strong></div><div className="mt-3 flex h-8 items-end gap-0.5">{waveform.slice(0, 42).map((height, index) => <span key={index} className={`flex-1 rounded-t ${listening ? "bg-cyan-400/80" : "bg-cyan-400/20"}`} style={{ height: `${listening ? height : 18}%` }} />)}</div></div><div className="rounded-xl bg-[#171728] p-3"><span className="block text-xs text-muted-foreground">FREQUÊNCIA</span><strong className="mt-2 block text-xl">{detectedFrequency}</strong><span className="text-[10px] text-muted-foreground">{diagnostic}</span></div></div><div className="mt-4 flex flex-wrap items-center gap-2"><button onClick={startMicrophone} className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950"><Mic className="mr-1 inline size-3.5" /> Ativar microfone</button><label className="cursor-pointer rounded-lg border border-fuchsia-400/60 px-4 py-2 text-xs font-semibold text-fuchsia-200"><Headphones className="mr-1 inline size-3.5" /> Carregar música<input className="sr-only" type="file" accept="audio/*" onChange={onFile} /></label>{fileUrl && <button onClick={startFile} className="rounded-lg border border-primary/70 px-4 py-2 text-xs font-semibold text-primary">Analisar arquivo</button>}</div></div><aside className="rounded-2xl border border-[#302552] bg-[#12111e] p-4"><div className="flex items-start justify-between"><div><span className="text-[10px] font-bold uppercase text-muted-foreground">O QUE VOCÊ ESTÁ TOCANDO?</span><div className="mt-1 flex items-end gap-3"><strong className="text-5xl text-fuchsia-400">{detectedChord}</strong><span className="pb-1 text-xs text-muted-foreground">estimado · {Math.round(confidence)}%</span></div></div><Gauge className="size-5 text-cyan-300" /></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div><span className="text-muted-foreground">LIMPEZA</span><div className="mt-1 h-1.5 rounded bg-[#2b2a3e]"><div className="h-full w-[38%] rounded bg-fuchsia-400" /></div></div><div><span className="text-muted-foreground">SINAL</span><div className="mt-1 h-1.5 rounded bg-[#2b2a3e]"><div className="h-full rounded bg-cyan-400 transition-all" style={{ width: `${signal}%` }} /></div></div></div><div className="mt-5 flex items-center justify-between border-t border-[#2b2a3e] pt-4"><span className="text-xs text-muted-foreground">Próximo acorde</span><strong className="text-xl text-yellow-300">{detectedChord === "Em" ? "G" : "Em"}</strong></div></aside></section>
    {fileUrl ? <audio ref={audioRef} src={fileUrl} onEnded={() => { setPlaying(false); setListening(false) }} className="hidden" /> : null}
  </main>
}
