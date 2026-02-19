#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "bcrypt",
#     "typer",
#     "iterfzf",
# ]
# ///
"""Manage users in the SQLite auth database.

Reads DATABASE_PATH from the environment (loaded by justfile's dotenv-load).
"""

import json
import os
import sqlite3
import subprocess
import uuid

import bcrypt
import typer
from iterfzf import iterfzf

app = typer.Typer()
DEFAULT_ROLE = "viewer"


def get_db_path() -> str:
    path = os.environ.get("DATABASE_PATH")
    if not path:
        typer.echo("Error: DATABASE_PATH environment variable is not set.")
        raise typer.Exit(1)
    return path


def ensure_schema():
    """Run the node init-db script to create tables if they don't exist."""
    script = os.path.join(os.path.dirname(__file__), "init-db.ts")
    subprocess.run(["node", "--experimental-strip-types", script], check=True)


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_users() -> list[str]:
    conn = get_db_connection()
    cursor = conn.execute("SELECT username FROM user_credentials")
    users = [row[0] for row in cursor.fetchall()]
    conn.close()
    return users


def generate_password() -> str:
    result = subprocess.run(
        ["openssl", "rand", "-base64", "32"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def log_audit_event(cursor, user_id, username, event_type, details="", meta=None):
    """Insert a row into audit_log within the caller's transaction."""
    cursor.execute(
        """INSERT INTO audit_log (user_id, username, event_type, details, meta)
           VALUES (?, ?, ?, ?, ?)""",
        (user_id, username, event_type, details, json.dumps(meta) if meta else None),
    )


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


@app.command()
def create_user(username: str = typer.Argument(..., help="Username for the new user")):
    """Create a new user in the user_credentials table."""

    conn = get_db_connection()
    row = conn.execute(
        "SELECT username FROM user_credentials WHERE username = ?", (username,)
    ).fetchone()
    if row:
        typer.echo(f"Error: Username '{username}' already exists!")
        conn.close()
        raise typer.Exit(1)
    conn.close()

    user_id = str(uuid.uuid4())
    password = generate_password()
    password_hash = hash_password(password)

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """INSERT INTO user_credentials (user_id, username, password_hash, role)
               VALUES (?, ?, ?, ?)""",
            (user_id, username, password_hash, DEFAULT_ROLE),
        )
        log_audit_event(
            cursor, user_id, username, "user_created",
            f"Role: {DEFAULT_ROLE}", {"source": "cli"},
        )
        conn.commit()

        typer.echo(f"User created successfully!")
        typer.echo(f"User ID: {user_id}")
        typer.echo(f"Username: {username}")
        typer.echo(f"Generated Password: {password}")
        typer.echo(f"Save this password - it cannot be retrieved later!")

    except sqlite3.Error as e:
        typer.echo(f"Error creating user: {e}")
        raise typer.Exit(1)
    finally:
        conn.close()


@app.command()
def update_password():
    """Update the password for an existing user."""

    users = get_users()
    if not users:
        typer.echo("No users found in the database!")
        raise typer.Exit(1)

    selected_username = iterfzf(users, prompt="Select user to update password: ")

    if not selected_username:
        typer.echo("No user selected. Aborting.")
        raise typer.Exit(1)

    new_password = generate_password()
    password_hash = hash_password(new_password)

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT user_id FROM user_credentials WHERE username = ?",
            (selected_username,),
        )
        row = cursor.fetchone()

        if row is None:
            typer.echo(f"Error: User '{selected_username}' not found!")
            raise typer.Exit(1)

        user_id = row[0]
        cursor.execute(
            "UPDATE user_credentials SET password_hash = ? WHERE username = ?",
            (password_hash, selected_username),
        )
        log_audit_event(
            cursor, user_id, selected_username, "password_reset",
            "Password reset via CLI", {"source": "cli"},
        )
        conn.commit()
        typer.echo(f"Password updated successfully for user: {selected_username}")
        typer.echo(f"New Password: {new_password}")
        typer.echo(f"Save this password - it cannot be retrieved later!")

    except sqlite3.Error as e:
        typer.echo(f"Error updating password: {e}")
        raise typer.Exit(1)
    finally:
        conn.close()


@app.command()
def delete_user():
    """Delete an existing user from user_credentials."""

    users = get_users()
    if not users:
        typer.echo("No users found in the database!")
        raise typer.Exit(1)

    selected_username = iterfzf(users, prompt="Select user to delete: ")

    if not selected_username:
        typer.echo("No user selected. Aborting.")
        raise typer.Exit(1)

    confirm = typer.confirm(f"Are you sure you want to delete user '{selected_username}'?")
    if not confirm:
        typer.echo("Deletion cancelled.")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT user_id FROM user_credentials WHERE username = ?",
            (selected_username,),
        )
        row = cursor.fetchone()

        if row is None:
            typer.echo(f"Error: User '{selected_username}' not found!")
            raise typer.Exit(1)

        user_id = row[0]
        cursor.execute(
            "DELETE FROM user_credentials WHERE username = ?",
            (selected_username,),
        )
        log_audit_event(
            cursor, user_id, selected_username, "user_deleted",
            "User deleted via CLI", {"source": "cli"},
        )
        conn.commit()
        typer.echo(f"User '{selected_username}' deleted successfully.")

    except sqlite3.Error as e:
        typer.echo(f"Error deleting user: {e}")
        raise typer.Exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    ensure_schema()
    app()
