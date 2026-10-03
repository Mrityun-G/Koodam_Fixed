# Everything the phone menu says, in English (en), Tamil (ta) and Kannada (kn).
# Placeholders in {braces} are filled in by say().

LANGUAGES = ("ta", "kn", "en")

# Said before a language is chosen, so each part in its own voice.
# The digit for each language is its position in LANGUAGES.
CHOOSE_LANGUAGE = [
    ("ta", "கூடம். தமிழுக்கு 1 அழுத்தவும்."),
    ("kn", "ಕನ್ನಡಕ್ಕಾಗಿ 2 ಒತ್ತಿರಿ."),
    ("en", "For English, press 3."),
]

PROMPTS = {
    "welcome": {
        "en": "Welcome to KOODAM.",
        "ta": "கூடத்திற்கு வரவேற்கிறோம்.",
        "kn": "ಕೂಡಮ್‌ಗೆ ಸ್ವಾಗತ.",
    },
    "invalid": {
        "en": "Sorry, that is not an option.",
        "ta": "மன்னிக்கவும், அது சரியான தேர்வு அல்ல.",
        "kn": "ಕ್ಷಮಿಸಿ, ಅದು ಸರಿಯಾದ ಆಯ್ಕೆ ಅಲ್ಲ.",
    },
    "goodbye": {
        "en": "Thank you for calling KOODAM. Goodbye.",
        "ta": "கூடத்தை அழைத்ததற்கு நன்றி. வணக்கம்.",
        "kn": "ಕೂಡಮ್‌ಗೆ ಕರೆ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ. ನಮಸ್ಕಾರ.",
    },
    "unavailable": {
        "en": "Phone booking is not available right now. Please try again later.",
        "ta": "தொலைபேசி முன்பதிவு இப்போது கிடைக்கவில்லை. பிறகு முயற்சிக்கவும்.",
        "kn": "ಫೋನ್ ಬುಕಿಂಗ್ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
    },

    # --- New booking ---
    "service_option": {
        "en": "For {service}, press {digit}.",
        "ta": "{service} சேவைக்கு {digit} அழுத்தவும்.",
        "kn": "{service} ಸೇವೆಗಾಗಿ {digit} ಒತ್ತಿರಿ.",
    },
    "no_services": {
        "en": "Sorry, no services are available right now.",
        "ta": "மன்னிக்கவும், இப்போது எந்தச் சேவையும் கிடைக்கவில்லை.",
        "kn": "ಕ್ಷಮಿಸಿ, ಈಗ ಯಾವುದೇ ಸೇವೆ ಲಭ್ಯವಿಲ್ಲ.",
    },
    "ask_pincode": {
        "en": "Please enter your 6 digit area pincode.",
        "ta": "உங்கள் பகுதியின் 6 இலக்க அஞ்சல் குறியீட்டை உள்ளிடவும்.",
        "kn": "ನಿಮ್ಮ ಪ್ರದೇಶದ 6 ಅಂಕಿಯ ಪಿನ್‌ಕೋಡ್ ನಮೂದಿಸಿ.",
    },
    "bad_pincode": {
        "en": "Sorry, we could not find that pincode.",
        "ta": "மன்னிக்கவும், அந்த அஞ்சல் குறியீட்டைக் கண்டுபிடிக்க முடியவில்லை.",
        "kn": "ಕ್ಷಮಿಸಿ, ಆ ಪಿನ್‌ಕೋಡ್ ಸಿಗಲಿಲ್ಲ.",
    },
    "no_partner": {
        "en": "Sorry, no serviceman is available near you for this service right now. Please call again later.",
        "ta": "மன்னிக்கவும், இந்தச் சேவைக்கு உங்கள் அருகில் இப்போது பணியாளர் இல்லை. பிறகு அழைக்கவும்.",
        "kn": "ಕ್ಷಮಿಸಿ, ಈ ಸೇವೆಗೆ ನಿಮ್ಮ ಹತ್ತಿರ ಈಗ ಯಾವುದೇ ಸೇವಕರು ಲಭ್ಯವಿಲ್ಲ. ನಂತರ ಕರೆ ಮಾಡಿ.",
    },
    "offer": {
        "en": "{partner} is {km} kilometres away. {service} costs {price} rupees, plus {fee} rupees trust fee. Total {total} rupees, paid in cash after the work. Press 1 to book. Press 2 to cancel.",
        "ta": "{partner} {km} கிலோமீட்டர் தொலைவில் உள்ளார். {service} கட்டணம் {price} ரூபாய், நம்பிக்கைக் கட்டணம் {fee} ரூபாய். மொத்தம் {total} ரூபாய், வேலை முடிந்ததும் பணமாகச் செலுத்தவும். முன்பதிவு செய்ய 1 அழுத்தவும். ரத்து செய்ய 2 அழுத்தவும்.",
        "kn": "{partner} {km} ಕಿಲೋಮೀಟರ್ ದೂರದಲ್ಲಿದ್ದಾರೆ. {service} ಶುಲ್ಕ {price} ರೂಪಾಯಿ, ಟ್ರಸ್ಟ್ ಶುಲ್ಕ {fee} ರೂಪಾಯಿ. ಒಟ್ಟು {total} ರೂಪಾಯಿ, ಕೆಲಸದ ನಂತರ ನಗದು ಪಾವತಿಸಿ. ಬುಕ್ ಮಾಡಲು 1 ಒತ್ತಿರಿ. ರದ್ದು ಮಾಡಲು 2 ಒತ್ತಿರಿ.",
    },
    "booked": {
        "en": "Your request is sent to {partner}. Your safety code is {code}. Again, {code}. Give this code to the serviceman only when they reach your home. They will call you for your exact address.",
        "ta": "உங்கள் கோரிக்கை {partner}-க்கு அனுப்பப்பட்டது. உங்கள் பாதுகாப்புக் குறியீடு {code}. மீண்டும், {code}. பணியாளர் உங்கள் வீட்டிற்கு வந்த பிறகே இந்தக் குறியீட்டைக் கொடுக்கவும். சரியான முகவரிக்கு அவர் உங்களை அழைப்பார்.",
        "kn": "ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು {partner} ಅವರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಸುರಕ್ಷತಾ ಕೋಡ್ {code}. ಮತ್ತೊಮ್ಮೆ, {code}. ಸೇವಕರು ನಿಮ್ಮ ಮನೆಗೆ ಬಂದ ನಂತರ ಮಾತ್ರ ಈ ಕೋಡ್ ನೀಡಿ. ನಿಖರ ವಿಳಾಸಕ್ಕಾಗಿ ಅವರು ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ.",
    },
    "cancelled": {
        "en": "Okay, nothing was booked.",
        "ta": "சரி, எதுவும் முன்பதிவு செய்யப்படவில்லை.",
        "kn": "ಸರಿ, ಏನೂ ಬುಕ್ ಆಗಿಲ್ಲ.",
    },

    # --- Status of the caller's booking ---
    "status_pending": {
        "en": "Your {service} request is waiting for {partner} to accept.",
        "ta": "உங்கள் {service} கோரிக்கையை {partner} ஏற்கக் காத்திருக்கிறது.",
        "kn": "ನಿಮ್ಮ {service} ವಿನಂತಿಯನ್ನು {partner} ಸ್ವೀಕರಿಸಲು ಕಾಯಲಾಗುತ್ತಿದೆ.",
    },
    "status_not_accepted": {
        "en": "{partner} could not take your {service} request.",
        "ta": "{partner} உங்கள் {service} கோரிக்கையை ஏற்க முடியவில்லை.",
        "kn": "{partner} ನಿಮ್ಮ {service} ವಿನಂತಿಯನ್ನು ಸ್ವೀಕರಿಸಲಾಗಲಿಲ್ಲ.",
    },
    "status_on_way": {
        "en": "{partner} accepted and is coming for your {service}. Your safety code is {code}. Again, {code}.",
        "ta": "{partner} ஏற்றுக்கொண்டு உங்கள் {service} சேவைக்கு வருகிறார். உங்கள் பாதுகாப்புக் குறியீடு {code}. மீண்டும், {code}.",
        "kn": "{partner} ಸ್ವೀಕರಿಸಿ ನಿಮ್ಮ {service} ಸೇವೆಗೆ ಬರುತ್ತಿದ್ದಾರೆ. ನಿಮ್ಮ ಸುರಕ್ಷತಾ ಕೋಡ್ {code}. ಮತ್ತೊಮ್ಮೆ, {code}.",
    },
    "status_working": {
        "en": "{partner} is working on your {service}. The bill so far is {total} rupees.",
        "ta": "{partner} உங்கள் {service} வேலையைச் செய்து வருகிறார். இதுவரை பில் {total} ரூபாய்.",
        "kn": "{partner} ನಿಮ್ಮ {service} ಕೆಲಸ ಮಾಡುತ್ತಿದ್ದಾರೆ. ಈವರೆಗಿನ ಬಿಲ್ {total} ರೂಪಾಯಿ.",
    },
    "status_done": {
        "en": "Your {service} is complete. You paid {total} rupees in cash.",
        "ta": "உங்கள் {service} முடிந்தது. நீங்கள் {total} ரூபாய் பணமாகச் செலுத்தினீர்கள்.",
        "kn": "ನಿಮ್ಮ {service} ಪೂರ್ಣಗೊಂಡಿದೆ. ನೀವು {total} ರೂಪಾಯಿ ನಗದು ಪಾವತಿಸಿದ್ದೀರಿ.",
    },
    "extra_charge": {
        "en": "{partner} needs {item} for {amount} rupees. Press 1 to approve. Press 2 to decline.",
        "ta": "{partner}-க்கு {item} தேவை, {amount} ரூபாய். ஏற்க 1 அழுத்தவும். மறுக்க 2 அழுத்தவும்.",
        "kn": "{partner} ಅವರಿಗೆ {item} ಬೇಕು, {amount} ರೂಪಾಯಿ. ಅನುಮೋದಿಸಲು 1 ಒತ್ತಿರಿ. ತಿರಸ್ಕರಿಸಲು 2 ಒತ್ತಿರಿ.",
    },
    "extra_approved": {
        "en": "Approved. Your new total is {total} rupees.",
        "ta": "ஏற்கப்பட்டது. உங்கள் புதிய மொத்தம் {total} ரூபாய்.",
        "kn": "ಅನುಮೋದಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಹೊಸ ಒಟ್ಟು {total} ರೂಪಾಯಿ.",
    },
    "extra_declined": {
        "en": "Declined. It will not be added to your bill.",
        "ta": "மறுக்கப்பட்டது. இது உங்கள் பில்லில் சேர்க்கப்படாது.",
        "kn": "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. ಇದು ನಿಮ್ಮ ಬಿಲ್‌ಗೆ ಸೇರುವುದಿಲ್ಲ.",
    },
    "ask_rating": {
        "en": "How was the service? Press 1 to 5, where 5 is the best.",
        "ta": "சேவை எப்படி இருந்தது? 1 முதல் 5 வரை அழுத்தவும், 5 மிகச் சிறந்தது.",
        "kn": "ಸೇವೆ ಹೇಗಿತ್ತು? 1 ರಿಂದ 5 ಒತ್ತಿರಿ, 5 ಅತ್ಯುತ್ತಮ.",
    },
    "rated": {
        "en": "Thank you for your rating.",
        "ta": "உங்கள் மதிப்பீட்டிற்கு நன்றி.",
        "kn": "ನಿಮ್ಮ ರೇಟಿಂಗ್‌ಗೆ ಧನ್ಯವಾದ.",
    },

    # --- Menus after the status ---
    "menu_check_again": {
        "en": "Press 1 to check again.",
        "ta": "மீண்டும் சரிபார்க்க 1 அழுத்தவும்.",
        "kn": "ಮತ್ತೆ ಪರಿಶೀಲಿಸಲು 1 ಒತ್ತಿರಿ.",
    },
    "menu_retry": {
        "en": "Press 1 to send it to another serviceman.",
        "ta": "வேறொரு பணியாளருக்கு அனுப்ப 1 அழுத்தவும்.",
        "kn": "ಬೇರೆ ಸೇವಕರಿಗೆ ಕಳುಹಿಸಲು 1 ಒತ್ತಿರಿ.",
    },
    "menu_repeat": {
        "en": "Press 1 to hear this again.",
        "ta": "மீண்டும் கேட்க 1 அழுத்தவும்.",
        "kn": "ಮತ್ತೆ ಕೇಳಲು 1 ಒತ್ತಿರಿ.",
    },
    "menu_cancel_request": {
        "en": "Press 9 to cancel this request.",
        "ta": "இந்தக் கோரிக்கையை ரத்து செய்ய 9 அழுத்தவும்.",
        "kn": "ಈ ವಿನಂತಿಯನ್ನು ರದ್ದು ಮಾಡಲು 9 ಒತ್ತಿರಿ.",
    },
    "menu_complaint": {
        "en": "Press 8 to report a problem.",
        "ta": "பிரச்சினையைப் புகாரளிக்க 8 அழுத்தவும்.",
        "kn": "ಸಮಸ್ಯೆ ವರದಿ ಮಾಡಲು 8 ಒತ್ತಿರಿ.",
    },
    "menu_new_booking": {
        "en": "Press 0 for a new booking.",
        "ta": "புதிய முன்பதிவுக்கு 0 அழுத்தவும்.",
        "kn": "ಹೊಸ ಬುಕಿಂಗ್‌ಗಾಗಿ 0 ಒತ್ತಿರಿ.",
    },
    "request_cancelled": {
        "en": "Your request is cancelled.",
        "ta": "உங்கள் கோரிக்கை ரத்து செய்யப்பட்டது.",
        "kn": "ನಿಮ್ಮ ವಿನಂತಿ ರದ್ದಾಗಿದೆ.",
    },

    # --- Complaints ---
    "complaint_reasons": {
        "en": "What went wrong? Press 1 if the serviceman did not come. 2 if they were very late. 3 for poor or unfinished work. 4 if you were charged more than agreed. 5 for rude or unsafe behaviour.",
        "ta": "என்ன தவறு நடந்தது? பணியாளர் வரவில்லை என்றால் 1. மிகவும் தாமதம் என்றால் 2. மோசமான அல்லது முடிக்கப்படாத வேலைக்கு 3. ஒப்புக்கொண்டதை விட அதிகக் கட்டணத்திற்கு 4. மரியாதையற்ற அல்லது பாதுகாப்பற்ற நடத்தைக்கு 5.",
        "kn": "ಏನು ತಪ್ಪಾಯಿತು? ಸೇವಕರು ಬರದಿದ್ದರೆ 1. ತುಂಬಾ ತಡವಾದರೆ 2. ಕಳಪೆ ಅಥವಾ ಅಪೂರ್ಣ ಕೆಲಸಕ್ಕೆ 3. ಒಪ್ಪಿದ್ದಕ್ಕಿಂತ ಹೆಚ್ಚು ಶುಲ್ಕಕ್ಕೆ 4. ಅಸಭ್ಯ ಅಥವಾ ಅಸುರಕ್ಷಿತ ವರ್ತನೆಗೆ 5.",
    },
    "complaint_saved": {
        "en": "Your complaint is registered. KOODAM will review it.",
        "ta": "உங்கள் புகார் பதிவு செய்யப்பட்டது. கூடம் அதை ஆய்வு செய்யும்.",
        "kn": "ನಿಮ್ಮ ದೂರು ದಾಖಲಾಗಿದೆ. ಕೂಡಮ್ ಅದನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    },
    "complaint_exists": {
        "en": "You have already reported a problem with this job. KOODAM is reviewing it.",
        "ta": "இந்த வேலை குறித்து நீங்கள் ஏற்கனவே புகாரளித்துள்ளீர்கள். கூடம் ஆய்வு செய்கிறது.",
        "kn": "ಈ ಕೆಲಸದ ಬಗ್ಗೆ ನೀವು ಈಗಾಗಲೇ ದೂರು ನೀಡಿದ್ದೀರಿ. ಕೂಡಮ್ ಪರಿಶೀಲಿಸುತ್ತಿದೆ.",
    },
}


def say(key: str, lang: str, **values) -> str:
    text = PROMPTS[key].get(lang) or PROMPTS[key]["en"]
    return text.format(**values)


def spell_digits(code) -> str:
    # "4721" -> "4 7 2 1", so the voice reads digits, not a number
    return " ".join(str(code or ""))


def rupees(amount) -> str:
    value = float(amount or 0)
    return str(int(value)) if value.is_integer() else f"{value:.2f}"
