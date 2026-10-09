#!/usr/bin/env python3
"""Record evidence from the final artifact. No placeholder hashes or runtime claims."""
import hashlib, json, os, pathlib, re, subprocess, sys, zipfile
from apk_voice_manifest import assert_voice_manifest
root = pathlib.Path(__file__).resolve().parent.parent
apk = pathlib.Path(sys.argv[1]).resolve()
sdk = pathlib.Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
def run(*args): return subprocess.check_output(args, text=True, cwd=root).strip()
if not apk.is_file(): raise SystemExit('APK missing')
if run('git', 'status', '--porcelain', '--untracked-files=no'): raise SystemExit('Refusing release manifest for modified tracked source')
badging = run(str(sdk/'aapt'), 'dump', 'badging', str(apk))
signature = run(str(sdk/'apksigner'), 'verify', '--verbose', '--print-certs', str(apk))
run(str(sdk/'zipalign'), '-c', '-P', '16', '4', str(apk))
permissions = run(str(sdk/'aapt'), 'dump', 'permissions', str(apk))
xml = run(str(sdk/'aapt'), 'dump', 'xmltree', str(apk), 'AndroidManifest.xml')
assert_voice_manifest(permissions, xml)
(root/'artifacts/apk-permissions.txt').write_text(permissions+'\n')
(root/'artifacts/apk-manifest.txt').write_text(xml+'\n')
package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
if not package: raise SystemExit('Unable to read Android package')
with zipfile.ZipFile(apk) as bundle:
    names = bundle.namelist()
    for required in ['assets/index.android.bundle', 'lib/arm64-v8a/librnskia.so', 'lib/arm64-v8a/libreanimated.so', 'lib/arm64-v8a/librnllama.so', 'lib/arm64-v8a/librnllama_jni.so', 'lib/arm64-v8a/librnllama_jni_v8_2_dotprod_i8mm.so', 'lib/arm64-v8a/librnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl.so']:
        if required not in names: raise SystemExit('Missing required APK payload: ' + required)
    abis = sorted({name.split('/')[1] for name in names if name.startswith('lib/')})
    config = json.loads(bundle.read('assets/app.config'))
    if config.get('extra', {}).get('buildCommit') != run('git', 'rev-parse', 'HEAD'):
        raise SystemExit('APK embedded source commit does not match this checkout')
    if config.get('version') != package[3] or config.get('android', {}).get('versionCode') != int(package[2]):
        raise SystemExit('APK embedded version does not match Android package metadata')
manifest = dict(apk=apk.name, path=str(apk), size=apk.stat().st_size, sha256=hashlib.file_digest(apk.open('rb'),'sha256').hexdigest(), package=package[1], versionCode=int(package[2]), versionName=package[3], sourceCommit=run('git','rev-parse','HEAD'), sourceTree=run('git','rev-parse','HEAD^{tree}'), branch=run('git','branch','--show-current'), buildType='release', signing='Expo debug certificate; sideload preview', abis=abis, install='UNVERIFIED', launch='UNVERIFIED', device='UNVERIFIED')
manifest['certificateSha256'] = re.search(r'Signer #1 certificate SHA-256 digest: (\w+)',signature)[1]
(root/'artifacts/release-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'artifacts/SHA256SUMS').write_text(manifest['sha256']+'  '+apk.name+'\n')
(root/'artifacts/apk-signature.txt').write_text(signature+'\n')
(root/'artifacts/apk-package.txt').write_text(badging+'\n')
print(json.dumps(manifest,indent=2))
