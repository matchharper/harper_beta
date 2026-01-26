export const TARGET_SR = 24000;

// Simple linear resampler for mono Float32
export function resampleLinearMono(
  input: Float32Array,
  inRate: number,
  outRate: number
): Float32Array {
  if (inRate === outRate) return input;
  const ratio = outRate / inRate;
  const newLen = Math.floor(input.length * ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcIndex = i / ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

export function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function arrayBufferToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export class StreamingAudioPlayer {
  private audio: HTMLAudioElement;
  private q: { url: string }[] = [];
  private playing = false;
  private _volume = 1;

  constructor() {
    this.audio = new Audio();
    this.audio.addEventListener("ended", this._playNext);
    this.audio.addEventListener("error", this._playNext);
    this.audio.volume = this._volume;
  }

  dispose() {
    this.audio.pause();
    this.audio.src = "";
    this.q.forEach((x) => URL.revokeObjectURL(x.url));
    this.q = [];
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this._volume;
  }

  private _playNext = () => {
    const next = this.q.shift();
    if (!next) {
      this.playing = false;
      return;
    }
    this.audio.src = next.url;
    this.audio.play().catch(() => {
      /* ignore */
    });
  };

  async pushBase64(
    b64: string,
    mime: "audio/mpeg" | "audio/wav" = "audio/mpeg"
  ) {
    const data = base64ToUint8Array(b64) as any;
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    this.q.push({ url });
    if (!this.playing) {
      this.playing = true;
      this._playNext();
    }
  }
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const playBase64Audio = (base64: string) => {
  const byteString = atob(base64);
  const buffer = new ArrayBuffer(byteString.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i++) {
    view[i] = byteString.charCodeAt(i);
  }

  const blob = new Blob([buffer], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
};

// utils/audio.ts

// export function int16ToBase64(pcm: Int16Array): string {
//   // 1. Int16Array -> ArrayBuffer -> Uint8Array
//   const buffer = new ArrayBuffer(pcm.length * 2);
//   const view = new DataView(buffer);
//   for (let i = 0; i < pcm.length; i++) {
//     view.setInt16(i * 2, pcm[i], true); // little-endian
//   }
//   const u8 = new Uint8Array(buffer);

//   // 2. Uint8Array -> binary string
//   let binary = "";
//   for (let i = 0; i < u8.length; i++) {
//     binary += String.fromCharCode(u8[i]);
//   }

//   // 3. binary string -> base64
//   return btoa(binary);
// }
