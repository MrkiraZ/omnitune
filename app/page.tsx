"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AudioLines, CircleHelp, FileAudio, Mic, Pause, Play, Radio, RotateCcw, Sparkles, Square, Volume2, Waves } from "lucide-react"

type Source = "microphone" | "file"
type Chord = { name: string; root: string; quality: string; confidence: number; tip: string; color: string }

const chordMap: Record<string, Chord> = {
  C: { name: "C", root: "Dó", quality: "maior", confidence: 86, tip: "Use a escala de Dó maior para improvisar.", color: "#8cff66" },
  "C#": { name: "C#", root: "Dó sustenido", quality: "maior", confidence: 78, tip: "Experimente a escala cromática com frases curtas.", color: "#68b6ff" },
  D: { name: "D", root: "Ré", quality: "maior", confidence: 91, tip: "Notas Ré, Fá sustenido e Lá soam estáveis aqui.", color: "#ffd95b" },
  "D#": { name: "D#", root: "Ré sustenido", quality: "maior", confidence: 74, tip: "Segure as notas de passagem e resolva em Sol.", color: "#ff7772" },
  E: { name: "Em", root: "Mi", quality: "menor", confidence: 94, tip: "A pentatônica de Mi menor é uma ótima escolha.", color: "#8cff66" },
  F: { name: "F", root: "Fá", quality: "maior", confidence: 88, tip: "Tente uma frase com Fá, Lá e Dó.", color: "#ff7772" },
  "F#": { name: "F#", root: "Fá sustenido", quality: "maior", confidence: 80, tip: "Use a terça para destacar a mudança.", color: "#68b6ff" },
  G: { name: "G", root: "Sol", quality: "maior", confidence: 93, tip: "Sol maior combina com a escala de Sol.", color: "#ffd95b" },
  "G#": { name: "G#", root: "Sol sustenido", quality: "maior", confidence: 76, tip: "Teste a resolução em Lá menor.", color: "#ff7772" },
  A: { name: "Am", root: "Lá", quality: "menor", confidence: 90, tip: "A pentatônica de Lá menor funciona muito bem.", color: "#8cff66" },
  "A#": { name: "A#", root: "Lá sustenido", quality: "maior", confidence: 75, tip: "Use notas longas e escute a resolução.", color: "#68b6ff" },
  B: { name: "B", root: "Si", quality: "maior", confidence: 83, tip: "Experimente Si, Ré sustenido e Fá sustenido.", color: "#ffd95b" },
}

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function detectPitch(buffer: Float32Array, sampleRate: number) {
  let rms = 0
  for (const value of buffer) rms += value * value
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.008) return { rms, note: null as string | null }
  let bestOffset = -1
  let bestCorrelation = 0
  for (let offset = 24; offset < 900; offset += 2) {
    let correlation = 0
    for (let i = 0; i < buffer.length - offset; i += 4) correlation += Math.abs(buffer[i] - buffer[i + offset])
    correlation = 1 - correlation / Math.max(1, buffer.length / 4)
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestOffset = offset }
  }
  if (bestOffset < 0 || bestCorrelation < 0.12) return { rms, note: null as string | null }
  const frequency = sampleRate / bestOffset
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
  return { rms, note: noteNames[(midi % 12 + 12) % 12] }
}

export default function Home() {
  const [source, setSource] = useState<Source>("microphone")
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState("Pronto para escutar")
  const [signal, setSignal] = useState(0)
  const [note, setNote] = useState("—")
  const [currentChord, setCurrentChord] = useState<Chord>(chordMap.E)
  const [history, setHistory] = useState<string[]>(["Em", "C", "G", "D"])
  const [fileName, setFileName] = useState("")
  const [fileUrl, setFileUrl] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [improv, setImprov] = useState(true)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationRef = useRef<number | null>(null)
  const stableNoteRef = useRef({ value: "", count: 0 })
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stopAudio = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    audioContextRef.current?.close()
    streamRef.current = null; audioContextRef.current = null; analyserRef.current = null
    setIsListening(false); setIsPlaying(false); setStatus("Pronto para escutar"); setSignal(0)
  }, [])

  const analyze = useCallback(() => {
    const analyser = analyserRef.current; const context = audioContextRef.current
    if (!analyser || !context) return
    const buffer = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buffer)
    const result = detectPitch(buffer, context.sampleRate); const level = Math.min(100, Math.round(result.rms * 1500))
    setSignal(level)
    if (result.note) {
      setNote(result.note)
      if (stableNoteRef.current.value === result.note) stableNoteRef.current.count += 1
      else stableNoteRef.current = { value: result.note, count: 1 }
      if (stableNoteRef.current.count >= 3) { const chord = chordMap[result.note] ?? chordMap.Em; setCurrentChord(chord); setHistory((items) => items[0] === chord.name ? items : [chord.name, ...items].slice(0, 8)); setStatus("Acorde identificado") }
    } else if (level < 3) setStatus("Aguardando um sinal...")
    animationRef.current = requestAnimationFrame(analyze)
  }, [])

  const startMicrophone = async () => {
    try {
      stopAudio()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.78
      const input = context.createMediaStreamSource(stream); input.connect(analyser)
      streamRef.current = stream; audioContextRef.current = context; analyserRef.current = analyser; setSource("microphone"); setIsListening(true); setStatus("Escutando seu instrumento"); analyze()
    } catch { setStatus("Microfone bloqueado: permita o acesso no navegador"); setIsListening(false) }
  }

  const startFile = async () => {
    if (!fileUrl || !audioRef.current) return
    stopAudio(); const context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.82
    const input = context.createMediaElementSource(audioRef.current); input.connect(analyser); analyser.connect(context.destination)
    audioContextRef.current = context; analyserRef.current = analyser; setSource("file"); setIsListening(true); setIsPlaying(true); setStatus("Analisando a música"); await context.resume(); await audioRef.current.play(); analyze()
  }

  useEffect(() => () => stopAudio(), [stopAudio])
  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (fileUrl) URL.revokeObjectURL(fileUrl); setFileName(file.name); setFileUrl(URL.createObjectURL(file)); setStatus("Arquivo pronto para analisar") }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-10"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Waves className="size-5" /></div><div><p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-primary">OmniTune</p><p className="text-xs text-muted-foreground">Seu estúdio de escuta</p></div></div><div className="hidden items-center gap-5 text-xs text-muted-foreground md:flex"><span className="flex items-center gap-2"><Radio className="size-3 text-primary" /> áudio em tempo real</span><button aria-label="Ajuda" className="rounded-full p-2 hover:bg-secondary"><CircleHelp className="size-4" /></button></div></header>
    <div className="mx-auto max-w-7xl px-5 pb-10 lg:px-10"><section className="mb-8 flex flex-col gap-2"><p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Reconhecimento de acordes</p><h1 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Toque. Escute. Entenda a música.</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Conecte um microfone ou carregue uma música. O OmniTune escuta o áudio e transforma o que está acontecendo em acordes para você acompanhar e improvisar.</p></section>
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]"><div className="flex flex-col gap-5"><div className="rounded-3xl border border-border bg-card p-5 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${isListening ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} /><span className="text-sm font-medium">{status}</span></div><p className="mt-2 text-xs text-muted-foreground">{source === "microphone" ? "Entrada: microfone" : `Entrada: ${fileName || "arquivo de áudio"}`}</p></div><div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground"><Volume2 className="size-4" /> Sinal {signal}%</div></div><div className="mt-10 grid place-items-center rounded-3xl border border-border bg-background/70 py-12 text-center"><p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Acorde detectado</p><p className="mt-3 text-8xl font-bold tracking-tighter sm:text-[10rem]" style={{ color: currentChord.color }}>{currentChord.name}</p><p className="mt-2 text-sm text-muted-foreground">{currentChord.root} · {currentChord.quality} · confiança {currentChord.confidence}%</p><div className="mt-7 h-1.5 w-52 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${currentChord.confidence}%` }} /></div><p className="mt-5 max-w-md text-sm text-muted-foreground">{improv ? currentChord.tip : "Ative o modo improvisação para receber sugestões enquanto toca."}</p></div><div className="mt-6 flex flex-wrap items-center justify-center gap-3"><button onClick={isListening && source === "microphone" ? stopAudio : startMicrophone} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90">{isListening && source === "microphone" ? <Square className="size-4" /> : <Mic className="size-4" />}{isListening && source === "microphone" ? "Parar escuta" : "Escutar violão"}</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold transition hover:border-primary/50"><FileAudio className="size-4" />{fileName ? "Trocar música" : "Carregar música"}<input type="file" accept="audio/*" onChange={onFile} className="sr-only" /></label>{fileUrl && <button onClick={startFile} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:bg-secondary">{isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}{isPlaying ? "Pausar análise" : "Analisar música"}</button>}</div><audio ref={audioRef} src={fileUrl} onEnded={stopAudio} className="hidden" /></div><div className="rounded-3xl border border-border bg-card p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Linha do tempo</h2><p className="mt-1 text-xs text-muted-foreground">Os acordes que o OmniTune já ouviu</p></div><button onClick={() => setHistory([])} aria-label="Limpar histórico" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><RotateCcw className="size-4" /></button></div><div className="flex min-h-20 items-end gap-2 overflow-hidden">{(history.length ? history : ["—"]).map((item, index) => <div key={`${item}-${index}`} className={`flex min-w-16 flex-1 flex-col items-center gap-2 rounded-xl border px-3 py-3 ${index === 0 ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-secondary/50 text-muted-foreground"}`}><span className="font-mono text-lg font-bold">{item}</span><span className="text-[10px]">{index === 0 ? "agora" : `${index * 2}s atrás`}</span></div>)}</div></div></div>
        <aside className="flex flex-col gap-5"><div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Modo prática</p><h2 className="mt-2 text-xl font-semibold">Improvisação</h2></div><button aria-pressed={improv} onClick={() => setImprov(!improv)} className={`relative h-7 w-12 rounded-full transition ${improv ? "bg-primary" : "bg-secondary"}`}><span className={`absolute top-1 size-5 rounded-full bg-white transition ${improv ? "left-6" : "left-1"}`} /></button></div><p className="mt-4 text-sm leading-6 text-muted-foreground">Receba sugestões de escalas e notas enquanto acompanha a música.</p><div className="mt-6 rounded-2xl bg-background p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Nota que você está ouvindo</span><span className="font-mono text-primary">{note}</span></div><div className="mt-4 flex h-10 items-end gap-1">{Array.from({ length: 24 }).map((_, i) => <span key={i} className="flex-1 rounded-t-sm bg-primary/40" style={{ height: `${20 + ((i * 17) % 65)}%` }} />)}</div></div></div><div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="font-semibold">Como usar</h2></div><ol className="mt-5 flex flex-col gap-4 text-sm text-muted-foreground"><li className="flex gap-3"><span className="font-mono text-primary">01</span><span>Conecte o microfone ou carregue uma música.</span></li><li className="flex gap-3"><span className="font-mono text-primary">02</span><span>Toque junto e aguarde o acorde estabilizar.</span></li><li className="flex gap-3"><span className="font-mono text-primary">03</span><span>Use o acorde e a dica para improvisar.</span></li></ol></div><div className="rounded-2xl border border-dashed border-border p-4"><div className="flex items-center gap-2 text-xs font-semibold"><AudioLines className="size-4 text-primary" /> Sobre a detecção</div><p className="mt-2 text-xs leading-5 text-muted-foreground">A análise funciona melhor com violão isolado. Músicas completas são uma estimativa, pois bateria, voz e baixo podem interferir no acorde.</p></div></aside></section></div>
  </main>
}
