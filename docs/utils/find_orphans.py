#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Find markdown files that are not referenced in SUMMARY.md."""

import re
import sys
from pathlib import Path


def get_src_dir() -> Path:
    """Get the src directory relative to this script."""
    script_dir = Path(__file__).parent.resolve()
    return script_dir.parent / "src"


def find_all_markdown_files(src_dir: Path) -> set[Path]:
    """Find all markdown files in the src directory."""
    return {f.resolve() for f in src_dir.rglob("*.md")}


def extract_linked_files(summary_path: Path) -> set[Path]:
    """Extract all markdown files referenced in SUMMARY.md."""
    content = summary_path.read_text()
    src_dir = summary_path.parent

    # Pattern for markdown links: [text](path.md)
    link_pattern = re.compile(r"\[([^\]]*)\]\(([^)]+\.md(?:#[^)]*)?)\)")

    linked_files: set[Path] = set()

    for match in link_pattern.finditer(content):
        link_target = match.group(2)

        # Remove anchor if present
        path_part = link_target.split("#")[0]

        # Resolve relative to src directory
        target_path = (src_dir / path_part).resolve()
        linked_files.add(target_path)

    return linked_files


def main() -> int:
    """Main entry point. Returns exit code."""
    src_dir = get_src_dir()
    summary_path = src_dir / "SUMMARY.md"

    if not src_dir.exists():
        print(f"Error: Source directory not found: {src_dir}", file=sys.stderr)
        return 1

    if not summary_path.exists():
        print(f"Error: SUMMARY.md not found: {summary_path}", file=sys.stderr)
        return 1

    # Get all markdown files
    all_files = find_all_markdown_files(src_dir)

    # Get files referenced in SUMMARY.md
    linked_files = extract_linked_files(summary_path)

    # SUMMARY.md itself shouldn't be in the navigation
    linked_files.add(summary_path.resolve())

    # Find orphans
    orphans = all_files - linked_files

    print(f"Found {len(all_files)} markdown files in src/")
    print(f"Found {len(linked_files) - 1} files referenced in SUMMARY.md")
    print()

    if not orphans:
        print("No orphaned pages found. All markdown files are in SUMMARY.md.")
        return 0

    print(f"Orphaned pages ({len(orphans)} files not in SUMMARY.md):")
    print()

    for orphan in sorted(orphans):
        rel_path = orphan.relative_to(src_dir)
        print(f"  {rel_path}")

    print()
    print("These files exist but are not linked from SUMMARY.md navigation.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
