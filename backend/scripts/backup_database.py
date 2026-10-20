"""
Take a backup of the GigEzee database.

Supabase takes its own daily snapshots, but on the free and Pro plans
those are the provider's copy on the provider's schedule: if the project
is paused, deleted or loses access, they go with it. This writes a copy
somewhere GigEzee controls, keeps a rolling window of them, and exits
non-zero when something goes wrong so a scheduler can alert on it.

Two formats:

  --format sql   pg_dump custom archive, if pg_dump is installed. This
                 is the one to restore from; it keeps indexes,
                 constraints and sequences.
  --format json  one file of rows per table, using the connection the
                 app already has. No pg_dump needed, so it works on
                 Render's plain Python image, but restoring it means
                 loading the rows back yourself.

Usage, from the backend folder:

    python scripts/backup_database.py                    # json, 14 kept
    python scripts/backup_database.py --format sql
    python scripts/backup_database.py --out /data/backups --keep 30
    python scripts/backup_database.py --check            # verify only

Schedule it daily. On Render that is a Cron Job with the start command
above; anywhere with cron:

    0 3 * * *  cd /app/backend && python scripts/backup_database.py --out /data/backups
"""

import argparse
import gzip
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import DATABASE_URL  # noqa: E402
from app.database import engine  # noqa: E402

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "db_backups"
DEFAULT_KEEP = 14

# Written row by row rather than table by table, so one enormous table
# can't take the whole process down with it
CHUNK = 2000


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")


def table_names() -> list:
    return sorted(inspect(engine).get_table_names(schema="public"))


def backup_json(out_dir: Path) -> Path:
    """Every table's rows, gzipped. Uses the app's own connection."""
    path = out_dir / f"koodam_{timestamp()}.json.gz"
    tables = table_names()

    if not tables:
        raise SystemExit("No tables found - is DATABASE_URL pointing at the right database?")

    counts = {}

    with gzip.open(path, "wt", encoding="utf-8") as handle:
        handle.write('{\n')

        with engine.connect() as connection:
            for index, table in enumerate(tables):
                handle.write(f'{"," if index else ""}{json.dumps(table)}: [\n')

                rows = connection.execution_options(
                    stream_results=True
                ).execute(text(f'SELECT * FROM public."{table}"'))

                written = 0

                for row in rows:
                    handle.write(
                        f'{"," if written else ""}'
                        f'{json.dumps(dict(row._mapping), default=str)}\n'
                    )
                    written += 1

                handle.write(']\n')
                counts[table] = written

        handle.write('}\n')

    total = sum(counts.values())
    print(f"  {len(tables)} tables, {total} rows")

    for table, count in counts.items():
        if count:
            print(f"    {count:>7}  {table}")

    return path


def backup_sql(out_dir: Path) -> Path:
    """A pg_dump custom archive, which is what you restore from."""
    if not shutil.which("pg_dump"):
        raise SystemExit(
            "pg_dump isn't installed. Install the postgresql client, or "
            "use --format json."
        )

    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL isn't set.")

    path = out_dir / f"koodam_{timestamp()}.dump"

    # SQLAlchemy's +psycopg2 suffix means nothing to pg_dump
    url = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://")

    result = subprocess.run(
        ["pg_dump", "--format=custom", "--no-owner", "--no-acl",
         "--file", str(path), url],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        # The URL carries the password; keep it out of the logs
        raise SystemExit(f"pg_dump failed:\n{result.stderr.strip()[:2000]}")

    return path


def prune(out_dir: Path, keep: int) -> None:
    backups = sorted(
        [p for p in out_dir.iterdir()
         if p.is_file() and p.name.startswith("koodam_")],
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )

    for old in backups[keep:]:
        old.unlink()
        print(f"  removed old backup {old.name}")


def check() -> None:
    """Confirm the database is reachable and report its size."""
    with engine.connect() as connection:
        tables = table_names()
        rows = {
            table: connection.execute(
                text(f'SELECT count(*) FROM public."{table}"')
            ).scalar()
            for table in tables
        }

    print(f"Connected. {len(tables)} tables:")

    for table, count in rows.items():
        print(f"  {count:>7}  {table}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Back up the GigEzee database.")
    parser.add_argument("--format", choices=("json", "sql"), default="json")
    parser.add_argument("--out", default=os.getenv("GIGEZEE_BACKUP_DIR", str(DEFAULT_OUT)))
    parser.add_argument(
        "--keep",
        type=int,
        default=int(os.getenv("GIGEZEE_BACKUP_KEEP", DEFAULT_KEEP)),
        help=f"how many backups to keep (default {DEFAULT_KEEP})"
    )
    parser.add_argument("--check", action="store_true", help="test the connection only")

    args = parser.parse_args()

    if args.check:
        check()
        return

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Backing up to {out_dir} ({args.format})")

    path = backup_sql(out_dir) if args.format == "sql" else backup_json(out_dir)

    size_mb = path.stat().st_size / (1024 * 1024)

    # An almost-empty file means the dump failed quietly; better to fail
    # loudly now than to find out when the backup is needed.
    if path.stat().st_size < 1024:
        raise SystemExit(f"{path.name} is only {path.stat().st_size} bytes - treating as failed.")

    print(f"Wrote {path.name} ({size_mb:.2f} MB)")

    prune(out_dir, max(args.keep, 1))

    print("Backup complete.")


if __name__ == "__main__":
    main()
