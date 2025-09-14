export function makeRing(ringN = 4000) {
  return { ring: new Float32Array(ringN), rp: 0 };
}
export function pushSamples(ringObj: { ring: Float32Array; rp: number }, samples: number[]) {
  const { ring } = ringObj;
  const N = ring.length;
  let rp = ringObj.rp;
  for (let i = 0; i < samples.length; i++) {
    ring[rp] = samples[i];
    rp = (rp + 1) % N;
  }
  ringObj.rp = rp;
}
