from app.database import SessionLocal
from app.models.service import Service
from app.service_catalog import sync_service_catalog


# The backend also does this on startup; it only writes the catalog
# once, so later staff edits in the database are kept
if __name__ == "__main__":
    with SessionLocal() as db:
        sync_service_catalog(db)

        print("Service catalog is in place:")

        for service in (
            db.query(Service)
            .filter(Service.is_active == True)
            .order_by(Service.sort_order, Service.title)
        ):
            print(f"  {service.sort_order}. {service.title}")
