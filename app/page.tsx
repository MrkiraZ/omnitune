"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, ChevronDown, Mic, Pause, Play, RotateCcw, Settings, Volume2, Waves } from "lucide-react"

type Event = { label: string; degree: string; time: number; color: "green" | "red" | "yellow" | "blue" }
type Track = { id: string; title: string; subtitle: string; bpm: number; key: string; events: Event[] }
type AudioResult = { rms: number; root: string | null; frequency: number | null }

const tracks: Track[] = [
  { id: "smoke", title: "Smoke on the Water", subtitle: "Riff principal · Rock iniciante", bpm: 90, key: "G", events: ["G", "A#", "C", "G", "A#", "C", "G", "A#", "C", "D#"].map((label, i) => ({ label, degree: ["I", "♭III", "IV"][i % 3], time: i * .8, color: ["red", "yellow", "blue"][i % 3] as Event["color"] })) },
  { id: "aranha", title: "Aranha 1-2-3-4", subtitle: "Exercício cromático · Iniciante", bpm: 60, key: "E", events: ["E", "F", "F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#"].map((label, i) => ({ label, degree: `${i + 1}`, time: i * 1.2, color: i % 2 ? "red" : "green" as Event["color"] })) },
  { id: "alegria", title: "Ode à Alegria", subtitle: "Melodia clássica · Beethoven", bpm: 72, key: "C", events: ["E", "E", "F", "G", "G", "F", "E", "D", "C", "C", "D", "E", "E", "D", "D"].map((label, i) => ({ label, degree: ["III", "IV", "V"][i % 3], time: i * .9, color: i % 2 ? "blue" : "yellow" as Event["color"] })) },
  { id: "blues", title: "Blues em E", subtitle: "Frase de improviso · Pentatônica", bpm: 78, key: "E", events: ["E", "G", "A", "B", "D", "B", "A", "G"].map((label, i) => ({ label, degree: ["I", "♭III", "IV", "V", "♭VII"][i % 5], time: i * 1.1, color: ["green", "purple", "yellow", "blue"][i % 4] as Event["color"] })) },
]

const fields: Record<string, { roman: string; chord: string }[]> = {
  C: [{ roman: "I", chord: "C" }, { roman: "ii", chord: "Dm" }, { roman: "iii", chord: "Em" }, { roman: "IV", chord: "F" }, { roman: "V", chord: "G" }, { roman: "vi", chord: "Am" }, { roman: "vii°", chord: "Bdim" }],
  G: [{ roman: "I", chord: "G" }, { roman: "ii", chord: "Am" }, { roman: "iii", chord: "Bm" }, { roman: "IV", chord: "C" }, { roman: "V", chord: "D" }, { roman: "vi", chord: "Em" }, { roman: "vii°", chord: "F#dim" }],
  E: [{ roman: "I", chord: "E" }, { roman: "ii", chord: "F#m" }, { roman: "iii", chord: "G#m" }, { roman: "IV", chord: "A" }, { roman: "V", chord: "B" }, { roman: "vi", chord: "C#m" }, { roman: "vii°", chord: "D#dim" }],
}
const strings = ["E", "A", "D", "G", "B", "e"]
const stringMidi = [40, 45, 50, 55, 59, 64]
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const normalize = (value: string) => value.replace(/m|dim/g, "")

function detect(buffer: Float32Array, sampleRate: number): AudioResult {
  let energy = 0
  for (const sample of buffer) energy += sample * sample
  const rms = Math.sqrt(energy / buffer.length)
  if (rms < .008) return { rms, root: null, frequency: null }
  let best = 0
  let bestCorrelation = 0
  for (let midi = 28; midi <= 88; midi += 1) {
    const hz = 440 * Math.pow(2, (midi - 69) / 12)
    const lag = Math.floor(sampleRate / hz)
    let correlation = 0
    for (let i = 0; i < buffer.length - lag; i += 8) correlation += buffer[i] * buffer[i + lag]
    if (correlation > bestCorrelation) { bestCorrelation = correlation; best = midi }
  }
  const frequency = 440 * Math.pow(2, (best - 69) / 12)
  return { rms, root: noteNames[(best % 12 + 12) % 12], frequency }
}

export default function Home() {
  const [track, setTrack] = useState(tracks[0])
  const [eventIndex, setEventIndex] = useState(0)
  const [freePlay, setFreePlay] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState("Pronto para ouvir")
  const [detected, setDetected] = useState("—")
  const [frequency, setFrequency] = useState("—")
  const [signal, setSignal] = useState(0)
  const [feedback, setFeedback] = useState("Toque a nota indicada para avançar")
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null)
  const [audioUrl, setAudioUrl] = useState("")
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const stableRef = useRef("")
  const stableCountRef = useRef(0)
  const acceptedRef = useRef("")
  const releaseRef = useRef(true)

  const current = track.events[eventIndex]
  const next = track.events[eventIndex + 1]
  const field = fields[track.key] || fields.C
  const detectedRoot = normalize(detected)
  const suggestionIndex = field.findIndex(item => normalize(item.chord) === detectedRoot)
  const suggestion = field[(suggestionIndex >= 0 ? suggestionIndex + 1 : 0) % field.length]
  const progress = Math.round((eventIndex / track.events.length) * 100)
  const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0

  const stopListening = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach(trackItem => trackItem.stop())
    contextRef.current?.close()
    frameRef.current = null; streamRef.current = null; contextRef.current = null; analyserRef.current = null
    setListening(false); setSignal(0); setStatus("Pronto para ouvir")
  }, [])

  const registerNote = useCallback((note: string) => {
    if (!note || note === "—") return
    setDetected(note)
    setAttempts(value => value + 1)
    if (freePlay) {
      setFeedback(`Você tocou ${note}. Próxima sugestão: ${suggestion.chord} (${suggestion.roman})`)
      setFlash("hit")
      window.setTimeout(() => setFlash(null), 350)
      return
    }
    const expected = normalize(current.label)
    const isHit = normalize(note) === expected
    if (isHit && acceptedRef.current !== expected) {
      acceptedRef.current = expected
      setCorrect(value => value + 1); setScore(value => value + 100); setCombo(value => value + 1); setFlash("hit")
      if (eventIndex < track.events.length - 1) {
        setEventIndex(value => value + 1)
        setFeedback(`Acertou ${current.label}. Agora toque ${track.events[eventIndex + 1]?.label || "fim"}.`)
      } else setFeedback("Faixa concluída. Pressione Replay para começar novamente.")
    } else if (!isHit) {
      setCombo(0); setFlash("miss"); setFeedback(`Você tocou ${note}. O alvo continua sendo ${current.label}.`)
    }
    window.setTimeout(() => setFlash(null), 350)
  }, [current, eventIndex, freePlay, suggestion, track.events])

  const analyze = useCallback(() => {
    const analyser = analyserRef.current; const context = contextRef.current
    if (!analyser || !context) return
    const buffer = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buffer)
    const result = detect(buffer, context.sampleRate); const level = Math.min(100, Math.round(result.rms * 2200)); setSignal(level)
    if (!result.root) { stableRef.current = ""; stableCountRef.current = 0; acceptedRef.current = ""; releaseRef.current = true; setStatus("Sem sinal — toque uma corda"); setDetected("—") }
    else {
      setStatus("Nota detectada — mantenha o som limpo"); setFrequency(`${Math.round(result.frequency || 0)} Hz`); setDetected(result.root)
      if (stableRef.current === result.root) stableCountRef.current += 1; else { stableRef.current = result.root; stableCountRef.current = 1 }
      if (stableCountRef.current >= 5 && releaseRef.current && acceptedRef.current !== result.root) { releaseRef.current = false; registerNote(result.root) }
      if (result.root !== acceptedRef.current) releaseRef.current = true
    }
    frameRef.current = requestAnimationFrame(analyze)
  }, [registerNote])

  const startMicrophone = async () => {
    try {
      stopListening(); const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const context = new AudioContext(); await context.resume(); const analyser = context.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = .35
      const source = context.createMediaStreamSource(stream); source.connect(analyser); streamRef.current = stream; contextRef.current = context; analyserRef.current = analyser; setListening(true); setStatus("Ouvindo — toque uma nota"); analyze()
    } catch { setStatus("Microfone bloqueado — permita o acesso no navegador") }
  }

  const reset = () => { setEventIndex(0); setScore(0); setCombo(0); setCorrect(0); setAttempts(0); setDetected("—"); setFeedback("Toque a nota indicada para avançar"); acceptedRef.current = ""; releaseRef.current = true }
  const chooseTrack = (nextTrack: Track) => { stopListening(); setTrack(nextTrack); setEventIndex(0); setDetected("—"); setScore(0); setCombo(0); setCorrect(0); setAttempts(0); acceptedRef.current = ""; releaseRef.current = true; setFeedback(`Faixa: ${nextTrack.title}`); setLibraryOpen(false) }
  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) setAudioUrl(URL.createObjectURL(file)) }
  useEffect(() => () => stopListening(), [stopListening])

  const fretboard = useMemo(() => strings.map((string, stringIndex) => ({ string, cells: Array.from({ length: 13 }, (_, fret) => { const note = noteNames[(stringMidi[stringIndex] + fret) % 12]; return { fret, note, isHeard: Boolean(detectedRoot !== "" && detectedRoot === note), isCurrent: normalize(current.label) === note, isNext: Boolean(next && normalize(next.label) === note) } }) })), [current, next, detectedRoot])

  return <main className="min-h-screen bg-[#090912] text-foreground">
    <header className="flex h-16 items-center gap-3 border-b border-[#252443] bg-[#12111e] px-3 sm:px-6"><div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-400"><Waves className="size-5" /></div><div><strong className="text-lg">OmniTune</strong><p className="hidden text-[11px] text-muted-foreground sm:block">MODO APRENDER · guitarra em tempo real</p></div><div className="ml-auto flex items-center gap-4 text-center"><div><p className="text-[10px] text-muted-foreground">BPM</p><strong>{track.bpm}</strong></div><div><p className="text-[10px] text-muted-foreground">PONTOS</p><strong className="text-cyan-300">{score}</strong></div><Settings className="size-5 text-cyan-300" /></div></header>
    <section className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252443] bg-[#0e0d18] px-3 py-3 sm:px-6"><div><span className="font-mono text-[10px] text-muted-foreground">FAIXA ATUAL</span><strong className="ml-3 text-sm">{track.title}</strong></div><div className="flex gap-2"><button onClick={() => setLibraryOpen(value => !value)} className="rounded-lg border border-fuchsia-400/60 px-3 py-2 text-xs font-bold text-fuchsia-200"><ChevronDown className="mr-1 inline size-4" /> Biblioteca</button><label className="cursor-pointer rounded-lg border border-cyan-400/50 px-3 py-2 text-xs font-bold text-cyan-200"><Volume2 className="mr-1 inline size-4" /> Importar<input className="sr-only" type="file" accept="audio/*" onChange={handleUpload} /></label></div></section>
    {libraryOpen && <section className="grid gap-2 border-b border-[#252443] bg-[#0b0b15] p-3 sm:grid-cols-2 lg:grid-cols-4">{tracks.map(item => <button key={item.id} onClick={() => chooseTrack(item)} className={`rounded-xl border p-3 text-left ${track.id === item.id ? "border-fuchsia-400 bg-fuchsia-500/15" : "border-[#302552] bg-[#12111e]"}`}><span className="text-[10px] text-muted-foreground">{item.bpm} BPM · TOM {item.key}</span><strong className="mt-1 block text-sm">{item.title}</strong><span className="text-xs text-muted-foreground">{item.subtitle}</span></button>)}</section>}
    <section className="mx-2 mt-2 grid gap-2 sm:mx-4 sm:grid-cols-[1fr_auto]"><div className="rounded-2xl border border-cyan-400/25 bg-[#10101c] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">{freePlay ? "FREE PLAY" : "OBJETIVO DO TREINO"}</p><p className="mt-1 text-sm text-muted-foreground">{freePlay ? `Você tocou: ${detected}. Próxima sugestão: ${suggestion.chord}` : `Alvo atual: ${current.label} · acerte para avançar`}</p></div><div className="flex gap-2"><button onClick={() => setFreePlay(false)} className={`rounded-lg px-3 py-2 text-xs font-bold ${!freePlay ? "bg-fuchsia-500 text-white" : "border border-white/10 text-muted-foreground"}`}>Música</button><button onClick={() => setFreePlay(true)} className={`rounded-lg px-3 py-2 text-xs font-bold ${freePlay ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-muted-foreground"}`}>Free play</button></div></div><div className="mt-3 flex items-center gap-3"><div className="grid size-14 place-items-center rounded-xl border border-fuchsia-400/50 bg-fuchsia-500/10"><strong className="text-xl text-fuchsia-200">{freePlay ? detected : current.label}</strong><span className="text-[9px] text-muted-foreground">{freePlay ? "ouvida" : "alvo"}</span></div><div className="text-xs"><p className="font-semibold">{freePlay ? "Próxima sugestão: " : "Próxima nota: "}<span className="text-cyan-300">{freePlay ? suggestion.chord : next?.label || "fim"}</span></p><p className="mt-1 text-muted-foreground">{freePlay ? `${suggestion.roman} · campo harmônico de ${track.key}` : "A próxima fica marcada em ciano no braço"}</p></div></div></div><div className="rounded-2xl border border-[#302552] bg-[#10101c] p-3 text-center"><p className="text-[10px] text-muted-foreground">PRECISÃO</p><strong className="text-3xl text-primary">{accuracy}%</strong><p className="text-xs text-muted-foreground">combo {combo}</p></div></section>
    <section className="mx-2 mt-2 overflow-hidden rounded-2xl border border-[#302552] bg-[#0b0b15] sm:mx-4"><div className="flex items-center justify-between border-b border-[#252443] px-3 py-2"><div><span className="font-mono text-[10px] text-cyan-300">PISTA DE TREINO</span><p className="text-xs text-muted-foreground">Atual: {current.label} <span className="mx-2 text-cyan-300">→</span> Próxima: {next?.label || "fim"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${flash === "hit" ? "bg-primary text-primary-foreground" : flash === "miss" ? "bg-destructive text-white" : "bg-white/10"}`}>{flash === "hit" ? "ACERTO" : flash === "miss" ? "OUVIDA, MAS NÃO É O ALVO" : status}</span></div><div className="relative h-24 bg-[linear-gradient(90deg,transparent_24%,#26233d_25%,transparent_26%,transparent_49%,#26233d_50%,transparent_51%,transparent_74%,#26233d_75%,transparent_76%)]"><div className={`falling-note note-${current.color} absolute left-[12%] top-8 w-24 ${flash === "hit" ? "note-lit" : ""}`}><span>{current.label}</span></div><div className="absolute right-[12%] top-8 grid h-9 w-24 place-items-center rounded-full border border-cyan-300/70 bg-cyan-400/10 text-xs font-bold text-cyan-200">{next?.label || "FIM"}<small className="ml-1 text-[8px]">PRÓXIMA</small></div></div><div className="h-2 bg-[#1c1930]"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></section>
    <section className="mx-2 mt-2 rounded-2xl border border-[#302552] bg-[#10101c] p-3 sm:mx-4"><div className="mb-2 flex items-center justify-between"><div><p className="font-mono text-[10px] text-cyan-300">BRAÇO DO VIOLÃO · 0–12 CASAS</p><p className="text-xs text-muted-foreground">Verde = nota ouvida · Ciano = próximo alvo</p></div><button onClick={listening ? stopListening : startMicrophone} className={`rounded-lg px-4 py-2 text-xs font-bold ${listening ? "bg-destructive text-white" : "bg-primary text-primary-foreground"}`}><Mic className="mr-1 inline size-4" />{listening ? "Parar microfone" : "Ativar microfone"}</button></div><div className="overflow-x-auto"><div className="fretboard min-w-[620px]"><div className="fret-numbers"><span>corda</span>{Array.from({ length: 13 }, (_, i) => <span key={i}>{i}</span>)}</div>{fretboard.map(row => <div className="guitar-string" key={row.string}><span className="string-name">{row.string}</span>{row.cells.map(cell => <div className={`fret-cell ${cell.isHeard ? "fret-lit" : ""} ${cell.isCurrent ? "fret-target" : ""} ${cell.isNext ? "fret-guide" : ""}`} key={cell.fret}><i>{cell.isHeard ? cell.note : cell.isCurrent ? current.label : cell.isNext ? next?.label : ""}</i></div>)}</div>)}</div></div></section>
    <section className="mx-2 my-2 grid gap-2 sm:mx-4 sm:grid-cols-[1fr_auto]"><div className="rounded-2xl border border-[#302552] bg-[#10101c] p-3"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] text-cyan-300">{listening ? "MICROFONE ATIVO" : "MICROFONE DESLIGADO"}</p><p className="text-sm">{feedback}</p><p className="mt-1 text-xs text-muted-foreground">Sinal {signal}% · {frequency}</p></div><Waves className={`size-7 ${listening ? "text-primary" : "text-muted-foreground"}`} /></div></div><div className="flex gap-2"><button onClick={reset} className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-xs font-bold"><RotateCcw className="mr-1 inline size-4" /> Replay</button>{audioUrl && <button className="flex-1 rounded-xl bg-fuchsia-500 px-4 py-3 text-xs font-bold text-white"><Play className="mr-1 inline size-4" /> Áudio</button>}</div></section>
  </main>
}
