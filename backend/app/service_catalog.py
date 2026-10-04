"""
The starting catalog of services partners offer and customers book (one
tile each on the customer Home screen). Written to the services table
once; after that staff add and edit services through the API
(POST / PATCH /services/) and this file is no longer read.

Older catalogs had trade names ("Plumber", "Pest Control"). The first
legacy title of a tile is renamed in place, so its partner links and
past bookings carry over; any further legacy services are folded into
the tile and switched off.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.partner_service import PartnerService
from app.models.service import Service


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


def sync_service_catalog(db: Session) -> None:
    # Once any service has a tile icon the catalog has been written, and
    # staff edits (renames, switched-off services) must not be undone
    if db.query(Service.id).filter(Service.icon.isnot(None)).first():
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
        tile.is_active = True
        db.flush()

        for row in rows:
            if row.id != tile.id:
                _fold_into(db, row, tile)

    db.commit()
