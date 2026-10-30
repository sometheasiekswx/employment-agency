"""Build complete wheels and discard stale files from earlier package layouts."""
from pathlib import Path
import shutil
from setuptools import setup
from setuptools.command.build_py import build_py


class BuildPy(build_py):
    def run(self):
        source = Path(self.get_package_dir('employment_agency'))
        if not (source / 'web/index.html').is_file():
            raise RuntimeError('Build the frontend first: npm --prefix frontend ci --ignore-scripts && npm --prefix frontend run build')
        target = Path(self.build_lib) / 'employment_agency'
        if target.exists():
            shutil.rmtree(target)
        super().run()


setup(cmdclass={'build_py': BuildPy})
