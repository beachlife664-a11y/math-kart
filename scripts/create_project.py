#!/usr/bin/env python3
"""Copy the bundled Math Kart game into a new writable project directory."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from validate_package import validate_runtime_assets

SKILL_DIR = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL_DIR / "assets" / "math-kart"
GENERIC_IGNORES = {
    ".DS_Store",
    ".agent",
    ".env",
    ".playwright-cli",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
    "__pycache__",
}


def copy_template(destination: Path) -> None:
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise ValueError("Destination must be absent or an empty directory; no files were overwritten")

    def ignore(directory: str, names: list[str]) -> set[str]:
        current = Path(directory)
        relative = current.relative_to(TEMPLATE)
        ignored = set(names).intersection(GENERIC_IGNORES)
        if relative == Path("assets"):
            ignored.update({"models", "concepts"} & set(names))
        if relative == Path("artifacts"):
            for name in names:
                path = current / name
                if path.is_dir() and (name == "reproduction" or name.startswith("art-v") or name.startswith("v")):
                    ignored.add(name)
                if name.startswith("browser-compatibility-") or name.startswith("release-smoke-"):
                    ignored.add(name)
        return ignored

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(TEMPLATE, destination, dirs_exist_ok=True, ignore=ignore)
    for name in ("LICENSE", ".gitignore", ".gitattributes", ".editorconfig"):
        source = SKILL_DIR / name
        if source.is_file():
            shutil.copy2(source, destination / name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    destination = args.destination.expanduser().resolve()
    try:
        copy_template(destination)
        count = validate_runtime_assets(destination)
    except (OSError, ValueError, KeyError) as exc:
        raise SystemExit(f"Project creation failed: {exc}") from exc
    print(f"Created Math Kart project: {destination}")
    print(f"Verified {count}/{count} copied runtime assets against SHA-256.")
    print("Next: cd into the project, run 'node scripts/setup.mjs', then 'npm run preview:static'.")


if __name__ == "__main__":
    main()
