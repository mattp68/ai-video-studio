"""Disk-efficient copies and free-space checks, using only the standard library.

Copies try a copy-on-write clone first: clonefile on macOS (APFS) and FICLONE
reflinks on Linux filesystems that support them (Btrfs, XFS, bcachefs). A clone
shares the original's data until either file changes, so it uses almost no extra
disk space, and changing one never changes the other. Everywhere else, including
Windows, exFAT and network drives, the result is an ordinary full copy. The files
produced are identical either way; only the space used differs.
"""
import ctypes
import ctypes.util
import errno
import os
from pathlib import Path
import shutil
import sys
import tempfile

# Regenerable working files (frame dumps, mattes, temporary renders) belong in a
# version's .scratch folder. HyperFrames history skips dot-folders, and new versions
# and editor working copies leave it out. Never reference .scratch from a composition.
SCRATCH = ".scratch"
# HyperFrames rebuilds these on demand. Leaving out .hyperframes gives a new version
# its own HyperFrames history instead of sharing the previous version's identity.
REGENERATED = (".hyperframes", ".thumbnails", ".waveform-cache", ".transcode-cache")
NEVER_COPIED = (".git", ".venv", "node_modules", "__pycache__", "studio-editor")

RENDER_MIN_FREE_GB = 10
FICLONE = 0x40049409  # Linux _IOW(0x94, 9, int)

_clonefile = None
if sys.platform == "darwin":
    try:
        _libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
        _clonefile = _libc.clonefile
        _clonefile.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
        _clonefile.restype = ctypes.c_int
    except (OSError, AttributeError, TypeError):
        _clonefile = None


def _try_clone(src, dst):
    """Clone src to the new path dst. Return False when this disk cannot clone it."""
    if _clonefile is not None:
        if _clonefile(os.fsencode(src), os.fsencode(dst), 0) == 0:
            return True
        if ctypes.get_errno() == errno.EEXIST:
            raise FileExistsError(errno.EEXIST, "Refusing to overwrite", dst)
        return False
    if sys.platform.startswith("linux"):
        import fcntl
        with open(src, "rb") as source:
            target = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                fcntl.ioctl(target, FICLONE, source.fileno())
            except OSError:
                os.close(target)
                os.unlink(dst)
                return False
            os.close(target)
        return True
    return False


def copy_file(src, dst):
    """Copy one file like shutil.copy2 without overwriting. Return "clone" or "copy"."""
    src, dst = os.fspath(src), os.fspath(dst)
    if os.path.lexists(dst):
        raise FileExistsError(errno.EEXIST, "Refusing to overwrite", dst)
    if os.path.isfile(src) and _try_clone(src, dst):
        shutil.copystat(src, dst)
        return "clone"
    shutil.copy2(src, dst)
    return "copy"


def copy_tree(src, dst, skip=(), symlinks=False, dirs_exist_ok=False):
    """Copy a folder like shutil.copytree, cloning files where possible.

    skip names files or folders to leave out at any depth. Returns counts and bytes
    for cloned and copied files plus the skipped names that were actually present.
    """
    skip = set(skip)
    summary = {"cloned": 0, "copied": 0, "cloned_bytes": 0, "copied_bytes": 0, "skipped": set()}

    def ignore(_folder, names):
        left_out = [name for name in names if name in skip]
        summary["skipped"].update(left_out)
        return left_out

    def copy_one(source, target):
        how = copy_file(source, target)
        size = os.path.getsize(target)
        summary["cloned" if how == "clone" else "copied"] += 1
        summary["cloned_bytes" if how == "clone" else "copied_bytes"] += size
        return target

    shutil.copytree(src, dst, symlinks=symlinks, ignore=ignore, copy_function=copy_one,
                    dirs_exist_ok=dirs_exist_ok)
    summary["skipped"] = sorted(summary["skipped"])
    return summary


def size_label(count):
    for unit in ["bytes", "KB", "MB", "GB"]:
        if count < 1000 or unit == "GB":
            return f"{count:.0f} {unit}" if unit == "bytes" else f"{count:.1f} {unit}"
        count /= 1000


def free_bytes(path):
    """Free bytes on the disk holding path, or its nearest existing parent folder."""
    current = Path(path).absolute()
    while not current.exists() and current != current.parent:
        current = current.parent
    return shutil.disk_usage(current).free


def render_space_warning(argv, minimum_gb=None, free=free_bytes):
    """Plain-language warning when a HyperFrames render may run out of disk, else None.

    argv is the HyperFrames command line without the program name. Rendering extracts
    full-size frames into a temporary cache and writes the output beside the project,
    so both disks are checked.
    """
    if not argv or argv[0] != "render":
        return None
    if minimum_gb is None:
        try:
            minimum_gb = float(os.environ.get("AI_VIDEO_STUDIO_MIN_FREE_GB", RENDER_MIN_FREE_GB))
        except ValueError:
            minimum_gb = RENDER_MIN_FREE_GB
    if minimum_gb <= 0:
        return None
    project = next((arg for arg in argv[1:] if not arg.startswith("-")), ".")
    places = {"the project": project, "the temporary render cache": tempfile.gettempdir()}
    low = []
    for label, place in places.items():
        try:
            available = free(place)
        except OSError:
            continue  # The check is advisory; never block a render because it failed.
        if available < minimum_gb * 1e9:
            low.append(f"{size_label(available)} free on the disk holding {label}")
    if not low:
        return None
    return ("Warning: only " + " and ".join(low) + f". A full-frame render can need about "
            f"{minimum_gb:g} GB for frames and caches. To see HyperFrames caches you can remove, run "
            "python3 scripts/hf.py clean --dry-run. Set AI_VIDEO_STUDIO_MIN_FREE_GB=0 to turn off this check.")
