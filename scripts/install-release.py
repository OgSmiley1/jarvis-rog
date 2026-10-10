#!/usr/bin/env python3
"""Install the APK named by a verified release manifest without wiping user data."""
import hashlib, json, pathlib, shutil, subprocess, sys, tempfile, urllib.request, zipfile

RELEASE = 'https://api.github.com/repos/OgSmiley1/jarvis-rog/releases/tags/v0.5.3-preview'

def run(*args, check=True):
    return subprocess.run(args, check=check, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout

def read_manifest(source=None):
    if source:
        return json.loads(pathlib.Path(source).read_text())
    local_manifest = pathlib.Path(__file__).resolve().parent.parent / 'artifacts/release-manifest.json'
    if local_manifest.is_file():
        return json.loads(local_manifest.read_text())
    request = urllib.request.Request(RELEASE, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'JARVIS-installer'})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.load(response)['body']
    # The release page carries the exact build manifest, even when a binary
    # mirror is necessary. Never infer an APK from the newest EAS job.
    marker = '```jarvis-release\n'
    return json.loads(body.split(marker, 1)[1].split('```', 1)[0])

def find_local_apk(manifest, source=None):
    directory = pathlib.Path(source).resolve().parent if source else pathlib.Path(__file__).resolve().parent.parent / 'artifacts'
    candidates = (directory / pathlib.Path(manifest['apk']).name, pathlib.Path(manifest.get('path', '')))
    return next((candidate for candidate in candidates if candidate.is_file()), None)

def main():
    source = sys.argv[1] if len(sys.argv) > 1 else None
    manifest = read_manifest(source)
    required = ('apk', 'sha256', 'size', 'package', 'versionCode', 'sourceCommit')
    if not all(k in manifest for k in required):
        raise ValueError('Release manifest is incomplete')
    adb = shutil.which('adb')
    if not adb:
        raise RuntimeError('BLOCKED: ADB is not available. No files or app data were changed.')
    devices = [line.split()[0] for line in run(adb, 'devices').splitlines()[1:] if len(line.split()) > 1 and line.split()[1] == 'device']
    if len(devices) != 1:
        raise RuntimeError(f'BLOCKED: expected one authorized ADB device, found {len(devices)}')
    target = [adb, '-s', devices[0]]
    with tempfile.TemporaryDirectory(prefix='jarvis-release-') as temp:
        apk = pathlib.Path(temp) / pathlib.Path(manifest['apk']).name
        local = find_local_apk(manifest, source)
        if local:
            shutil.copyfile(local, apk)
        else:
            url = manifest.get('url', '')
            if not url.startswith('https://'):
                raise ValueError('Release requires an HTTPS APK URL or an existing local artifact')
            with urllib.request.urlopen(url, timeout=90) as response, apk.open('wb') as output:
                shutil.copyfileobj(response, output)
        digest = hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest()
        if apk.stat().st_size != manifest['size'] or digest != manifest['sha256']:
            raise ValueError('APK size/checksum mismatch. Installation refused.')
        with zipfile.ZipFile(apk) as bundle:
            for required in ('assets/index.android.bundle', 'lib/arm64-v8a/librnllama.so', 'lib/arm64-v8a/librnllama_jni.so', 'lib/arm64-v8a/librnllama_jni_v8_2_dotprod_i8mm.so', 'lib/arm64-v8a/librnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl.so', 'lib/arm64-v8a/librnskia.so', 'lib/arm64-v8a/libreanimated.so'):
                if required not in bundle.namelist():
                    raise ValueError('APK is missing required native application payload: ' + required)
        package = manifest['package']
        if package != 'com.app.localjarviscoach':
            raise ValueError('Unexpected Android package in release manifest')
        print(f"Verified {manifest['apk']} from {manifest['sourceCommit']} ({digest})")
        existing = run(*target, 'shell', 'pm', 'path', package, check=False).strip()
        print('Updating existing installation; preserving data.' if existing.startswith('package:') else 'Installing JARVIS.')
        result = subprocess.run([*target, 'install', '-r', str(apk)], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if result.returncode or 'Success' not in result.stdout:
            if 'UPDATE_INCOMPATIBLE' in result.stdout:
                raise RuntimeError('BLOCKED: signing certificate mismatch. The existing app and models were preserved. An APK signed with the original key is required for an in-place update.')
            raise RuntimeError('INSTALL FAILED: ' + result.stdout)
        details = run(*target, 'shell', 'dumpsys', 'package', package)
        if f"versionCode={manifest['versionCode']} " not in details:
            raise RuntimeError('Installed version does not match the release manifest')
        # Pull back the actual installed base APK and compare it, not just the filename.
        installed = run(*target, 'shell', 'pm', 'path', package).splitlines()[0].removeprefix('package:').strip()
        pulled = pathlib.Path(temp) / 'installed.apk'
        run(*target, 'pull', installed, str(pulled))
        if hashlib.file_digest(pulled.open('rb'), 'sha256').hexdigest() != digest:
            raise RuntimeError('Installed APK differs from the verified artifact')
        print('INSTALL VERIFIED: installed package matches checksum and version.')
        print(run(*target, 'shell', 'am', 'start', '-W', '-n', package + '/.MainActivity'))
        print('Launch requested. Allow microphone only when using voice; contacts/calendar permissions are requested by their tools. Runtime functionality needs separate verification.')

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
