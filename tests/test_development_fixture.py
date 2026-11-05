"""Dependency staging stays isolated on same- and cross-filesystem runners."""
import errno
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from check_development import link_or_copy


class DevelopmentFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ea-dependency-stage-test-')
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source.js'
        self.destination = self.root / 'staged.js'
        self.source.write_bytes(b'export const fixture = "fictional";\n')

    def tearDown(self):
        self.temporary.cleanup()

    def test_same_filesystem_uses_a_hard_link_without_copying(self):
        with patch('check_development.shutil.copy2', side_effect=AssertionError('Do not copy a successful link')):
            link_or_copy(self.source, self.destination)
        self.assertTrue(os.path.samefile(self.source, self.destination))
        self.assertEqual(self.destination.read_bytes(), self.source.read_bytes())

    def test_cross_filesystem_copies_identical_bytes_without_linking(self):
        original = self.source.read_bytes()
        with patch('check_development.os.link', side_effect=OSError(errno.EXDEV, 'Different filesystems')):
            link_or_copy(self.source, self.destination)
        self.assertEqual(self.destination.read_bytes(), original)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertFalse(os.path.samefile(self.source, self.destination))

    def test_other_link_errors_propagate_without_attempting_a_copy(self):
        failure = PermissionError(errno.EACCES, 'Fixture permission denied')
        with patch('check_development.os.link', side_effect=failure), \
                patch('check_development.shutil.copy2') as copy:
            with self.assertRaises(PermissionError) as raised:
                link_or_copy(self.source, self.destination)
        self.assertIs(raised.exception, failure)
        copy.assert_not_called()
        self.assertFalse(self.destination.exists())


if __name__ == '__main__':
    unittest.main()
