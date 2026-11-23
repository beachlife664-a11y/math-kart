import math
import wave
from array import array
from pathlib import Path

RATE = 22050
BPM = 128
BEAT = 60 / BPM
BEATS = 32
DURATION = BEAT * BEATS
ROOTS = [48, 45, 41, 43]  # C, A, F, G
MELODY = [0, 7, 12, 7, 4, 7, 12, 16]

def hz(note):
    return 440 * 2 ** ((note - 69) / 12)

samples = array('h')
for i in range(int(DURATION * RATE)):
    t = i / RATE
    beat = t / BEAT
    step = int(beat * 2)
    phase = beat % 1
    chord = ROOTS[int(beat // 8) % 4]
    note = chord + 12 + MELODY[step % len(MELODY)]
    arp_phase = (beat * 2) % 1
    arp = math.sin(2 * math.pi * hz(note) * t) * math.exp(-arp_phase * 3.2)
    bass_note = chord - 12 + (7 if step % 4 == 3 else 0)
    bass = math.sin(2 * math.pi * hz(bass_note) * t) * (0.7 + 0.3 * math.exp(-phase * 4))
    kick = math.sin(2 * math.pi * (46 + 65 * math.exp(-phase * 18)) * t) * math.exp(-phase * 12)
    snare_phase = (beat - 0.5) % 1
    noise = (((i * 1103515245 + 12345) >> 8) % 20000 / 10000) - 1
    snare = noise * math.exp(-snare_phase * 18) * (1 if int(beat) % 2 == 1 else 0)
    hat_phase = (beat * 4) % 1
    hat = noise * math.exp(-hat_phase * 30) * 0.18
    chord_tone = sum(math.sin(2 * math.pi * hz(chord + n) * t) for n in (0, 4, 7)) / 3
    sidechain = 0.45 + 0.55 * min(1, phase * 4)
    value = 0.24 * arp + 0.24 * bass * sidechain + 0.38 * kick + 0.12 * snare + 0.12 * hat + 0.07 * chord_tone * sidechain
    samples.append(int(max(-1, min(1, value)) * 30000))

output = Path(__file__).resolve().parents[1] / 'public' / 'audio' / 'race-loop.wav'
output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(output), 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(samples.tobytes())
print(f'{output.name}: {output.stat().st_size} bytes, {DURATION:.1f}s, {BPM} BPM')
