import { useEffect, useRef } from 'react';
import type { WaveBlock } from '../parser/types';

interface Props {
  block: WaveBlock;
}

export function Waveform({ block }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (block.samples.length === 0) return;

    const samples = block.samples;
    const step = Math.max(1, Math.floor(samples.length / width));
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      let min = Infinity, max = -Infinity;
      for (let s = x * step; s < (x + 1) * step && s < samples.length; s++) {
        const v = samples[s];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yMin = ((1 - min / 32768) / 2) * height;
      const yMax = ((1 - max / 32768) / 2) * height;
      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();
  }, [block]);

  function play() {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const actx = audioCtxRef.current;
    const { samples, sampleRate } = block;

    const audioBuffer = actx.createBuffer(1, samples.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    // Convert Int16 to float32 [-1, 1]
    for (let i = 0; i < samples.length; i++) {
      channelData[i] = samples[i] / 32768;
    }

    const source = actx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(actx.destination);
    source.start();
  }

  const durationSecs = block.samples.length / block.sampleRate;

  return (
    <div className="waveform-wrap">
      <canvas ref={canvasRef} className="waveform-canvas" width={300} height={48} />
      <div className="waveform-info">
        <span>{durationSecs.toFixed(2)}s</span>
        <span>{(block.sampleRate / 1000).toFixed(1)} kHz</span>
        <button className="play-btn" onClick={play}>▶ Play</button>
      </div>
    </div>
  );
}
