from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.review import Review
from app.models.booking import Booking
from app.models.user import User
from app.models.partner import Partner
from app.schemas.review import ReviewCreate, ReviewResponse


router = APIRouter(
    prefix="/reviews",
    tags=["Reviews"]
)


@router.post("/", response_model=ReviewResponse)
def create_review(
    review_data: ReviewCreate,
    db: Session = Depends(get_db)
):

    # Check booking
    booking = db.query(Booking).filter(
        Booking.id == review_data.booking_id
    ).first()

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found"
        )

    # Check user
    user = db.query(User).filter(
        User.id == review_data.user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Check partner
    partner = db.query(Partner).filter(
        Partner.id == review_data.partner_id
    ).first()

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    # Make sure booking belongs to this user and partner
    if booking.user_id != review_data.user_id:
        raise HTTPException(
            status_code=400,
            detail="Booking does not belong to this user"
        )

    if booking.partner_id != review_data.partner_id:
        raise HTTPException(
            status_code=400,
            detail="Booking does not belong to this partner"
        )

    # Review only after booking is completed
    if booking.status != "COMPLETED":
        raise HTTPException(
            status_code=400,
            detail="Review can only be added after booking is completed"
        )

    # Prevent duplicate review
    existing_review = db.query(Review).filter(
        Review.booking_id == review_data.booking_id
    ).first()

    if existing_review:
        raise HTTPException(
            status_code=400,
            detail="This booking has already been reviewed"
        )

    # Create review
    new_review = Review(
        booking_id=review_data.booking_id,
        user_id=review_data.user_id,
        partner_id=review_data.partner_id,
        rating=review_data.rating,
        feedback=review_data.feedback
    )

    db.add(new_review)

    # Update partner rating
    total_reviews = partner.reviews_count + 1

    new_rating = (
        (partner.rating * partner.reviews_count)
        + review_data.rating
    ) / total_reviews

    partner.rating = new_rating
    partner.reviews_count = total_reviews

    db.commit()
    db.refresh(new_review)

    return new_review


@router.get("/", response_model=list[ReviewResponse])
def get_reviews(
    db: Session = Depends(get_db)
):
    return db.query(Review).order_by(
        Review.created_at.desc()
    ).all()


@router.get("/partner/{partner_id}", response_model=list[ReviewResponse])
def get_partner_reviews(
    partner_id: UUID,
    db: Session = Depends(get_db)
):

    partner = db.query(Partner).filter(
        Partner.id == partner_id
    ).first()

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    return db.query(Review).filter(
        Review.partner_id == partner_id
    ).order_by(
        Review.created_at.desc()
    ).all()