"""Run once (needs internet): python scripts/get_speech_models.py
Download the speech models from Hugging Face into static/assets/models, keep only what transformers.js needs, and split any file over 24 MiB
into .part0, .part1 ... (Cloudflare Pages allows 25 MiB per file)."""
import json, os, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "static" / "assets" / "models"
LIMIT = 24 * 1024 * 1024
KEEP_JSON = {"config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "added_tokens.json", "vocab.json", "normalizer.json"}

def fetch(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return
    print("  get", url.split("/resolve/main/")[1])
    urllib.request.urlretrieve(url, dest)

def split(path: Path):
    if path.stat().st_size <= LIMIT:
        return []
    data = path.read_bytes(); parts = []
    for i in range(0, len(data), LIMIT):
        p = path.with_name(path.name + f".part{i // LIMIT}"); p.write_bytes(data[i:i + LIMIT]); parts.append(p.name)
    path.unlink()
    return parts

def get(repo, name, onnx_files, extra_json=()):
    out = ROOT / name; print(name)
    tree = json.load(urllib.request.urlopen(f"https://huggingface.co/api/models/{repo}/tree/main", timeout=30))
    for x in tree:
        if x["type"] == "file" and x["path"] in KEEP_JSON:
            fetch(f"https://huggingface.co/{repo}/resolve/main/{x['path']}", out / x["path"])
    manifest = {}
    for f in onnx_files:
        fetch(f"https://huggingface.co/{repo}/resolve/main/{f}", out / f)
        parts = split(out / f)
        if parts: manifest[f] = parts
    (out / "parts.json").write_text(json.dumps(manifest, indent=1), "utf-8")
    print("  done:", sorted(os.listdir(out)), manifest)

get("Xenova/whisper-tiny", "whisper-tiny", ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"])
get("Xenova/whisper-base", "whisper-base", ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"])
get("Xenova/mms-tts-eng", "mms-tts-eng", ["onnx/model_quantized.onnx"])
get("Xenova/mms-tts-hin", "mms-tts-hin", ["onnx/model_quantized.onnx"])
total = sum(f.stat().st_size for f in ROOT.rglob("*") if f.is_file() and any(k in str(f) for k in ("whisper", "mms")))
print("total MB", round(total / 1e6, 1))
