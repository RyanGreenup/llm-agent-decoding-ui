#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["typer"]
# ///
"""Move a markdown note and update all references in the documentation."""

import re
import shutil
from pathlib import Path

import typer

app = typer.Typer(help="Move markdown notes and update references in mdbook docs.")


def get_src_dir() -> Path:
    """Get the src directory relative to this script."""
    script_dir = Path(__file__).parent.resolve()
    return script_dir.parent / "src"


def find_all_markdown_files(src_dir: Path) -> list[Path]:
    """Find all markdown files in the src directory."""
    return list(src_dir.rglob("*.md"))


def compute_relative_path(from_file: Path, to_file: Path) -> str:
    """Compute relative path from one file to another, prefixed with ./"""
    from_dir = from_file.parent
    rel_path = Path(to_file).relative_to(from_dir.resolve(), walk_up=True)
    rel_str = str(rel_path)
    # Ensure we have ./ prefix for same-directory files
    if not rel_str.startswith("."):
        rel_str = "./" + rel_str
    return rel_str


def resolve_link_path(from_file: Path, link_path: str) -> Path:
    """Resolve a link path relative to a file to an absolute path."""
    from_dir = from_file.parent
    return (from_dir / link_path).resolve()


def update_links_in_file(
    file_path: Path,
    old_abs_path: Path,
    new_abs_path: Path,
) -> bool:
    """Update markdown links in a file. Returns True if changes were made."""
    content = file_path.read_text()
    original_content = content

    # Pattern to match markdown links: [text](path.md) or [text](path.md#anchor)
    link_pattern = re.compile(r"\[([^\]]*)\]\(([^)]+\.md(?:#[^)]*)?)\)")

    def replace_link(match: re.Match) -> str:
        link_text = match.group(1)
        link_path = match.group(2)

        # Handle anchors
        anchor = ""
        if "#" in link_path:
            link_path, anchor = link_path.split("#", 1)
            anchor = "#" + anchor

        # Resolve the link to see if it points to our source file
        resolved = resolve_link_path(file_path, link_path)

        if resolved == old_abs_path:
            # This link points to the file we're moving - update it
            new_rel_path = compute_relative_path(file_path, new_abs_path)
            return f"[{link_text}]({new_rel_path}{anchor})"

        return match.group(0)

    content = link_pattern.sub(replace_link, content)

    if content != original_content:
        file_path.write_text(content)
        return True
    return False


@app.command()
def move(
    source: str = typer.Argument(help="Source file path (relative to src/)"),
    destination: str = typer.Argument(help="Destination file path (relative to src/)"),
) -> None:
    """Move a markdown note and update all references."""
    src_dir = get_src_dir()

    # Resolve paths
    source_path = (src_dir / source).resolve()
    dest_path = (src_dir / destination).resolve()

    # Validate source exists
    if not source_path.exists():
        typer.echo(f"Error: Source file does not exist: {source_path}", err=True)
        raise typer.Exit(1)

    if not source_path.suffix == ".md":
        typer.echo("Error: Source file must be a markdown file (.md)", err=True)
        raise typer.Exit(1)

    # Validate destination doesn't exist
    if dest_path.exists():
        typer.echo(f"Error: Destination already exists: {dest_path}", err=True)
        raise typer.Exit(1)

    # Ensure destination has .md extension
    if not dest_path.suffix == ".md":
        typer.echo("Error: Destination must be a markdown file (.md)", err=True)
        raise typer.Exit(1)

    # Create destination directory if needed
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    # Find all markdown files
    md_files = find_all_markdown_files(src_dir)

    # Update references in all files
    updated_files: list[Path] = []
    for md_file in md_files:
        if md_file.resolve() == source_path:
            continue  # Skip the file we're moving

        if update_links_in_file(md_file, source_path, dest_path):
            updated_files.append(md_file)

    # Move the file
    shutil.move(str(source_path), str(dest_path))

    # Print summary
    typer.echo(f"Moved: {source} -> {destination}")
    if updated_files:
        typer.echo(f"Updated references in {len(updated_files)} file(s):")
        for f in updated_files:
            rel_path = f.relative_to(src_dir)
            typer.echo(f"  - {rel_path}")
    else:
        typer.echo("No references needed updating.")


if __name__ == "__main__":
    app()
