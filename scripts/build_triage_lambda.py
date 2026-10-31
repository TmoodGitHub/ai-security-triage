import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build" / "lambda" / "triage"
DEPENDENCIES = ["anthropic", "python-dotenv"]
MODULES = ["__init__.py", "db.py", "drivers.py", "lambda_handler.py", "triage.py"]

shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir(parents=True)

subprocess.run(
    [
        sys.executable, "-m", "pip", "install",
        "--target", str(OUT),
        "--platform", "manylinux2014_aarch64",
        "--implementation", "cp",
        "--python-version", "3.13",
        "--only-binary=:all:",
        "--upgrade",
        "--quiet",
        *DEPENDENCIES
    ],
    check=True,
)

(OUT / "triage").mkdir()
for name in MODULES:
    shutil.copy(ROOT / "triage" / name, OUT / "triage" / name)

print(f"Built {OUT.relative_to(ROOT)}")