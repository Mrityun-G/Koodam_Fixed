"""
The starting catalog of services partners offer and customers book (one
tile each on the customer Home screen). Written to the services table
once; after that staff add and edit services through the API
(POST / PATCH /services/) and this file is no longer read.

Older catalogs had trade names ("Plumber", "Pest Control"). The first
legacy title of a tile is renamed in place, so its partner links and
past bookings carry over; any further legacy services are folded into
the tile and switched off.

Tiles marked "added_later" came after the first catalog was written.
Each is added to an existing database once (remembered in app_config),
so a tile staff later rename or switch off isn't brought back.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.app_config import AppConfig
from app.models.partner_service import PartnerService
from app.models.service import Service


# app_config key listing the "added_later" tiles already added
ADDED_TILES_KEY = "catalog_tiles_added"

# app_config key listing the tiles already switched off below
RETIRED_TILES_KEY = "catalog_tiles_retired"

# Tiles that were added to the catalog and then dropped. Taking them out
# of CATALOG isn't enough: add_later_tiles has already written them to
# every database that started up while they were listed, so they keep
# appearing on Home. Each title here is switched off once, then
# remembered, so staff can turn it back on later without it being
# switched off again on the next restart.
RETIRED_TILES = [
    "Flex & Banner Printing",
    "Printouts & Xerox",
    "Online Document Help",
]


CATALOG = [
    {
        "title": "Cleaning & Sanitize",
        "icon": "cleaning_services",
        "bg_color": "#d3e4fe",
        "icon_color": "#a14000",
        "sort_order": 1,
        "description": "Home deep cleaning, sanitizing and pest control",
        "price": 499.0,
        "duration_minutes": 120,
        "tag": "Cleaning",
        "legacy_titles": ["Home Cleaning", "Pest Control"],
    },
    {
        "title": "Electrical Works",
        "icon": "bolt",
        "bg_color": "#ffdbcc",
        "icon_color": "#a14000",
        "sort_order": 2,
        "description": "Wiring, switches, lights, fans and electrical repairs",
        "price": 449.0,
        "duration_minutes": 60,
        "tag": "Electrical",
        "legacy_titles": ["Electrician"],
    },
    {
        "title": "Plumbing & Repair",
        "icon": "plumbing",
        "bg_color": "#dce1ff",
        "icon_color": "#4e5c92",
        "sort_order": 3,
        "description": "Leaks, taps, pipes, drains and bathroom fittings",
        "price": 399.0,
        "duration_minutes": 60,
        "tag": "Plumbing",
        "legacy_titles": ["Plumber"],
    },
    {
        "title": "AC & Appliance",
        "icon": "mode_fan",
        "bg_color": "#6ffbbe",
        "icon_color": "#006c49",
        "sort_order": 4,
        "description": "AC servicing and repair of fridges, washing machines and more",
        "price": 599.0,
        "duration_minutes": 90,
        "tag": "AC",
        "legacy_titles": ["AC Repair", "Appliance Repair"],
    },
    {
        "title": "Carpentry & Decor",
        "icon": "carpenter",
        "bg_color": "#e5eeff",
        "icon_color": "#5a4136",
        "sort_order": 5,
        "description": "Furniture repair, doors, locks and woodwork",
        "price": 449.0,
        "duration_minutes": 90,
        "tag": "Carpentry",
        "legacy_titles": ["Carpenter"],
    },
    {
        "title": "Painting & Decor",
        "icon": "format_paint",
        "bg_color": "#d3e4fe",
        "icon_color": "#a14000",
        "sort_order": 6,
        "description": "Interior and exterior painting and wall finishing",
        "price": 799.0,
        "duration_minutes": 180,
        "tag": "Painting",
        "legacy_titles": ["Painting"],
    },
    {
        "title": "Tech & Wi-Fi",
        "icon": "router",
        "bg_color": "#dce1ff",
        "icon_color": "#4e5c92",
        "sort_order": 7,
        "description": "Wi-Fi, router, TV, CCTV and computer setup and repair",
        "price": 399.0,
        "duration_minutes": 60,
        "tag": "Tech",
        "legacy_titles": ["Wi-Fi & Tech Support"],
    },
    {
        "title": "Elder & Pets",
        "icon": "volunteer_activism",
        "bg_color": "#6ffbbe",
        "icon_color": "#006c49",
        "sort_order": 8,
        "description": "Elderly companion care, pet sitting, walking and grooming",
        "price": 499.0,
        "duration_minutes": 120,
        "tag": "Care",
        "legacy_titles": ["Elder & Pet Care"],
    },
    {
        # Booked by the hour, e.g. by a parent working late, for a
        # school-age child at home
        "title": "Child Care",
        "icon": "child_care",
        "bg_color": "#ffdbcc",
        "icon_color": "#a14000",
        "sort_order": 9,
        "description": "Police-verified babysitting at home, school pickup and evening care",
        "price": 199.0,
        "duration_minutes": 60,
        "tag": "Care",
        "requires_police_verification": True,
        "legacy_titles": [],
        "added_later": True,
    },
]


def _fold_into(db: Session, old: Service, tile: Service) -> None:
    """Move partners from a retired service onto its tile."""
    offered = {
        row.partner_id
        for row in db.query(PartnerService.partner_id).filter(
            PartnerService.service_id == tile.id
        )
    }

    for link in db.query(PartnerService).filter(
        PartnerService.service_id == old.id
    ):
        if link.partner_id in offered:
            # Already offers the tile; keep that listing only
            link.is_active = False
        else:
            link.service_id = tile.id
            offered.add(link.partner_id)

    old.is_active = False


def retire_tiles(db: Session) -> None:
    """Switch off a dropped tile once, and stop listing its partners."""
    marker = db.get(AppConfig, RETIRED_TILES_KEY)
    retired = list(marker.value) if marker else []

    for title in RETIRED_TILES:
        if title in retired:
            continue

        tile = db.query(Service).filter(Service.title == title).first()

        if tile:
            tile.is_active = False

            # Nobody should stay listed for a tile that isn't bookable
            for link in db.query(PartnerService).filter(
                PartnerService.service_id == tile.id
            ):
                link.is_active = False

        # Remembered whether or not the tile was there, so a database
        # that never had it doesn't get checked again every restart
        retired.append(title)

    if marker:
        marker.value = retired
    else:
        db.add(AppConfig(key=RETIRED_TILES_KEY, value=retired))

    db.commit()


def add_later_tiles(db: Session) -> None:
    marker = db.get(AppConfig, ADDED_TILES_KEY)
    added = list(marker.value) if marker else []

    for entry in CATALOG:
        title = entry["title"]

        if not entry.get("added_later") or title in added:
            continue

        exists = db.query(Service.id).filter(Service.title == title).first()

        if not exists:
            db.add(Service(
                id=uuid.uuid4(),
                title=title,
                category=title,
                description=entry["description"],
                price=entry["price"],
                duration_minutes=entry["duration_minutes"],
                tag=entry["tag"],
                icon=entry["icon"],
                bg_color=entry["bg_color"],
                icon_color=entry["icon_color"],
                sort_order=entry["sort_order"],
                requires_police_verification=entry.get(
                    "requires_police_verification", False
                ),
                is_active=True,
            ))

        added.append(title)

    if marker is None:
        db.add(AppConfig(
            key=ADDED_TILES_KEY, value=added, updated_by="default"
        ))
    elif added != marker.value:
        marker.value = added

    db.commit()


def sync_service_catalog(db: Session) -> None:
    # Once any service has a tile icon the catalog has been written, and
    # staff edits (renames, switched-off services) must not be undone
    if db.query(Service.id).filter(Service.icon.isnot(None)).first():
        add_later_tiles(db)
        return

    for entry in CATALOG:
        title = entry["title"]
        legacy = entry["legacy_titles"]

        rows = (
            db.query(Service)
            .filter(Service.title.in_([title, *legacy]))
            .all()
        )
        by_title = {row.title: row for row in rows}

        tile = by_title.get(title)

        if tile is None:
            # Rename the first legacy service that exists
            tile = next(
                (by_title[t] for t in legacy if t in by_title),
                None
            )

        if tile is None:
            tile = Service(
                id=uuid.uuid4(),
                price=entry["price"],
            )
            db.add(tile)

        tile.title = title
        tile.category = title
        tile.description = entry["description"]
        tile.duration_minutes = entry["duration_minutes"]
        tile.tag = entry["tag"]
        tile.icon = entry["icon"]
        tile.bg_color = entry["bg_color"]
        tile.icon_color = entry["icon_color"]
        tile.sort_order = entry["sort_order"]
        tile.requires_police_verification = entry.get(
            "requires_police_verification", False
        )
        tile.is_active = True
        db.flush()

        for row in rows:
            if row.id != tile.id:
                _fold_into(db, row, tile)

    db.commit()

    # A new database already has every tile; just record that
    add_later_tiles(db)

    # Tiles that were added and then dropped linger in databases that
    # started up while they were listed; switch those off
    retire_tiles(db)
