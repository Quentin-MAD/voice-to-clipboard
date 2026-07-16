// Minimal WAV encoder: takes Float32 PCM chunks and returns a mono 16-bit WAV Blob.
export function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate = 16000): Blob {
  // Flatten
  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const flat = new Float32Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    flat.set(c, offset);
    offset += c.length;
  }

  // Downsample to targetRate (simple decimation with averaging)
  const down = sampleRate === targetRate ? flat : downsample(flat, sampleRate, targetRate);

  // 16-bit PCM
  const pcm = new Int16Array(down.length);
  for (let i = 0; i < down.length; i++) {
    const s = Math.max(-1, Math.min(1, down[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const bytesPerSample = 2;
  const numChannels = 1;
  const byteRate = targetRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const bytes = new Uint8Array(buffer);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  return new Blob([bytes], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;
  const ratio = from / to;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < input.length; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}
