#!/usr/bin/env python3
"""Download and verify JARVIS 0.5.2, then request Android installation.

Android owns installation and permission approval. Existing application data is
preserved by an in-place update; this installer never uninstalls the application.
"""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

VERSION = '0.5.2'
TAG = 'v0.5.2-preview'
REPO = 'OgSmiley1/jarvis-rog'
BASE = f'https://github.com/{REPO}/releases/download/{TAG}'


def download(url, destination):
    if not url.startswith('https://'):
        raise ValueError('Downloads require HTTPS')
    request = urllib.request.Request(url, headers={'User-Agent': 'JARVIS-Termux-installer'})
    partial = destination.with_suffix(destination.suffix + '.part')
    with urllib.request.urlopen(request, timeout=120) as response, partial.open('wb') as output:
        shutil.copyfileobj(response, output)
    partial.replace(destination)


def verify_apk(apk, manifest):
    if manifest.get('versionName') != VERSION or manifest.get('package') != 'com.app.localjarviscoach':
        raise ValueError('Wrong release version or Android package')
    if not re.fullmatch(r'[0-9a-f]{40}', manifest.get('sourceCommit', '')):
        raise ValueError('Missing exact source commit')
    if apk.stat().st_size != manifest['size'] or hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest() != manifest['sha256']:
        raise ValueError('APK checksum/size mismatch; installation refused')
    with zipfile.ZipFile(apk) as bundle:
        config = json.loads(bundle.read('assets/app.config'))
        if (config.get('version') != VERSION
                or config.get('android', {}).get('package') != manifest['package']
                or config.get('android', {}).get('versionCode') != manifest['versionCode']
                or config.get('extra', {}).get('buildCommit') != manifest['sourceCommit']):
            raise ValueError('APK embedded identity differs from release manifest')
        for name in ('assets/index.android.bundle', 'lib/arm64-v8a/librnllama.so', 'lib/arm64-v8a/librnskia.so'):
            if name not in bundle.namelist():
                raise ValueError('Missing application payload: ' + name)


def install_bridge(manifest, directory):
    archive = directory / 'source.zip'
    download(f'https://api.github.com/repos/{REPO}/zipball/{manifest["sourceCommit"]}', archive)
    bridge = pathlib.Path.home() / 'jarvis-termux-0.5.2'
    # Copy only tracked bridge source; preserve existing secret and environment.
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            parts = pathlib.PurePosixPath(entry.filename).parts
            if len(parts) < 3 or parts[1] != 'termux' or entry.is_dir():
                continue
            relative = pathlib.PurePosixPath(*parts[2:])
            if '..' in relative.parts or any(part.startswith('.') for part in relative.parts):
                raise ValueError('Unexpected bridge source path')
            target = bridge.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bundle.read(entry))
            if target.suffix == '.sh':
                target.chmod(0o700)
    subprocess.run(['bash', str(bridge / 'install.sh')], check=True)
    subprocess.run(['bash', str(bridge / 'start.sh')], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bridge', action='store_true', help='Also install/start the optional Termux bridge')
    args = parser.parse_args()
    if not shutil.which('termux-open'):
        raise RuntimeError('Run this inside Termux after: pkg install python termux-tools')
    directory = pathlib.Path.home() / 'jarvis-downloads' / VERSION
    directory.mkdir(parents=True, exist_ok=True)
    manifest_file = directory / 'release-manifest.json'
    download(BASE + '/release-manifest.json', manifest_file)
    manifest = json.loads(manifest_file.read_text())
    expected = f'Jarvis-{VERSION}-arm64.apk'
    if manifest.get('apk') != expected:
        raise ValueError('Unexpected APK filename')
    apk = directory / expected
    if apk.exists():
        try:
            verify_apk(apk, manifest)
        except (ValueError, KeyError, zipfile.BadZipFile):
            download(BASE + '/' + expected, apk)
    else:
        download(BASE + '/' + expected, apk)
    verify_apk(apk, manifest)
    print(f'Verified JARVIS {VERSION}: {manifest["sha256"]}', flush=True)
    subprocess.run(['termux-open', '--view', '--content-type', 'application/vnd.android.package-archive', str(apk)], check=True)
    print('Approve the Android update. If signing differs, stop; do not uninstall or clear data.')
    if args.bridge:
        install_bridge(manifest, directory)
    print('Open JARVIS: reuse your brain, or download the recommended brain with Local Only off.')
    print('Download voice resources on Wi-Fi, then grant microphone when starting Talk.')
    print('Enable Local Only afterwards and run Diagnostics: local inference and a real voice request.')
    print('Opening the installer does not prove installation or phone functionality. See docs/RELEASE_0.5.2.md.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Installation stopped: {error}', file=sys.stderr)
        sys.exit(1)
