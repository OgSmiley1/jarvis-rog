#!/usr/bin/env python3
"""Save the complete 0.5.2 model pack to shared storage, then install the APK/bridge."""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import urllib.request

HF = 'https://huggingface.co'
VOICE = 'software-mansion/react-native-executorch-'
INSTALLER = 'https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.2/install-on-termux.py'
INSTALLER_SHA = 'a7f4248faeba4a9991532da611ab27ba25546426ce71880b48c5ad53ba028dd2'
GROUPS = [
    ('Qwen/Qwen3-4B-GGUF', 'main', '', ['Qwen3-4B-Q4_K_M.gguf']),
    ('ggml-org/SmolVLM2-500M-Video-Instruct-GGUF', 'main', '', [
        'SmolVLM2-500M-Video-Instruct-Q8_0.gguf', 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf']),
    (VOICE + 'whisper-tiny', 'v0.9.0', 'voice/whisper-tiny/v0.9.0/', [
        'xnnpack/whisper_tiny_xnnpack_fp32.pte', 'tokenizer.json']),
    (VOICE + 'bk-sdm-tiny', 'v0.9.0', 'voice/bk-sdm-tiny/v0.9.0/',
        ['xnnpack/bk_sdm_tiny_vae_256_xnnpack_fp32.pte']),
    (VOICE + 'fsmn-vad', 'v0.9.0', 'voice/fsmn-vad/v0.9.0/', ['xnnpack/fsmn_vad_xnnpack_fp32.pte']),
    (VOICE + 'kokoro', 'v0.9.0', 'voice/kokoro/v0.9.0/', [
        'xnnpack/standard/duration_predictor_std.pte', 'xnnpack/standard/synthesizer_std.pte',
        'voices/bm_daniel.bin', 'phonemizer/en-gb/tags.json',
        'phonemizer/en-gb/lexicon.json', 'phonemizer/en-gb/phonemizer_en_gb.pte']),
]
WAKE = [('melspectrogram.tflite', 1092516), ('embedding_model.tflite', 1330312), ('hey_jarvis_v0.1.tflite', 1278912)]


def model_plan():
    files = []
    for repo, revision, prefix, names in GROUPS:
        request = urllib.request.Request(f'{HF}/api/models/{repo}/revision/{revision}?blobs=true', headers={'User-Agent': 'JARVIS-setup'})
        with urllib.request.urlopen(request, timeout=60) as response:
            metadata = json.load(response)
        entries = {entry['rfilename']: entry for entry in metadata['siblings']}
        for name in names:
            entry = entries[name]
            lfs = entry.get('lfs', {})
            files.append(dict(path=prefix + name, size=entry['size'],
                              sha256=lfs.get('sha256'), gitBlob=entry.get('blobId'),
                              url=f'{HF}/{repo}/resolve/{metadata["sha"]}/{name}'))
    for name, size in WAKE:
        files.append(dict(path='voice/wakeword/' + name, size=size,
                          url='https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/' + name,
                          tflite=True))
    return files


def valid(path, entry):
    if not path.is_file() or path.stat().st_size != entry['size']:
        return False
    with path.open('rb') as source:
        if entry.get('sha256'):
            return hashlib.file_digest(source, 'sha256').hexdigest() == entry['sha256']
        if entry.get('gitBlob'):
            digest = hashlib.sha1(f'blob {entry["size"]}\0'.encode())
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
            return digest.hexdigest() == entry['gitBlob']
        if entry.get('tflite'):
            return source.read(8)[4:8] == b'TFL3'
    return False


def fetch_file(root, entry):
    target = root / entry['path']
    if valid(target, entry):
        print('Already verified:', entry['path'], flush=True)
        return
    if target.exists():
        raise RuntimeError(f'{target} exists but does not match the release model. Preserve/move it before retrying; nothing was overwritten.')
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + '.termux-part')
    if not valid(partial, entry):
        print('Downloading:', entry['path'], flush=True)
        subprocess.run(['curl', '--fail', '--location', '--retry', '5', '--retry-delay', '3',
                        '--connect-timeout', '30', '--continue-at', '-', '--output', str(partial), entry['url']], check=True)
    if not valid(partial, entry):
        raise RuntimeError(f'Validation failed: {partial}. The incomplete file was not made available to JARVIS.')
    partial.rename(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', action='store_true', help='Check upstream model metadata only; do not download models or install')
    args = parser.parse_args()
    if not args.plan and not shutil.which('termux-open'):
        raise RuntimeError('Run in Termux with python, curl and termux-tools installed.')
    files = model_plan()
    total = sum(entry['size'] for entry in files)
    print(f'Model pack: {len(files)} files, {total / 1e9:.2f} GB. APK and bridge are additional.', flush=True)
    if args.plan:
        print(json.dumps(files, indent=2))
        return
    shared = pathlib.Path.home() / 'storage' / 'downloads'
    input('Close JARVIS during downloads. Allow Termux storage access, then press Enter here: ')
    if not shared.is_dir():
        raise RuntimeError('Shared Downloads unavailable. Run termux-setup-storage, grant access and retry.')
    root = shared / 'JARVIS'
    models = root / 'models'
    models.mkdir(parents=True, exist_ok=True)
    missing = 0
    for entry in files:
        target = models / entry['path']
        if valid(target, entry):
            continue
        partial = target.with_name(target.name + '.termux-part')
        saved = min(partial.stat().st_size, entry['size']) if partial.is_file() else 0
        missing += entry['size'] - saved
    if shutil.disk_usage(models).free < missing + 300_000_000:
        raise RuntimeError(f'Need approximately {missing / 1e9 + 0.3:.2f} GB free to download safely. Existing verified files are reused.')
    (root / 'model-download-plan-0.5.2.json').write_text(json.dumps(files, indent=2) + '\n')
    subprocess.run(['termux-wake-lock'], check=False)
    try:
        for entry in files:
            fetch_file(models, entry)
    finally:
        subprocess.run(['termux-wake-unlock'], check=False)
    install = root / 'install'
    install.mkdir(exist_ok=True)
    script = install / 'install-on-termux.py'
    subprocess.run(['curl', '--fail', '--location', '--retry', '3', '--output', str(script), INSTALLER], check=True)
    with script.open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != INSTALLER_SHA:
            raise RuntimeError('Installer checksum mismatch; execution refused.')
    # Installer verifies the APK before opening Android's package installer.
    subprocess.run([sys.executable, str(script), '--bridge'], check=True)
    downloads = pathlib.Path.home() / 'jarvis-downloads' / '0.5.2'
    for name in ('Jarvis-0.5.2-arm64.apk', 'release-manifest.json'):
        shutil.copy2(downloads / name, install / name)
    print(f'Finished. Models: {models.resolve()}; APK backup: {install.resolve()}')
    print('In Android Settings grant JARVIS All files access, then reopen JARVIS to discover these files.')
    print('Allow Microphone when starting Talk; enable neural voice/eyes/hands-free as desired.')
    print('Arabic system TTS voices must be installed through Android speech settings.')
    print('Shared files survive app updates/uninstall unless you or a storage cleaner delete them.')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(f'Setup stopped: {error}. Rerun the same command to resume.', file=sys.stderr)
        sys.exit(1)
