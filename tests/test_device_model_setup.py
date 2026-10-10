import hashlib
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('device_setup', pathlib.Path(__file__).resolve().parents[1] / 'scripts/setup-device-0.5.2.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class DeviceSetupTest(unittest.TestCase):
    def test_whisper_plan_includes_decoder_required_by_runtime(self):
        def response(request, timeout):
            repo = request.full_url.split('/api/models/', 1)[1].split('/revision/', 1)[0]
            group = next(group for group in setup.GROUPS if group[0] == repo)
            class Result:
                def __enter__(self):
                    return self
                def __exit__(self, *_args):
                    return False
                def read(self):
                    return json.dumps({'sha': 'b' * 40, 'siblings': [
                        {'rfilename': name, 'size': 100, 'blobId': 'a' * 40} for name in group[3]
                    ]}).encode()
            return Result()

        # Supply exact upstream directory entries while keeping this unit test offline.
        from unittest.mock import patch
        import json
        with patch.object(setup.urllib.request, 'urlopen', side_effect=response):
            plan = setup.model_plan()
        decoder = {entry['path'] for entry in plan if entry['path'].startswith('voice/bk-sdm-tiny/')}
        self.assertIn('voice/bk-sdm-tiny/v0.9.0/xnnpack/bk_sdm_tiny_vae_256_xnnpack_fp32.pte', decoder)

    def entry(self):
        return {'path': 'voice/model.bin', 'size': 4, 'sha256': hashlib.sha256(b'good').hexdigest(), 'url': 'https://example.test/model'}

    def test_existing_valid_model_never_downloads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'voice').mkdir()
            (root / 'voice/model.bin').write_bytes(b'good')
            with patch.object(setup.subprocess, 'run', side_effect=AssertionError('Unexpected download')):
                setup.fetch_file(root, self.entry())

    def test_existing_different_model_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'voice').mkdir()
            target = root / 'voice/model.bin'
            target.write_bytes(b'nope')
            with self.assertRaisesRegex(RuntimeError, 'nothing was overwritten'):
                setup.fetch_file(root, self.entry())
            self.assertEqual(target.read_bytes(), b'nope')

    def test_invalid_partial_is_not_promoted_to_live_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'voice').mkdir()
            (root / 'voice/model.bin.termux-part').write_bytes(b'nope')
            with patch.object(setup.subprocess, 'run'), self.assertRaisesRegex(RuntimeError, 'Validation failed'):
                setup.fetch_file(root, self.entry())
            self.assertFalse((root / 'voice/model.bin').exists())

    def test_finished_partial_is_reused_without_download(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'voice').mkdir()
            (root / 'voice/model.bin.termux-part').write_bytes(b'good')
            with patch.object(setup.subprocess, 'run', side_effect=AssertionError('Unexpected download')):
                setup.fetch_file(root, self.entry())
            self.assertEqual((root / 'voice/model.bin').read_bytes(), b'good')


if __name__ == '__main__':
    unittest.main()
