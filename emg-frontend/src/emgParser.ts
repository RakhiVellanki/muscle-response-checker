

export type EmgFrameHeader = {
  nSamp: number;
  fsHz: number;
  scale: number;
  seq: number;
};

const HDR = 14;

export class EmgStreamParser {
  private buf = new Uint8Array(0);
  private seqLast = -1;

  onSamples?: (samples: number[], header: EmgFrameHeader) => void;
  onDrop?: (expected: number, got: number) => void;

  push(chunk: ArrayBuffer | Uint8Array) {
    const b = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    // concat
    const out = new Uint8Array(this.buf.length + b.length);
    out.set(this.buf, 0);
    out.set(b, this.buf.length);
    this.buf = out;

    this.parse();
  }

  private parse() {
    let off = 0;
    // scan for 'EMG1'
    while (true) {
      let i = this.buf.indexOf(0x45, off); // 'E'
      while (i >= 0) {
        if (
          this.buf[i + 1] === 0x4D && // 'M'
          this.buf[i + 2] === 0x47 && // 'G'
          this.buf[i + 3] === 0x31    // '1'
        ) break;
        i = this.buf.indexOf(0x45, i + 1);
      }

      if (i < 0 || this.buf.length - i < HDR) {
        this.buf = this.buf.slice(off);
        return;
      }

      const dv = new DataView(this.buf.buffer, this.buf.byteOffset + i);
      const nSamp = dv.getUint16(4, true);
      const fsHz  = dv.getUint16(6, true);
      let scale   = dv.getInt16(8, true);
      const seq   = dv.getUint32(10, true) >>> 0;
      if (scale === 0) scale = 1;

      const frameBytes = HDR + nSamp * 2;
      if (this.buf.length - i < frameBytes) {
        this.buf = this.buf.slice(i);
        return;
      }

      const sU8 = this.buf.slice(i + HDR, i + frameBytes);
      const sv  = new DataView(sU8.buffer, sU8.byteOffset, sU8.byteLength);
      const out: number[] = new Array(nSamp);
      for (let k = 0; k < nSamp; k++) {
        const s = sv.getInt16(k * 2, true);
        out[k] = s / scale;
      }

 
      if (this.seqLast >= 0 && ((this.seqLast + 1) >>> 0) !== seq) {
        this.onDrop?.((this.seqLast + 1) >>> 0, seq);
      }
      this.seqLast = seq;

      this.onSamples?.(out, { nSamp, fsHz, scale, seq });

      off = i + frameBytes;
    }
  }
}
