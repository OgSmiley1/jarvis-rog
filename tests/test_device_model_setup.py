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
