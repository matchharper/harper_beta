// Recall supplies meeting audio as getUserMedia input, excluding the bot's own voice.
// Only audio leaves this page; credentials, identity, prompts and tools stay server-side.
const token = new URLSearchParams(location.hash.slice(1)).get("token");
history.replaceState(null, "", location.pathname);
const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/audio`, ["harper-meet", token]);
socket.binaryType = "arraybuffer";
let context, stream, capture, ready = false, nextTime = 0;
const playing = new Set();
function clearAudio() {
  for (const source of playing) { try { source.stop(); } catch {} }
  playing.clear(); nextTime = context?.currentTime ?? 0;
}
async function close() {
  ready = false; clearAudio(); capture?.disconnect();
  stream?.getTracks().forEach(track => track.stop());
  await context?.close();
}
async function setup() {
  context = new AudioContext({ sampleRate: 24000 });
  await context.resume();
  if (context.sampleRate !== 24000) throw new Error("PCM sample rate mismatch");
  await context.audioWorklet.addModule("/capture.worklet.js");
  stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  capture = new AudioWorkletNode(context, "meet-capture");
  context.createMediaStreamSource(stream).connect(capture);
  // Processor output is silent; connect to destination to keep it running.
  capture.connect(context.destination);
  capture.port.onmessage = ({ data }) => {
    if (!ready || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 96_000) { socket.close(1011, "Audio congestion"); return; }
    socket.send(data);
  };
  socket.send(JSON.stringify({ type: "media.ready" }));
}
socket.onopen = () => { setup().catch(() => socket.close(1011, "Media initialization failed")); };
socket.onmessage = ({ data }) => {
  if (typeof data === "string") {
    const event = JSON.parse(data);
    if (event.type === "ready") ready = true;
    if (event.type === "clear") clearAudio();
    return;
  }
  if (!context || data.byteLength % 2) { socket.close(1003, "Invalid PCM"); return; }
  if (nextTime - context.currentTime > 5) { socket.close(1011, "Playback congestion"); return; }
  const samples = new DataView(data);
  const buffer = context.createBuffer(1, data.byteLength / 2, 24000);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < output.length; i++) output[i] = samples.getInt16(i * 2, true) / 32768;
  const source = context.createBufferSource(); source.buffer = buffer;
  source.connect(context.destination); playing.add(source);
  source.onended = () => { playing.delete(source); source.disconnect(); };
  nextTime = Math.max(nextTime, context.currentTime + 0.02);
  source.start(nextTime); nextTime += buffer.duration;
};
socket.onclose = () => { void close(); };
socket.onerror = () => socket.close();
