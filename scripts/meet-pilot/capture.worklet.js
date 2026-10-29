// AudioContext resamples the capture source to 24 kHz before this processor.
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.samples = new Int16Array(480); this.offset = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] / channels.length;
      sample = Math.max(-1, Math.min(1, sample));
      this.samples[this.offset++] = sample < 0 ? sample * 32768 : sample * 32767;
      if (this.offset === this.samples.length) {
        const bytes = new ArrayBuffer(this.samples.length * 2);
        const view = new DataView(bytes);
        this.samples.forEach((value, index) => view.setInt16(index * 2, value, true));
        this.port.postMessage(bytes, [bytes]);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("meet-capture", Capture);
