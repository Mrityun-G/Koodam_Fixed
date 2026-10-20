"""
Lock every table away from Supabase's public REST API.

Supabase generates a REST endpoint for each table in `public` and serves
it to anyone holding the anon key - which, being a browser key, is public
by definition. Only partner_payout_accounts and booking_payouts had row
level security on, so names, emails, phone numbers, addresses, bookings
and KYC rows were reachable with a key that ships in the app bundle.

KOODAM never talks to Postgres through that REST API: the FastAPI backend
owns the tables and connects as their owner, and a table's owner bypasses
RLS. So turning RLS on with no permissive policy denies the anon and
authenticated roles everything while the backend carries on unaffected.
The GRANTs are revoked too, so the tables stay closed even if someone
adds a policy later without thinking it through.

Read-only and safe to run more than once. It changes no data.

Run from the backend folder:  python migrations/002_row_level_security.py
          to preview only:    python migrations/002_row_level_security.py --dry-run
"""

import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import engine  # noqa: E402

# Everything the app owns. Each one holds something personal, financial,
# or both; none of it belongs on a public endpoint.
TABLES = (
    "users",
    "partners",
    "services",
    "bookings",
    "booking_details",
    "booking_extra_charges",
    "reviews",
    "emergency_requests",
    "partner_services",
    "partner_documents",
    "partner_payout_accounts",
    "booking_payouts",
    "complaints",
    "partner_escalations",
    "client_errors",
)

# The roles Supabase hands out to browsers. `service_role` is left alone:
# it is a server-side key and the backend may need it.
PUBLIC_ROLES = ("anon", "authenticated")


def existing_tables(connection) -> list:
    rows = connection.execute(text(
        """SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"""
    ))

    present = {row[0] for row in rows}

    return [table for table in TABLES if table in present]


def rls_status(connection) -> dict:
    rows = connection.execute(text(
        """SELECT c.relname, c.relrowsecurity,
                  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'"""
    ))

    return {row[0]: {"enabled": row[1], "policies": row[2]} for row in rows}


def main(dry_run: bool = False) -> None:
    with engine.begin() as connection:
        tables = existing_tables(connection)
        before = rls_status(connection)

        missing = [t for t in TABLES if t not in tables]

        if missing:
            print(f"Not in this database yet, skipping: {', '.join(missing)}")

        to_fix = [t for t in tables if not before.get(t, {}).get("enabled")]

        if not to_fix:
            print("Row level security is already on for every table.")
        else:
            print("Turning on row level security for:")

            for table in to_fix:
                print(f"  - {table}")

        if dry_run:
            print("\n--dry-run: nothing was changed.")
            return

        for table in tables:
            connection.execute(text(
                f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY'
            ))

            for role in PUBLIC_ROLES:
                # Roles are fixed names from PUBLIC_ROLES, never input
                connection.execute(text(
                    f'REVOKE ALL ON public."{table}" FROM {role}'
                ))

        # Stop future tables being readable the moment they are created
        for role in PUBLIC_ROLES:
            connection.execute(text(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                f"REVOKE ALL ON TABLES FROM {role}"
            ))

        after = rls_status(connection)

        print("\nResult:")

        for table in tables:
            state = after.get(table, {})
            flag = "on " if state.get("enabled") else "OFF"
            print(f"  {flag}  {table}  ({state.get('policies', 0)} policies)")

        still_open = [t for t in tables if not after.get(t, {}).get("enabled")]

        if still_open:
            raise SystemExit(
                "These tables are still open: " + ", ".join(still_open)
            )

    print(
        "\nDone. The anon key can no longer read these tables.\n"
        "Storage buckets are separate - see migrations/002_storage_policies.sql."
    )


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
