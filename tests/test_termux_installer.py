import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('termux_installer', pathlib.Path(__file__).resolve().parents[1] / 'scripts/install-on-termux.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class TermuxInstallerTest(unittest.TestCase):
    def make_apk(self, directory, embedded_commit='a' * 40, native=True):
        apk = pathlib.Path(directory) / 'app.apk'
        with zipfile.ZipFile(apk, 'w') as bundle:
            bundle.writestr('assets/app.config', json.dumps({
                'version': '0.5.2', 'android': {'package': 'com.app.localjarviscoach', 'versionCode': 2026100801},
                'extra': {'buildCommit': embedded_commit},
            }))
            bundle.writestr('assets/index.android.bundle', b'fixture')
            if native:
                bundle.writestr('lib/arm64-v8a/librnllama.so', b'fixture')
                bundle.writestr('lib/arm64-v8a/librnskia.so', b'fixture')
        manifest = dict(versionName='0.5.2', versionCode=2026100801, package='com.app.localjarviscoach',
                        sourceCommit='a' * 40, size=apk.stat().st_size, sha256=hashlib.sha256(apk.read_bytes()).hexdigest())
        return apk, manifest

    def test_valid_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            installer.verify_apk(*self.make_apk(directory))

    def test_tampered_download_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            apk, manifest = self.make_apk(directory)
            apk.write_bytes(apk.read_bytes() + b'tamper')
            with self.assertRaisesRegex(ValueError, 'checksum/size'):
                installer.verify_apk(apk, manifest)

    def test_old_source_rejected_even_with_matching_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'embedded identity'):
                installer.verify_apk(*self.make_apk(directory, embedded_commit='b' * 40))

    def test_wrong_package_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            apk, manifest = self.make_apk(directory)
            manifest['package'] = 'other.app'
            with self.assertRaisesRegex(ValueError, 'package'):
                installer.verify_apk(apk, manifest)

    def test_missing_native_engine_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'payload'):
                installer.verify_apk(*self.make_apk(directory, native=False))


if __name__ == '__main__':
    unittest.main()
