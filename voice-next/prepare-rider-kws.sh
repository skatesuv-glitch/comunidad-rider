#!/usr/bin/env bash
set -euo pipefail

MODEL="sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/${MODEL}.tar.bz2"
DEST="${1:-android/app/src/main/assets/rider-kws}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[Rider Voz] Descargando modelo KWS oficial..."
curl -L --fail --retry 3 "$URL" -o "$WORK/model.tar.bz2"
tar -xjf "$WORK/model.tar.bz2" -C "$WORK"

SRC="$WORK/$MODEL"
OUT="$DEST/$MODEL"
mkdir -p "$OUT"

echo "[Rider Voz] Generando tokens para RIDER..."
python3 -m pip install --disable-pip-version-check "sherpa-onnx==1.13.8"
printf 'RIDER :1.5 #0.25\n' > "$WORK/keywords_raw.txt"

sherpa-onnx-cli text2token \
  --tokens "$SRC/tokens.txt" \
  --tokens-type bpe \
  --bpe-model "$SRC/bpe.model" \
  "$WORK/keywords_raw.txt" \
  "$WORK/rider-keyword.txt"

cp "$SRC/encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx" "$OUT/"
cp "$SRC/decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx" "$OUT/"
cp "$SRC/joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx" "$OUT/"
cp "$SRC/tokens.txt" "$OUT/"
cp "$WORK/rider-keyword.txt" "$OUT/"

echo "[Rider Voz] Assets preparados en: $OUT"
cat "$OUT/rider-keyword.txt"
