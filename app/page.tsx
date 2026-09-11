"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Headphones, Mic, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, Waves } from "lucide-react"

type NoteEvent = { note: string; string: number; fret: number; time: number }
type Track = { id: string; title: string; description: string; key: string; bpm: number; events: NoteEvent[] }

const tracks: Track[] = [
  { id: "spider", title: "Aranha 1-2-3-4", description: "Exercício de coordenação", key: "E", bpm: 60, events: ["E","F","F#","G","G#","A","A#","B","C","C#","D","D#"].map((note, i) => ({ note, string: 6, fret: i, time: i })) },
  { id: "joy", title: "Ode à Alegria", description: "Melodia de Beethoven", key: "C", bpm: 72, events: ["E","E","F","G","G","F","E","D","C","C","D","E","E","D","D"].map((note, i) => ({ note, string: 1, fret: Math.max(0, i % 5), time: i })) },
  { id: "smoke", title: "Smoke on the Water", description: "Riff principal", key: "G", bpm: 90, events: ["G","A#","C","G","A#","C","G","A#","C","D#"].map((note, i) => ({ note, string: 4, fret: [0,3,5,0,3,5,0,3,5,6][i], time: i })) },
]

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const noteFrequency: Record<string, number> = { C: 261.63, "C#": 277.18, D: 293.66, "D#": 311.13, E: 329.63, F: 349.23, "F#": 369.99, G: 392, "G#": 415.3, A: 440, "A#": 466.16, B: 493.88 }
const harmonic: Record<string, string[]> = { C: ["C", "Dm", "Em", "F", "G", "Am"], G: ["G", "Am", "Bm", "C", "D", "Em"], E: ["E", "F#m", "G#m", "A", "B", "C#m"] }
const strings = ["e", "B", "G", "D", "A", "E"]

function detectPitch(buffer: Float32Array, sampleRate: number) {
  let sum = 0
  for (const value of buffer) sum += value * value
  const rms = Math.sqrt(sum / buffer.length)
  if (rms < 0.012) return { rms, note: null as string | null, frequency: null as number | null }
  let bestOffset = -1
  let bestCorrelation = 0
  const minOffset = Math.floor(sampleRate / 1000)
  const maxOffset = Math.min(Math.floor(sampleRate / 70), buffer.length - 1)
  for (let offset = minOffset; offset < maxOffset; offset += 2) {
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
  const [position, setPosition] = useState(0)
  const [volume, setVolume] = useState(0.72)
  const [message, setMessage] = useState("Ative o microfone e toque uma nota")
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const micRafRef = useRef<number | null>(null)
  const playbackRafRef = useRef<number | null>(null)
  const oscillatorsRef = useRef<OscillatorNode[]>([])
  const gainRef = useRef<GainNode | null>(null)
  const playbackStartRef = useRef(0)
  const playbackOffsetRef = useRef(0)
  const targetRef = useRef(0)
  const trackRef = useRef(track)
  const modeRef = useRef(mode)
  const acceptedRef = useRef(false)
  const stableNoteRef = useRef("")
  const stableCountRef = useRef(0)

  const targetNote = track.events[targetIndex]?.note || "—"
  const next = track.events[targetIndex + 1]
  const suggestion = harmonic[track.key]?.[(targetIndex + 1) % (harmonic[track.key]?.length || 1)] || "C"
  const beatSeconds = 60 / track.bpm
  const duration = Math.max(beatSeconds, (track.events.at(-1)?.time ?? 0) * beatSeconds + beatSeconds)
  const fretPositions = useMemo(() => Array.from({ length: 13 }, (_, index) => index), [])

  useEffect(() => { trackRef.current = track }, [track])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { targetRef.current = targetIndex }, [targetIndex])

  const getAudioContext = useCallback(async () => {
    if (!contextRef.current) contextRef.current = new AudioContext()
    if (contextRef.current.state === "suspended") await contextRef.current.resume()
    return contextRef.current
  }, [])

  const stopScheduledNotes = useCallback(() => {
    for (const oscillator of oscillatorsRef.current) {
      try { oscillator.stop() } catch {}
      oscillator.disconnect()
    }
    oscillatorsRef.current = []
  }, [])

  const scheduleNotes = useCallback(async (fromPosition: number) => {
    const context = await getAudioContext()
    stopScheduledNotes()
    if (!gainRef.current) {
      gainRef.current = context.createGain()
      gainRef.current.gain.value = volume
      gainRef.current.connect(context.destination)
    }
    gainRef.current.gain.setTargetAtTime(volume, context.currentTime, 0.01)
    const currentTrack = trackRef.current
    const beat = 60 / currentTrack.bpm
    const now = context.currentTime + 0.04
    currentTrack.events.forEach((event) => {
      const startAtPosition = event.time * beat
      if (startAtPosition < fromPosition - 0.02) return
      const when = now + Math.max(0, startAtPosition - fromPosition)
      const osc = context.createOscillator()
      const env = context.createGain()
      osc.type = "triangle"
      osc.frequency.value = noteFrequency[event.note] ?? 440
      env.gain.setValueAtTime(0.0001, when)
      env.gain.exponentialRampToValueAtTime(0.42, when + 0.018)
      env.gain.exponentialRampToValueAtTime(0.0001, when + Math.min(beat * 0.82, 0.65))
      osc.connect(env).connect(gainRef.current)
      osc.start(when)
      osc.stop(when + Math.min(beat, 0.75))
      oscillatorsRef.current.push(osc)
    })
  }, [getAudioContext, stopScheduledNotes, volume])

  const updatePlayback = useCallback(() => {
    if (!running) return
    const context = contextRef.current
    if (!context) return
    const nextPosition = playbackOffsetRef.current + (context.currentTime - playbackStartRef.current)
    if (nextPosition >= duration) {
      setPosition(duration)
      setRunning(false)
      playbackOffsetRef.current = 0
      stopScheduledNotes()
      return
    }
    setPosition(nextPosition)
    const currentTrack = trackRef.current
    const beat = 60 / currentTrack.bpm
    const nextIndex = Math.min(currentTrack.events.length - 1, Math.max(0, Math.floor(nextPosition / beat)))
    if (nextIndex !== targetRef.current) {
      targetRef.current = nextIndex
      setTargetIndex(nextIndex)
      acceptedRef.current = false
    }
    playbackRafRef.current = requestAnimationFrame(updatePlayback)
  }, [duration, running, stopScheduledNotes])

  useEffect(() => {
    if (running) {
      playbackRafRef.current = requestAnimationFrame(updatePlayback)
    } else if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current)
      playbackRafRef.current = null
    }
    return () => { if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current) }
  }, [running, updatePlayback])

  const togglePlayback = async () => {
    const context = await getAudioContext()
    if (running) {
      const currentPosition = Math.min(duration, playbackOffsetRef.current + (context.currentTime - playbackStartRef.current))
      playbackOffsetRef.current = currentPosition
      setPosition(currentPosition)
      setRunning(false)
      stopScheduledNotes()
      return
    }
    const startPosition = position >= duration ? 0 : position
    playbackOffsetRef.current = startPosition
    playbackStartRef.current = context.currentTime
    await scheduleNotes(startPosition)
    setRunning(true)
    setMessage("Reprodução ativa — toque junto com a sequência")
  }

  const seek = async (value: number) => {
    const nextPosition = Math.max(0, Math.min(duration, value))
    setPosition(nextPosition)
    playbackOffsetRef.current = nextPosition
    const beat = 60 / trackRef.current.bpm
    const nextIndex = Math.min(trackRef.current.events.length - 1, Math.floor(nextPosition / beat))
    setTargetIndex(nextIndex)
    targetRef.current = nextIndex
    acceptedRef.current = false
    if (running) {
      const context = await getAudioContext()
      playbackStartRef.current = context.currentTime
      await scheduleNotes(nextPosition)
    }
  }

  const reset = () => {
    stopScheduledNotes()
    setRunning(false)
    setPosition(0)
    playbackOffsetRef.current = 0
    setTargetIndex(0)
    targetRef.current = 0
    acceptedRef.current = false
    setScore(0)
    setCombo(0)
    setMessage("Treino reiniciado")
  }

  const stopMicrophone = useCallback(() => {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current)
    streamRef.current?.getTracks().forEach((item) => item.stop())
    micRafRef.current = null
    streamRef.current = null
    analyserRef.current = null
    setListening(false)
  }, [])

  const handleDetected = useCallback((note: string) => {
    setDetected(note)
    const currentTrack = trackRef.current
    const index = targetRef.current
    const currentTarget = currentTrack.events[index]?.note
    if (modeRef.current === "free") {
      const nextSuggestion = harmonic[currentTrack.key]?.[(index + 1) % (harmonic[currentTrack.key]?.length || 1)] || "C"
      setMessage(`Você tocou ${note}. Próxima sugestão: ${nextSuggestion}`)
      return
    }
    if (acceptedRef.current) return
    if (note === currentTarget) {
      acceptedRef.current = true
      setScore((value) => value + 100)
      setCombo((value) => value + 1)
      setMessage(`✓ Acertou ${note}. Prepare ${currentTrack.events[index + 1]?.note || "fim"}`)
      window.setTimeout(() => { acceptedRef.current = false }, 500)
    } else {
      setCombo(0)
      setMessage(`Você tocou ${note}. Alvo: ${currentTarget || "—"}`)
    }
  }, [])

  const analyze = useCallback(() => {
    const analyser = analyserRef.current
    const context = contextRef.current
    if (!analyser || !context) return
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    const result = detectPitch(data, context.sampleRate)
    setFrequency(result.frequency)
    if (result.note) {
      if (stableNoteRef.current === result.note) stableCountRef.current += 1
      else { stableNoteRef.current = result.note; stableCountRef.current = 1 }
      if (stableCountRef.current >= 3) handleDetected(result.note)
    } else {
      stableNoteRef.current = ""
      stableCountRef.current = 0
    }
    micRafRef.current = requestAnimationFrame(analyze)
  }, [handleDetected])

  const startMicrophone = async () => {
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const context = await getAudioContext()
      stopMicrophone()
      const analyser = context.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.15
      context.createMediaStreamSource(nextStream).connect(analyser)
      streamRef.current = nextStream
      analyserRef.current = analyser
      setListening(true)
      setMessage("Ouvindo. Toque uma nota por vez")
      analyze()
    } catch {
      setMessage("Microfone bloqueado. Libere a permissão do navegador")
    }
  }

  const selectTrack = (item: Track) => {
    stopScheduledNotes()
    setTrack(item)
    trackRef.current = item
    setTargetIndex(0)
    targetRef.current = 0
    setPosition(0)
    playbackOffsetRef.current = 0
    setRunning(false)
    setDetected(null)
    setScore(0)
    setCombo(0)
    acceptedRef.current = false
    setMessage(`Faixa selecionada: ${item.title}`)
  }

  useEffect(() => () => {
    stopMicrophone()
    stopScheduledNotes()
    if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current)
    contextRef.current?.close()
  }, [stopMicrophone, stopScheduledNotes])

  return (
    <main className="min-h-screen bg-[#090912] text-white">
      <header className="flex items-center gap-3 border-b border-[#29243f] bg-[#12111e] px-3 py-3 sm:px-6">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-cyan-400"><Waves className="size-5" /></div>
        <div><strong className="text-lg">OmniTune</strong><p className="hidden text-xs text-slate-400 sm:block">Treine, ouça e toque junto</p></div>
        <div className="ml-auto flex items-center gap-4 text-right"><div><small className="block text-[10px] text-slate-400">BPM</small><b>{track.bpm}</b></div><div><small className="block text-[10px] text-slate-400">PONTOS</small><b className="text-cyan-300">{score}</b></div></div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">Treino atual</p><h1 className="text-xl font-bold">{track.title}</h1><p className="text-sm text-slate-400">{track.description} · Tom {track.key}</p></div>
          <div className="flex gap-2"><button onClick={() => setLibraryOpen((value) => !value)} className="rounded-lg border border-fuchsia-400/60 px-3 py-2 text-xs font-bold">Biblioteca</button><button onClick={listening ? stopMicrophone : startMicrophone} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950"><Mic className="size-4" />{listening ? "Parar microfone" : "Ativar microfone"}</button></div>
        </div>
        {libraryOpen && <div className="mt-3 grid gap-2 sm:grid-cols-3">{tracks.map((item) => <button key={item.id} onClick={() => { selectTrack(item); setLibraryOpen(false) }} className={`rounded-xl border p-3 text-left ${item.id === track.id ? "border-cyan-300 bg-cyan-400/10" : "border-[#302552] bg-[#12111e]"}`}><b className="block text-sm">{item.title}</b><span className="text-xs text-slate-400">{item.description} · {item.bpm} BPM</span></button>)}</div>}
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-3 sm:px-6 lg:grid-cols-[1fr_290px]">
        <div className="rounded-2xl border border-[#302552] bg-[#10101c] p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-widest text-fuchsia-300">{mode === "song" ? "Nota alvo" : "Free play"}</p><div className="mt-1 flex items-end gap-3"><strong className="text-5xl">{mode === "song" ? targetNote : detected || "—"}</strong>{mode === "song" && next && <span className="mb-2 text-sm text-cyan-300">Depois: {next.note}</span>}</div><p className="mt-2 text-sm text-slate-300">{message}</p>{frequency && <p className="mt-1 text-xs text-slate-500">{frequency.toFixed(1)} Hz</p>}</div><div className="flex gap-2"><button onClick={() => setMode("song")} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === "song" ? "bg-fuchsia-500" : "border border-white/10 text-slate-400"}`}>Música</button><button onClick={() => setMode("free")} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === "free" ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-400"}`}>Free play</button></div></div>

          <div className="mt-5 rounded-xl border border-white/10 bg-[#0b0b15] p-3">
            <input aria-label="Linha do tempo" type="range" min="0" max={duration} step="0.01" value={position} onChange={(event) => void seek(Number(event.target.value))} className="w-full accent-fuchsia-400" />
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>{Math.floor(position / 60)}:{String(Math.floor(position % 60)).padStart(2, "0")}</span><span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}</span></div>
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
            <button onClick={() => void seek(Math.max(0, position - 5))} className="grid size-10 place-items-center rounded-full border border-white/10" aria-label="Voltar 5 segundos"><SkipBack className="size-4" /></button>
            <button onClick={() => void togglePlayback()} className="grid size-12 place-items-center rounded-full bg-fuchsia-500" aria-label={running ? "Pausar" : "Reproduzir"}>{running ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
            <button onClick={() => void seek(Math.min(duration, position + 5))} className="grid size-10 place-items-center rounded-full border border-white/10" aria-label="Avançar 5 segundos"><SkipForward className="size-4" /></button>
            <button onClick={reset} className="grid size-10 place-items-center rounded-full border border-white/10" aria-label="Reiniciar"><RotateCcw className="size-4" /></button>
            <div className="ml-auto flex items-center gap-2"><Volume2 className="size-4 text-slate-400" /><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (gainRef.current) gainRef.current.gain.setTargetAtTime(value, contextRef.current?.currentTime ?? 0, 0.01) }} className="w-24 accent-cyan-400" /></div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Headphones className="size-4 text-cyan-300" />{running ? "Reproduzindo sequência de treino" : "Pressione play para ouvir a sequência"}</div>
        </div>

        <aside className="rounded-2xl border border-cyan-400/25 bg-[#10101c] p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">Próxima sugestão</p><strong className="mt-2 block text-3xl text-cyan-300">{mode === "free" ? suggestion : next?.note || "Fim"}</strong><p className="mt-1 text-sm text-slate-400">{mode === "free" ? `Campo harmônico de ${track.key}` : "A sequência acompanha o playback"}</p><div className="mt-4 flex flex-wrap gap-2">{(harmonic[track.key] || harmonic.C).map((chord) => <span key={chord} className={`rounded-md px-2 py-1 text-xs ${chord.replace("m", "") === (mode === "free" ? detected : next?.note) ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-400"}`}>{chord}</span>)}</div><div className="mt-5 rounded-xl bg-white/5 p-3"><div className="text-xs text-slate-500">Combo</div><div className="text-2xl font-bold text-fuchsia-300">x{combo}</div></div></aside>
      </section>

      <section className="mx-auto mt-3 max-w-6xl px-3 pb-8 sm:px-6"><div className="overflow-x-auto rounded-2xl border border-[#302552] bg-[#0d0d18] p-3"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-slate-300">Braço do violão · localize a nota</span><span className="text-xs text-slate-500">Atual: {detected || "—"} · Alvo: {mode === "song" ? targetNote : "livre"}</span></div><div className="min-w-[760px]">{strings.map((stringName, stringIndex) => <div key={stringName} className="flex h-10 items-center"><span className="w-7 font-mono text-xs text-cyan-300">{stringName}</span><div className="flex flex-1">{fretPositions.map((fret) => { const open = stringIndex === 0 ? "E" : stringIndex === 1 ? "B" : stringIndex === 2 ? "G" : stringIndex === 3 ? "D" : stringIndex === 4 ? "A" : "E"; const note = noteNames[(noteNames.indexOf(open) + fret) % 12]; const isCurrent = detected === note; const isTarget = mode === "song" && targetNote === note; return <div key={`${stringName}-${fret}`} className={`relative flex h-9 w-14 items-center justify-center border-r border-[#3a3550] text-xs ${fret === 0 ? "border-l-2 border-cyan-300/60" : ""}`}><span className={`relative z-10 grid size-6 place-items-center rounded-full ${isCurrent ? "bg-cyan-300 text-slate-950 shadow-[0_0_16px_#67e8f9]" : isTarget ? "border border-fuchsia-300 text-fuchsia-200" : "text-slate-500"}`}>{note}</span></div> })}</div></div>)}</div></div></section>

      <div className="fixed bottom-3 left-3 right-3 z-20 flex items-center justify-between rounded-xl border border-cyan-300/40 bg-[#141322]/95 px-3 py-2 shadow-2xl backdrop-blur sm:hidden"><span className="flex items-center gap-2 text-xs"><span className={`size-2 rounded-full ${listening ? "bg-emerald-400" : "bg-slate-500"}`} />{listening ? `Ouvindo ${detected || "..."}` : "Microfone desligado"}</span><button onClick={listening ? stopMicrophone : startMicrophone} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950">{listening ? "Parar" : "Ativar"}</button></div>
    </main>
  )
}
