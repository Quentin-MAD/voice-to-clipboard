import { useCallback, useEffect, useRef, useState } from "react";
import { buildDenoiseChain, encodeCleanedWav, loadDenoiseSettings, DEFAULT_DENOISE } from "@/lib/audio-cleanup";


type RecorderState = "idle" | "recording" | "processing" | "playing" | "error";

export function useMobileRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const denoiseRef = useRef(DEFAULT_DENOISE);


  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (nodeRef.current) {
      try { nodeRef.current.disconnect(); } catch {}
      nodeRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      const c = ctxRef.current;
      ctxRef.current = null;
      c.close().catch(() => {});
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      denoiseRef.current = loadDenoiseSettings();
      const tail = buildDenoiseChain(ctx, source, denoiseRef.current);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      nodeRef.current = node;
      chunksRef.current = [];
      node.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      tail.connect(node);
      node.connect(ctx.destination);
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      setState("recording");
    } catch (err) {
      console.error("mic error", err);
      setState("error");
      throw err;
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const ctx = ctxRef.current;
    const chunks = chunksRef.current;
    const sampleRate = ctx?.sampleRate ?? 44100;
    cleanup();
    if (!chunks.length) return null;
    const blob = encodeCleanedWav(chunks, sampleRate, denoiseRef.current);
    if (blob.size < 2048) return null;
    return blob;
  }, [cleanup]);


  return { state, setState, elapsed, start, stop };
}
