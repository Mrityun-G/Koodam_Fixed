import uuid

from app.database import SessionLocal
from app.models.service import Service


SERVICES = [
    {
        "title": "Plumber",
        "description": "Professional plumbing and pipe repair services",
        "category": "Plumbing",
        "price": 399.0,
        "duration_minutes": 60,
        "tag": "Plumbing",
    },
    {
        "title": "Electrician",
        "description": "Electrical installation, repair and maintenance",
        "category": "Electrical",
        "price": 449.0,
        "duration_minutes": 60,
        "tag": "Electrical",
    },
    {
        "title": "AC Repair",
        "description": "Air conditioner inspection, servicing and repair",
        "category": "AC Repair",
        "price": 599.0,
        "duration_minutes": 90,
        "tag": "AC",
    },
    {
        "title": "Home Cleaning",
        "description": "Professional home cleaning service",
        "category": "Cleaning",
        "price": 499.0,
        "duration_minutes": 120,
        "tag": "Cleaning",
    },
    {
        "title": "Carpenter",
        "description": "Furniture repair and carpentry services",
        "category": "Carpentry",
        "price": 449.0,
        "duration_minutes": 90,
        "tag": "Carpentry",
    },
    {
        "title": "Painting",
        "description": "Interior and exterior painting services",
        "category": "Painting",
        "price": 799.0,
        "duration_minutes": 180,
        "tag": "Painting",
    },
    {
        "title": "Appliance Repair",
        "description": "Repair and maintenance of household appliances",
        "category": "Appliance Repair",
        "price": 499.0,
        "duration_minutes": 90,
        "tag": "Appliance",
    },
    {
        "title": "Pest Control",
        "description": "Professional pest inspection and treatment",
        "category": "Pest Control",
        "price": 699.0,
        "duration_minutes": 120,
        "tag": "Pest",
    },
]


def seed_services():
    db = SessionLocal()

    try:
        for service_data in SERVICES:

            existing = (
                db.query(Service)
                .filter(
                    Service.title == service_data["title"]
                )
                .first()
            )

            if existing:
                existing.description = service_data["description"]
                existing.category = service_data["category"]
                existing.price = service_data["price"]
                existing.duration_minutes = service_data["duration_minutes"]
                existing.tag = service_data["tag"]
                existing.is_active = True

                print(
                    f"Updated: {service_data['title']}"
                )

            else:
                service = Service(
                    id=uuid.uuid4(),
                    title=service_data["title"],
                    description=service_data["description"],
                    category=service_data["category"],
                    price=service_data["price"],
                    duration_minutes=service_data["duration_minutes"],
                    tag=service_data["tag"],
                    is_active=True
                )

                db.add(service)

                print(
                    f"Created: {service_data['title']}"
                )

        db.commit()

        print("\nService seeding completed successfully.")

    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}")

    finally:
        db.close()


if __name__ == "__main__":
    seed_services()