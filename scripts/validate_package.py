#!/usr/bin/env python3
"""Validate the Math Kart Skill and its single bundled game template."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def validate_runtime_assets(template: Path) -> int:
    manifest_path = template / "assets" / "runtime-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    for entry in manifest["files"]:
        asset = template / manifest.get("root", "public") / entry["path"]
        try:
            data = asset.read_bytes()
        except OSError:
            errors.append(f"missing: {entry['path']}")
            continue
        digest = hashlib.sha256(data).hexdigest()
        if len(data) != entry["bytes"] or digest != entry["sha256"]:
            errors.append(f"hash or size mismatch: {entry['path']}")
    if errors:
        raise ValueError("Runtime asset validation failed:\n" + "\n".join(errors))
    return len(manifest["files"])


def validate_skill(skill_dir: Path) -> tuple[int, int]:
    template = skill_dir / "assets" / "math-kart"
    required = [
        skill_dir / "SKILL.md",
        skill_dir / "scripts" / "create_project.py",
        skill_dir / "references" / "GAMEPLAY.md",
        template / "package.json",
        template / "package-lock.json",
        template / "index.html",
        template / "src" / "game" / "assets.ts",
        template / "tests" / "gameplay.spec.ts",
        template / "artifacts" / "reproduction-manifest.json",
    ]
    missing = [str(path.relative_to(skill_dir)) for path in required if not path.is_file()]
    if missing:
        raise ValueError("Missing required Skill files: " + ", ".join(missing))

    skill_text = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
    if not skill_text.startswith("---\nname: math-kart\ndescription:") or "TODO:" in skill_text:
        raise ValueError("SKILL.md has invalid metadata or unfinished placeholders")

    model_dirs = [path for path in (skill_dir / "assets").glob("*/public/models") if path.is_dir()]
    if model_dirs != [template / "public" / "models"]:
        raise ValueError("Expected exactly one game template and one public/models directory")
    models = list(model_dirs[0].glob("*.glb"))
    manifest = json.loads((template / "assets" / "runtime-manifest.json").read_text(encoding="utf-8"))
    listed_models = sorted(Path(entry["path"]).name for entry in manifest["files"] if entry["path"].endswith(".glb"))
    if not models or sorted(path.name for path in models) != listed_models:
        raise ValueError("Formal GLB files do not match the runtime manifest one-to-one")

    asset_count = validate_runtime_assets(template)
    return asset_count, len(models)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-dir", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        assets, models = validate_skill(args.skill_dir.resolve())
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Skill package validation failed: {exc}") from exc
    print(f"Skill package valid: one game template, {models} GLB models, {assets}/{assets} runtime assets match SHA-256.")


if __name__ == "__main__":
    main()
