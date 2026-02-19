#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Check for dead internal markdown links in the documentation."""

import re
import sys
from dataclasses import dataclass
from pathlib import Path

# Configuration
CHECK_EMPTY_LINKS = False


@dataclass
class DeadLink:
    """Represents a dead link found in the documentation."""

    source_file: Path
    line_number: int
    link_text: str
    target_path: str
    reason: str


def get_src_dir() -> Path:
    """Get the src directory relative to this script."""
    script_dir = Path(__file__).parent.resolve()
    return script_dir.parent / "src"


def find_all_markdown_files(src_dir: Path) -> list[Path]:
    """Find all markdown files in the src directory."""
    return sorted(src_dir.rglob("*.md"))


def extract_links(file_path: Path) -> list[tuple[int, str, str]]:
    """Extract all markdown links from a file.

    Returns list of (line_number, link_text, link_target) tuples.
    """
    content = file_path.read_text()
    links: list[tuple[int, str, str]] = []

    # Pattern for markdown links: [text](path) - captures all links
    link_pattern = re.compile(r"\[([^\]]*)\]\(([^)]*)\)")

    for line_num, line in enumerate(content.splitlines(), start=1):
        for match in link_pattern.finditer(line):
            link_text = match.group(1)
            link_target = match.group(2)
            links.append((line_num, link_text, link_target))

    return links


def check_link(from_file: Path, link_target: str, src_dir: Path) -> DeadLink | None:
    """Check if a link is valid. Returns DeadLink if broken, None if valid."""
    # Empty link - placeholder
    if not link_target:
        if not CHECK_EMPTY_LINKS:
            return None
        return DeadLink(
            source_file=from_file,
            line_number=0,  # Will be set by caller
            link_text="",
            target_path="",
            reason="empty link (placeholder)",
        )

    # Skip external links
    if link_target.startswith(("http://", "https://", "mailto:", "#")):
        return None

    # Skip non-markdown links (images, etc.)
    # Extract path without anchor
    path_part = link_target.split("#")[0]
    if not path_part.endswith(".md"):
        return None

    # Resolve the relative path
    from_dir = from_file.parent
    target_path = (from_dir / path_part).resolve()

    # Check if file exists
    if not target_path.exists():
        return DeadLink(
            source_file=from_file,
            line_number=0,
            link_text="",
            target_path=link_target,
            reason="file does not exist",
        )

    return None


def main() -> int:
    """Main entry point. Returns exit code."""
    src_dir = get_src_dir()

    if not src_dir.exists():
        print(f"Error: Source directory not found: {src_dir}", file=sys.stderr)
        return 1

    md_files = find_all_markdown_files(src_dir)
    print(f"Checking links in {len(md_files)} markdown files...")
    print()

    dead_links: list[DeadLink] = []

    for md_file in md_files:
        links = extract_links(md_file)

        for line_num, link_text, link_target in links:
            result = check_link(md_file, link_target, src_dir)
            if result:
                result.line_number = line_num
                result.link_text = link_text
                dead_links.append(result)

    if not dead_links:
        print("No dead links found.")
        return 0

    # Group by file for cleaner output
    print("Dead links found:")
    print()

    files_with_dead_links: set[Path] = set()
    for dl in dead_links:
        files_with_dead_links.add(dl.source_file)
        rel_path = dl.source_file.relative_to(src_dir)
        print(f"  {rel_path}:{dl.line_number}")
        if dl.target_path:
            print(f"    [{dl.link_text}]({dl.target_path}) -> {dl.reason}")
        else:
            print(f"    [{dl.link_text}]() -> {dl.reason}")
        print()

    print(f"Summary: {len(dead_links)} dead link(s) found in {len(files_with_dead_links)} file(s)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
