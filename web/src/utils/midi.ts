const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note number to name like "C1", "A#3".
 * MIDI note 0 = C-1 (some conventions), but DTX uses 36 = C1 (GM Bass Drum 1).
 * We use octave = Math.floor(n / 12) - 1 to match common DAW notation (C3 = 60).
 */
export function noteNumberToName(n: number): string {
  if (n < 0 || n > 127) return `?${n}`;
  const octave = Math.floor(n / 12) - 1;
  const name = NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

/**
 * Returns a short label: e.g. "C1 / 36"
 */
export function noteLabel(n: number): string {
  return `${noteNumberToName(n)} / ${n}`;
}
