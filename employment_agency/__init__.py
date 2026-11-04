"""Local career workspace. No automatic submission."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("employment-agency-local")
except PackageNotFoundError:
    __version__ = "0+uninstalled"
