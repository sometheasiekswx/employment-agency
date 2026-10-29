"""Native folder selection for the local desktop server only."""
from pathlib import Path
import shutil
import subprocess
import sys


def choose_folder():
    """Return an existing directory, or None when the user cancels."""
    if sys.platform == 'darwin':
        command = ['/usr/bin/osascript', '-e', '''try
return POSIX path of (choose folder with prompt "Open a career workspace folder")
on error number -128
return ""
end try''']
        cancel_codes = ()
    elif sys.platform == 'win32':
        command = ['powershell.exe', '-NoProfile', '-STA', '-Command', '''
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Open a career workspace folder'
$dialog.ShowNewFolderButton = $true
try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::WriteLine($dialog.SelectedPath)
    }
} finally { $dialog.Dispose() }
''']
        cancel_codes = ()
    elif sys.platform.startswith('linux'):
        if executable := shutil.which('zenity'):
            command = [executable, '--file-selection', '--directory', '--title=Open a career workspace folder']
        elif executable := shutil.which('kdialog'):
            command = [executable, '--getexistingdirectory', str(Path.home()), '--title', 'Open a career workspace folder']
        else:
            raise ValueError('A desktop folder chooser is unavailable. Install Zenity or KDialog, or start the app with --workspace followed by the folder path.')
        cancel_codes = (1,)
    else:
        raise ValueError('Folder selection is unavailable on this computer. Start the app with --workspace followed by the folder path.')
    try:
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', timeout=180)
    except subprocess.TimeoutExpired:
        raise ValueError('Folder selection timed out. Click Open Folder to try again.') from None
    except (OSError, UnicodeError):
        raise ValueError('The folder chooser could not open. Start the app with --workspace followed by the folder path.') from None
    if result.returncode in cancel_codes and not result.stderr.strip():
        return None
    if result.returncode:
        raise ValueError('The folder chooser could not open. Click Open Folder to try again.')
    # Remove the command's line ending, preserving spaces in directory names.
    selected = result.stdout.removesuffix('\n').removesuffix('\r')
    if not selected:
        return None
    path = Path(selected)
    if not path.is_absolute() or not path.is_dir():
        raise ValueError('The selected folder is no longer available. Choose an existing folder.')
    return path.resolve()
