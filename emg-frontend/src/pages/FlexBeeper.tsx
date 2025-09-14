import { useEffect, useRef, useState } from "react";
import { EmgStreamParser } from "../emgParser";

function useBeep() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ensure = async () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctxRef.current.state !== "running") await ctxRef.current.resume();
    return ctxRef.current;
  };
  const beep = async (freq = 880, ms = 120) => {
    const ctx = await ensure();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq; g.gain.value = 0.12;
    o.connect(g).connect(ctx.destination);
    const t0 = ctx.currentTime; o.start(t0); o.stop(t0 + ms/1000);
  };
  const startAudio = async () => { await ensure(); };
  return { beep, startAudio };
}

export default function FlexBeeper() {
  const [url, setUrl] = useState("ws://192.168.4.1:81/");
  const [status, setStatus] = useState<"idle"|"connecting"|"connected"|"closed"|"error">("idle");
  const [thresholdHi, setThresholdHi] = useState(3.0);
  const [thresholdLo, setThresholdLo] = useState(2.0);
  const [minGapMs, setMinGapMs] = useState(300);
  const [fs, setFs] = useState<number | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [seq, setSeq] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastFireRef = useRef(0);
  const armedRef = useRef(true);
  const { beep, startAudio } = useBeep();
  const [count, setCount] = useState(0);

  useEffect(() => () => { try { wsRef.current?.close(); } catch {} }, []);

  const connect = () => {
    try { wsRef.current?.close(); } catch {}
    setStatus("connecting");
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const parser = new EmgStreamParser();
    parser.onSamples = (samples, header) => {
      setFs(header.fsHz); setScale(header.scale); setSeq(header.seq);
      const now = performance.now();
      for (let v of samples) {
        if (armedRef.current) {
          if (v >= thresholdHi && now - lastFireRef.current >= minGapMs) {
            lastFireRef.current = now;
            armedRef.current = false;
            void beep(880, 120);
            setCount(c => c + 1);  
          }
        } else if (v <= thresholdLo) {
          armedRef.current = true;
        }
      }
    };

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("error");
    ws.onmessage = (ev) => parser.push(ev.data);
  };

  return (
    <div className="grid gap-6 p-4">
      <h1 className="text-2xl font-bold">Flex Beeper</h1>

      <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-center">
        <input className="px-3 py-2 rounded bg-gray-800 border border-gray-700 font-mono"
               value={url} onChange={(e)=>setUrl(e.target.value)} />
        <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500" onClick={connect}>Connect</button>
        <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500" onClick={startAudio}>Start Audio</button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <InfoCard title="Status" value={status}/>
        <InfoCard title="Stream" value={`fs:${fs ?? "—"} scale:${scale ?? "—"} seq:${seq ?? "—"}`}/>
        <InfoCard title="Trigger" value={`gap:${minGapMs}ms armed:${String(armedRef.current)}`}/>
        <InfoCard title="Number of Reps" value={String(count)}/> 
      </div>

      <div className="rounded-xl bg-gray-800 p-4 grid md:grid-cols-3 gap-4">
        <NumInput label="Threshold Hi" value={thresholdHi} step={0.1} onChange={setThresholdHi}/>
        <NumInput label="Threshold Lo" value={thresholdLo} step={0.1} onChange={setThresholdLo}/>
        <NumInput label="Refractory (ms)" value={minGapMs} onChange={v=>setMinGapMs(Math.max(0, Math.round(v)))}/>
      </div>
    </div>
  );
}

function InfoCard({title, value}:{title:string;value:string}) {
  return (
    <div className="rounded-xl bg-gray-800 p-4">
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
function NumInput({label,value,onChange,step=1}:{label:string;value:number;onChange:(v:number)=>void;step?:number}) {
  return (
    <label className="text-sm text-gray-300">
      {label}
      <input type="number" step={step} value={value}
             onChange={(e)=>onChange(parseFloat(e.target.value))}
             className="mt-1 w-full px-3 py-2 rounded bg-gray-900 border border-gray-700"/>
    </label>
  );
}
