"""
One-off migration: slim the wide tables down and move rarely-filled
columns into their own tables.

  partners         - rating, reviews_count, completion_rate (now computed
                     from reviews and bookings) and the 8 Razorpay payout
                     columns (now partner_payout_accounts)
  booking_details  - the 6 payout transfer columns (now booking_payouts)
  reviews          - user_id, partner_id (the booking already has them)
  bookings         - notes (never used)
  users            - upi_id (never used)

Also adds indexes on the foreign keys the app filters by, and drops a
duplicate index on users.firebase_uid.

Every table it touches is first saved to backend/db_backups/. Everything
runs in one transaction, and the copies are checked before any column
is dropped, so a failure leaves the database as it was.

Run from the backend folder:  python migrations/001_normalize_schema.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import engine  # noqa: E402

BACKUP_DIR = Path(__file__).resolve().parent.parent / "db_backups"

BACKED_UP_TABLES = ("users", "partners", "bookings", "booking_details", "reviews")

CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS partner_payout_accounts (
    partner_id UUID PRIMARY KEY REFERENCES partners(id),
    razorpay_account_id VARCHAR,
    razorpay_stakeholder_id VARCHAR,
    razorpay_product_id VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'NOT_SET',
    note VARCHAR,
    bank_last4 VARCHAR,
    ifsc VARCHAR,
    beneficiary_name VARCHAR
);

CREATE TABLE IF NOT EXISTS booking_payouts (
    booking_id UUID PRIMARY KEY REFERENCES bookings(id),
    status VARCHAR NOT NULL,
    razorpay_transfer_id VARCHAR,
    error VARCHAR,
    sent_at TIMESTAMP,
    settled_at TIMESTAMP,
    utr VARCHAR
);

-- Only the backend (table owner) reads these; keep them out of
-- Supabase's public REST API
ALTER TABLE partner_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payouts ENABLE ROW LEVEL SECURITY;
"""

COPY_DATA = """
INSERT INTO partner_payout_accounts (
    partner_id, razorpay_account_id, razorpay_stakeholder_id,
    razorpay_product_id, status, note, bank_last4, ifsc, beneficiary_name
)
SELECT
    id, razorpay_account_id, razorpay_stakeholder_id,
    razorpay_product_id, COALESCE(payout_account_status, 'NOT_SET'),
    payout_account_note, payout_bank_last4, payout_ifsc,
    payout_beneficiary_name
FROM partners
WHERE razorpay_account_id IS NOT NULL
   OR payout_bank_last4 IS NOT NULL
   OR COALESCE(payout_account_status, 'NOT_SET') <> 'NOT_SET'
ON CONFLICT (partner_id) DO NOTHING;

INSERT INTO booking_payouts (
    booking_id, status, razorpay_transfer_id, error,
    sent_at, settled_at, utr
)
SELECT
    booking_id, payout_status, razorpay_transfer_id, payout_error,
    payout_sent_at, payout_settled_at, payout_utr
FROM booking_details
WHERE payout_status IS NOT NULL
ON CONFLICT (booking_id) DO NOTHING;
"""

CHECKS = {
    "payout accounts": (
        """SELECT count(*) FROM partners
           WHERE razorpay_account_id IS NOT NULL
              OR payout_bank_last4 IS NOT NULL
              OR COALESCE(payout_account_status, 'NOT_SET') <> 'NOT_SET'""",
        "SELECT count(*) FROM partner_payout_accounts",
    ),
    "booking payouts": (
        "SELECT count(*) FROM booking_details WHERE payout_status IS NOT NULL",
        "SELECT count(*) FROM booking_payouts",
    ),
    # Dropping reviews.user_id/partner_id is only safe if the booking agrees
    "reviews that disagree with their booking": (
        "SELECT 0",
        """SELECT count(*) FROM reviews r JOIN bookings b ON b.id = r.booking_id
           WHERE r.user_id <> b.user_id OR r.partner_id <> b.partner_id""",
    ),
}

DROP_COLUMNS = """
ALTER TABLE partners
    DROP COLUMN IF EXISTS rating,
    DROP COLUMN IF EXISTS reviews_count,
    DROP COLUMN IF EXISTS completion_rate,
    DROP COLUMN IF EXISTS razorpay_account_id,
    DROP COLUMN IF EXISTS razorpay_stakeholder_id,
    DROP COLUMN IF EXISTS razorpay_product_id,
    DROP COLUMN IF EXISTS payout_account_status,
    DROP COLUMN IF EXISTS payout_account_note,
    DROP COLUMN IF EXISTS payout_bank_last4,
    DROP COLUMN IF EXISTS payout_ifsc,
    DROP COLUMN IF EXISTS payout_beneficiary_name;

ALTER TABLE booking_details
    DROP COLUMN IF EXISTS payout_status,
    DROP COLUMN IF EXISTS razorpay_transfer_id,
    DROP COLUMN IF EXISTS payout_error,
    DROP COLUMN IF EXISTS payout_sent_at,
    DROP COLUMN IF EXISTS payout_settled_at,
    DROP COLUMN IF EXISTS payout_utr;

ALTER TABLE reviews
    DROP COLUMN IF EXISTS user_id,
    DROP COLUMN IF EXISTS partner_id;

ALTER TABLE bookings DROP COLUMN IF EXISTS notes;

ALTER TABLE users DROP COLUMN IF EXISTS upi_id;
"""

INDEXES = """
-- users.firebase_uid already has a unique index
DROP INDEX IF EXISTS idx_users_firebase_uid;

CREATE INDEX IF NOT EXISTS ix_bookings_partner_id ON bookings (partner_id);
CREATE INDEX IF NOT EXISTS ix_bookings_user_id ON bookings (user_id);
CREATE INDEX IF NOT EXISTS ix_bookings_service_id ON bookings (service_id);
CREATE INDEX IF NOT EXISTS ix_reviews_booking_id ON reviews (booking_id);
CREATE INDEX IF NOT EXISTS ix_partner_services_partner_id ON partner_services (partner_id);
CREATE INDEX IF NOT EXISTS ix_partner_services_service_id ON partner_services (service_id);
CREATE INDEX IF NOT EXISTS ix_emergency_requests_user_id ON emergency_requests (user_id);
"""


def table_exists_with_column(connection, table, column):
    return connection.execute(text(
        """SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = :table AND column_name = :column"""
    ), {"table": table, "column": column}).first() is not None


def backup(connection) -> Path:
    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"before_001_{datetime.now():%Y%m%d_%H%M%S}.json"

    data = {
        table: [
            dict(row._mapping)
            for row in connection.execute(text(f'SELECT * FROM "{table}"'))
        ]
        for table in BACKED_UP_TABLES
    }

    path.write_text(json.dumps(data, default=str, indent=1), encoding="utf-8")
    return path


def main():
    with engine.begin() as connection:
        if not table_exists_with_column(connection, "partners", "payout_account_status"):
            print("Already migrated; nothing to do.")
            return

        path = backup(connection)
        print(f"Backup saved to {path}")

        connection.execute(text(CREATE_TABLES))
        connection.execute(text(COPY_DATA))

        for name, (expected_sql, actual_sql) in CHECKS.items():
            expected = connection.execute(text(expected_sql)).scalar()
            actual = connection.execute(text(actual_sql)).scalar()
            print(f"  {name}: expected {expected}, got {actual}")

            if expected != actual:
                # Leaving the with-block by exception rolls everything back
                raise SystemExit(f"Check failed for {name}; nothing was changed.")

        connection.execute(text(DROP_COLUMNS))
        connection.execute(text(INDEXES))

    print("Migration complete.")


if __name__ == "__main__":
    main()
