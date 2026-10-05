import re
from typing import Optional


# =========================================================
# SPOKEN ANSWERS -> KEYS
# Callers can say their choice instead of pressing it: "three",
# "English", "Plumbing", "six zero zero one one nine", "yes". The phone
# provider turns speech into text; this turns that text into the keys the
# menu expects, so the menu itself only ever deals with keys.
# Number words cover English, Tamil and Kannada, in Latin letters and in
# their own scripts (the speech service writes Tamil and Kannada in
# script).
# =========================================================

NUMBER_WORDS = {
    "0": [
        "zero", "oh", "poojyam", "pujyam", "saivar", "sonne",
        "பூஜ்ஜியம்", "பூஜ்யம்", "ஜீரோ", "ಸೊನ್ನೆ", "ಶೂನ್ಯ", "ಜೀರೋ",
    ],
    "1": [
        "one", "won", "onnu", "ondru", "onru", "ondu",
        "ஒன்று", "ஒன்னு", "ஒண்ணு", "ಒಂದು",
    ],
    "2": [
        "two", "rendu", "irandu", "eradu",
        "இரண்டு", "ரெண்டு", "ಎರಡು",
    ],
    "3": [
        "three", "tree", "moonu", "moondru", "munru", "mooru",
        "மூன்று", "மூணு", "ಮೂರು",
    ],
    "4": [
        "four", "naalu", "nangu", "naalku",
        "நான்கு", "நாலு", "ನಾಲ್ಕು",
    ],
    "5": [
        "five", "anju", "aindhu", "aidu",
        "ஐந்து", "அஞ்சு", "ಐದು",
    ],
    "6": [
        "six", "aaru",
        "ஆறு", "ಆರು",
    ],
    "7": [
        "seven", "ezhu", "elu",
        "ஏழு", "ಏಳು",
    ],
    "8": [
        "eight", "ettu", "entu",
        "எட்டு", "ಎಂಟು",
    ],
    "9": [
        "nine", "ombodhu", "onbathu", "onpathu", "ombattu",
        "ஒன்பது", "ಒಂಬತ್ತು",
    ],
}

WORD_TO_DIGIT = {word: digit for digit, words in NUMBER_WORDS.items() for word in words}

# The language menu, by key (position in prompts.LANGUAGES)
LANGUAGE_CHOICES = {
    "tamil": "1", "தமிழ்": "1", "ತಮಿಳು": "1",
    "kannada": "2", "கன்னடம்": "2", "ಕನ್ನಡ": "2",
    "english": "3", "ஆங்கிலம்": "3", "இங்கிலீஷ்": "3", "ಇಂಗ್ಲಿಷ್": "3",
}

# "Press 1 to book / approve, 2 to cancel / decline"
YES_NO_CHOICES = {
    "yes": "1", "yeah": "1", "ok": "1", "okay": "1", "book": "1",
    "confirm": "1", "approve": "1", "sure": "1",
    "aam": "1", "sari": "1", "haudu": "1",
    "ஆம்": "1", "ஆமா": "1", "சரி": "1", "ಹೌದು": "1", "ಸರಿ": "1",
    "no": "2", "cancel": "2", "decline": "2", "vendam": "2", "beda": "2",
    "இல்லை": "2", "வேண்டாம்": "2", "ಇಲ್ಲ": "2", "ಬೇಡ": "2",
}

# Speech service language codes, by prompt language
SPEECH_LANGUAGES = {"en": "en-IN", "ta": "ta-IN", "kn": "kn-IN"}


def _words(text: str) -> list:
    # Split on spaces and punctuation only: Tamil and Kannada vowel signs
    # aren't "word" characters to a regex, so \w+ would break words apart
    return [w for w in re.split(r"[\s,.!?;:()\"'\-]+", text.lower()) if w]


def _digit_for(word: str) -> Optional[str]:
    if word in WORD_TO_DIGIT:
        return WORD_TO_DIGIT[word]

    # Tamil and Kannada add endings ("மூன்றை"); match on the start
    for known, digit in WORD_TO_DIGIT.items():
        if len(known) >= 3 and not known.isascii() and word.startswith(known):
            return digit

    return None


def speech_to_digits(text: str, expected: int, choices: Optional[dict] = None) -> Optional[str]:
    """
    The keys the caller meant, or None if it couldn't be understood.
    expected is how many keys the menu wants (1 for a choice, 6 for a
    pincode); choices maps words said on this menu (e.g. a service name)
    to their keys.
    """
    if not text or not expected:
        return None

    spoken = " ".join(_words(text))

    # A named choice: longest first, so "ac repair" beats "repair"
    for phrase in sorted(choices or {}, key=len, reverse=True):
        if phrase and phrase.lower() in spoken:
            return choices[phrase]

    digits = ""

    for word in _words(text):
        # "Oh, ..." starts many answers; only count it inside a number
        if word == "oh" and expected == 1:
            continue

        if word.isdigit():
            digits += word
        else:
            digit = _digit_for(word)
            if digit:
                digits += digit

    if expected == 1:
        return digits[:1] or None

    # A pincode must come out exactly right
    return digits if len(digits) == expected else None
