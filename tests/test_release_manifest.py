import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from apk_voice_manifest import REQUIRED_PERMISSIONS, SERVICE, assert_voice_manifest
spec = importlib.util.spec_from_file_location('install_release', pathlib.Path(__file__).resolve().parents[1] / 'scripts/install-release.py')
install_release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(install_release)

PERMISSIONS = '\n'.join(f"uses-permission: name='{name}'" for name in REQUIRED_PERMISSIONS)


def service(name=SERVICE, types='82', exported='0'):
    return f'''    E: service (line=45)
      A: android:name(0x01010003)="{name}" (Raw: "{name}")
      A: android:exported(0x01010010)=(type 0x12)0x{exported}
      A: android:foregroundServiceType(0x01010599)=(type 0x11)0x{types}
'''


class VoiceManifestTest(unittest.TestCase):
    def test_valid_audio_service(self):
        assert_voice_manifest(PERMISSIONS, service())

    def test_microphone_without_playback_and_extra_types_are_rejected(self):
        for types in ('80', '81', '83'):
            with self.subTest(types=types), self.assertRaisesRegex(ValueError, 'types missing'):
                assert_voice_manifest(PERMISSIONS, service(types=types))

    def test_each_missing_permission_is_rejected(self):
        for name in REQUIRED_PERMISSIONS:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Missing required APK permission'):
                assert_voice_manifest(PERMISSIONS.replace(f"name='{name}'", ''), service())

    def test_duplicate_audio_service_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            assert_voice_manifest(PERMISSIONS, service() + service())

    def test_microphone_sdk_limit_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'version limit'):
            assert_voice_manifest(PERMISSIONS.replace("name='android.permission.RECORD_AUDIO'", "name='android.permission.RECORD_AUDIO' maxSdkVersion='28'"), service())

    def test_another_services_microphone_type_cannot_satisfy_audio_service(self):
        with self.assertRaisesRegex(ValueError, 'types missing'):
            assert_voice_manifest(PERMISSIONS, service(types='1') + service(name='unrelated.Service'))

    def test_exported_service_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'must not be exported'):
            assert_voice_manifest(PERMISSIONS, service(exported='ffffffff'))

    def test_nested_type_attribute_cannot_satisfy_audio_service(self):
        with self.assertRaisesRegex(ValueError, 'types missing'):
            assert_voice_manifest(PERMISSIONS, service(types='2') + '      E: property\n        A: android:foregroundServiceType(0x01010599)=(type 0x11)0x82\n')

    def test_installer_prefers_the_recorded_local_artifact_without_network(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / 'artifacts').mkdir()
            expected = {'apk': 'the-verified-build.apk', 'sha256': 'recorded-checksum'}
            (root / 'artifacts/release-manifest.json').write_text(json.dumps(expected))
            with patch.object(install_release, '__file__', str(root / 'scripts/install-release.py')), patch.object(install_release.urllib.request, 'urlopen', side_effect=AssertionError('Unexpected network request')):
                self.assertEqual(install_release.read_manifest(), expected)

    def test_installer_can_use_an_apk_downloaded_beside_its_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = pathlib.Path(temp)
            apk = directory / 'the-verified-build.apk'
            apk.write_bytes(b'fixture')
            manifest = {'apk': apk.name, 'path': '/a/different/build/machine/the-verified-build.apk'}
            self.assertEqual(install_release.find_local_apk(manifest, directory / 'release-manifest.json'), apk)


if __name__ == '__main__':
    unittest.main()
