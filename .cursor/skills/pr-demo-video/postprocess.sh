#!/bin/bash
# Post-process a recorded demo: webm -> mp4, extract verification frames, optionally add a voiceover.
#
#   ./postprocess.sh <input.webm> <output.mp4>                 # convert + extract frames
#   ./postprocess.sh <input.webm> <output.mp4> "<narration>"   # + OpenAI TTS voiceover, muxed in
#
# After converting, ALWAYS Read a few of the emitted frames/*.png to verify the flow looks right.
set -e
IN="$1"; OUT="$2"; NARRATION="$3"
FRAMES="$(dirname "$OUT")/frames"

# webm -> mp4 (H.264, faststart for web/upload)
ffmpeg -y -i "$IN" -movflags +faststart -pix_fmt yuv420p -c:v libx264 -crf 22 "$OUT" >/dev/null 2>&1
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT")
printf "mp4: %s  (%.0fs, %s)\n" "$OUT" "$DUR" "$(du -h "$OUT" | cut -f1)"

# verification frames at 20% / 50% / 80% / 95%
mkdir -p "$FRAMES"; rm -f "$FRAMES"/*.png
for f in 0.20 0.50 0.80 0.95; do
  T=$(python3 -c "print(int($DUR*$f))")
  ffmpeg -y -ss "$T" -i "$OUT" -frames:v 1 "$FRAMES/f_${T}s.png" >/dev/null 2>&1
done
echo "frames: $FRAMES  (Read these to verify)"

# optional voiceover via OpenAI TTS (needs OPENAI_API_KEY in the environment/.env)
if [ -n "$NARRATION" ]; then
  VOICE_MP3="$(dirname "$OUT")/voice.mp3"
  python3 - "$NARRATION" "$VOICE_MP3" <<'PY'
import os, sys
from openai import OpenAI
text, out = sys.argv[1], sys.argv[2]
# key from env or the repo .env
if not os.environ.get("OPENAI_API_KEY"):
    for line in open(".env"):
        if line.startswith("OPENAI_API_KEY="):
            os.environ["OPENAI_API_KEY"] = line.split("=", 1)[1].strip(); break
r = OpenAI().audio.speech.create(model="gpt-4o-mini-tts", voice="alloy", input=text)
r.stream_to_file(out)
print("voice:", out)
PY
  WITH_VOICE="${OUT%.mp4}-voiced.mp4"
  # mux; -shortest so video length wins if narration is shorter
  ffmpeg -y -i "$OUT" -i "$VOICE_MP3" -c:v copy -c:a aac -shortest "$WITH_VOICE" >/dev/null 2>&1
  echo "voiced: $WITH_VOICE"
fi
