# pylint: disable=import-error
"""
AI service for classifying internal LEC IT support issues.

IMPORTANT RULES (LECIntelliSupport):
- Categories MUST be ONLY: HARDWARE, SOFTWARE, NETWORK, SECURITY
- Technician assignment must be based on CATEGORY.
  (AI predicts category; assignment selects a technician who handles that category.)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
from typing import List, Optional, Dict, Any
from pathlib import Path
import json
import re

app = FastAPI(title="LEC IntelliSupport AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_DIR = Path(__file__).resolve().parent / "models"
ALLOWED_CATEGORIES = {"HARDWARE", "SOFTWARE", "NETWORK", "SECURITY"}
ALLOWED_PRIORITIES = {"Low", "Medium", "High", "Critical"}
STOPWORDS = {
    "the", "a", "an", "and", "or", "is", "are", "to", "for", "of", "on", "with", "in",
    "my", "me", "it", "this", "that", "i", "you", "we", "our", "can", "cannot", "cant",
    "not", "be", "from", "at", "by", "as", "after", "before", "today", "yesterday",
}
GREETING_TOKENS = {"hi", "hello", "hey", "yo", "hola", "morning", "afternoon", "evening", "greetings"}
COURTESY_TOKENS = {"thanks", "thank", "please", "assist", "help"}
ISSUE_SIGNAL_TOKENS = {
    "printer", "print", "paper", "jam", "offline", "toner", "cartridge",
    "internet", "wifi", "network", "dns", "vpn", "latency", "ip",
    "email", "outlook", "mailbox", "teams", "audio", "microphone", "speaker",
    "password", "reset", "login", "signin", "mfa", "authenticator", "otp",
    "rdp", "remote", "desktop", "drive", "server", "share", "file",
    "software", "install", "update", "browser", "app", "error", "failed",
    "keyboard", "mouse", "monitor", "display", "boot", "crash", "freeze",
    "phishing", "malware", "ransomware", "breach", "unauthorized", "suspicious",
}
KB_PRECISION_TOKENS = {"rdp", "mfa", "vpn", "outlook", "teams", "printer", "dns", "phishing", "bsod"}

KB_PATH = Path(__file__).resolve().parent / "data" / "helpdesk_kb.json"
with KB_PATH.open("r", encoding="utf-8") as kb_file:
    HELPDESK_KB = json.load(kb_file)
INTENTS_PATH = Path(__file__).resolve().parent / "data" / "intents.json"
with INTENTS_PATH.open("r", encoding="utf-8") as intents_file:
    INTENTS_DATA = json.load(intents_file).get("intents", [])

# -------------------------------------------------------------------
# Default technician mapping (fallback ONLY)
# In production, you'll pass technician list from backend.
# -------------------------------------------------------------------
TECHNICIAN_MAPPING = {
    "SOFTWARE": "Lerato Molefe",
    "NETWORK": "Lerato Ndlovu",
    "HARDWARE": "Kabelo Phiri",
    "SECURITY": "Security Specialist",
}
INTENT_CATEGORY_MAP = {
    "computer_not_turning_on": "HARDWARE",
    "slow_computer": "SOFTWARE",
    "printer_issue": "HARDWARE",
    "internet_problem": "NETWORK",
    "email_issue": "SOFTWARE",
    "keyboard_issue": "HARDWARE",
    "mouse_issue": "HARDWARE",
    "software_installation": "SOFTWARE",
    "password_reset": "SOFTWARE",
    "create_ticket": "SOFTWARE",
    "security_incident": "SECURITY",
    "phishing_report": "SECURITY",
    "unauthorized_access": "SECURITY",
    "malware_alert": "SECURITY",
}
INTENT_HINT_TOKENS = {
    "internet_problem": {"internet", "wifi", "network", "dns", "vpn", "latency", "connection", "slow"},
    "slow_computer": {"computer", "pc", "laptop", "startup", "hang", "freeze", "performance"},
    "email_issue": {"email", "outlook", "mail", "smtp", "inbox"},
    "printer_issue": {"printer", "print", "paper", "jam", "offline"},
    "password_reset": {"password", "reset", "login", "account"},
    "security_incident": {"phishing", "malware", "breach", "ransomware", "unauthorized", "suspicious"},
    "phishing_report": {"phishing", "suspicious", "email", "link", "attachment"},
    "unauthorized_access": {"unauthorized", "compromised", "login", "account", "access"},
    "malware_alert": {"malware", "virus", "infected", "device", "alert"},
}
NON_ISSUE_INTENTS = {"greeting", "thanks", "goodbye"}
CATEGORY_PLAYBOOK = {
    "HARDWARE": [
        "Make sure the device is plugged in, switched on, and cables are firmly connected.",
        "Restart the device.",
        "Disconnect and reconnect accessories (keyboard, mouse, monitor, charger).",
        "Try another wall socket, USB port, or cable if available.",
    ],
    "SOFTWARE": [
        "Close and reopen the app, then sign in again.",
        "Restart your device and try the same action again.",
        "If it is a browser issue, clear cache for that site or use private/incognito mode.",
        "Try the same task in another browser or app version if available.",
    ],
    "NETWORK": [
        "Check Wi-Fi/mobile data is on and connected to the correct network.",
        "Turn Wi-Fi off and on, then reconnect.",
        "Restart your router or hotspot if you can access it safely.",
        "Open another website/app to check if the issue is one service or all internet access.",
    ],
    "SECURITY": [
        "Disconnect the affected device from the network if safe to do so.",
        "Do not open suspicious links or attachments again.",
        "Capture useful evidence (timestamps, sender details, screenshots, alert text).",
        "Escalate immediately to the security team for containment and investigation.",
    ],
}
SPECIALIST_ONLY_STEP_PATTERNS = (
    "device manager",
    "print spooler",
    "task manager",
    "run as administrator",
    "admin",
    "installer log",
    "installer",
    "policy",
    "firewall",
    "safe mode",
    "registry",
    "driver",
    "nslookup",
    "ipconfig",
    "ip address",
    "unc path",
    "network adapter",
    "service status",
    "vpn client service",
    "rdp",
    "port ",
    "dns cache",
    "renew ip",
    "chipset",
    "cumulative update",
    "directory sync",
    "access rights",
    "diagnostic",
    "quarantine",
    "inventory",
)

ASSET_PATTERNS = [
    ("Printer", ("printer", "toner", "cartridge", "paper jam")),
    ("Laptop", ("laptop", "notebook", "computer", "pc")),
    ("Desktop", ("desktop", "workstation")),
    ("Monitor", ("monitor", "display", "screen")),
    ("Keyboard", ("keyboard",)),
    ("Mouse", ("mouse",)),
    ("Outlook", ("outlook", "email client", "mailbox")),
    ("Email", ("email", "mail", "gmail")),
    ("VPN", ("vpn",)),
    ("Wi-Fi", ("wifi", "wi-fi", "wireless")),
    ("Network Drive", ("network drive", "shared drive", "file share", "shared folder")),
    ("Biometric System", ("fingerprint", "biometric", "scanner")),
    ("Multi-Factor Authentication", ("mfa", "multi-factor", "multifactor", "otp", "authenticator")),
]

TITLE_VERB_PATTERNS = [
    ("not responding", "Not Responding"),
    ("not working", "Not Working"),
    ("cannot connect", "Connection Failure"),
    ("can't connect", "Connection Failure"),
    ("failing", "Failure"),
    ("failed", "Failure"),
    ("disconnect", "Disconnecting"),
    ("crash", "Crashing"),
    ("slow", "Performance Degradation"),
    ("access", "Access Issue"),
]

EMAIL_QUOTE_MARKERS = (
    "-----original message-----",
    "---------- forwarded message ---------",
    "from:",
    "subject:",
)


def _load_model(primary_name: str, *legacy_names: str):
    for candidate_name in (primary_name, *legacy_names):
        candidate_path = MODEL_DIR / candidate_name
        if candidate_path.exists():
            return joblib.load(candidate_path)
    raise FileNotFoundError(
        f"Could not find any model file for {primary_name}. Looked in {MODEL_DIR}."
    )


# -------------------------------------------------------------------
# Load trained models (generated by train_model.py)
# -------------------------------------------------------------------
vectorizer = _load_model("vectorizer.pkl", "vectorizer.joblib")
category_model = _load_model("category_model.pkl", "category_model.joblib")
priority_model = _load_model("priority_model.pkl", "severity_model.joblib")

class ClassifyRequest(BaseModel):
    text: str

class Technician(BaseModel):
    # keep it flexible for integration later
    id: Optional[str] = None
    name: str
    category: str  # HARDWARE / SOFTWARE / NETWORK / SECURITY
    open_tickets: int = 0

class AssignRequest(BaseModel):
    category: str
    technicians: List[Technician]

class ChatRequest(BaseModel):
    message: str


class TicketDraftRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None


def _tokenize(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {token for token in tokens if token not in STOPWORDS and len(token) > 2}


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text.lower())).strip()


def _tokens_with_stopwords(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _contains_phrase(message_tokens: List[str], phrase_tokens: List[str]) -> bool:
    if not message_tokens or not phrase_tokens or len(phrase_tokens) > len(message_tokens):
        return False
    window = len(phrase_tokens)
    for idx in range(0, len(message_tokens) - window + 1):
        if message_tokens[idx:idx + window] == phrase_tokens:
            return True
    return False


def _match_intent(message: str) -> Optional[dict]:
    normalized_message = _normalize_text(message)
    if not normalized_message:
        return None

    message_words = _tokens_with_stopwords(normalized_message)
    message_tokens = _tokenize(normalized_message)
    best_intent = None
    best_score = 0.0

    for intent in INTENTS_DATA:
        intent_tag = str(intent.get("tag", "")).strip().lower()
        intent_best_score = 0.0
        for pattern in intent.get("patterns", []):
            normalized_pattern = _normalize_text(str(pattern))
            if not normalized_pattern:
                continue

            pattern_words = _tokens_with_stopwords(normalized_pattern)
            if not pattern_words:
                continue
            phrase_match = _contains_phrase(message_words, pattern_words)

            if phrase_match:
                score = 1.0 + min(0.6, 0.15 * len(pattern_words))
            else:
                pattern_tokens = _tokenize(normalized_pattern)
                if not pattern_tokens:
                    continue
                overlap = len(message_tokens.intersection(pattern_tokens))
                if overlap == 0:
                    continue
                score = overlap / max(len(pattern_tokens), 1)
                if intent_tag not in NON_ISSUE_INTENTS and overlap == 1 and len(pattern_tokens) > 1:
                    score -= 0.15

            hint_tokens = INTENT_HINT_TOKENS.get(intent_tag, set())
            if hint_tokens:
                hint_overlap = len(message_tokens.intersection(hint_tokens))
                if hint_overlap == 0 and intent_tag not in NON_ISSUE_INTENTS and not phrase_match:
                    score -= 0.25
                else:
                    score += min(0.45, hint_overlap * 0.15)

            if intent_tag == "slow_computer" and message_tokens.intersection({"internet", "wifi", "network", "dns", "vpn"}):
                score -= 0.25

            if score > intent_best_score:
                intent_best_score = score

        if intent_best_score > best_score:
            best_score = intent_best_score
            best_intent = intent

    if best_intent is None:
        return None

    best_tag = str(best_intent.get("tag", "")).strip().lower()
    if best_tag in NON_ISSUE_INTENTS:
        if len(message_tokens) > 3 or message_tokens.intersection(ISSUE_SIGNAL_TOKENS):
            return None
        if best_score < 0.75:
            return None
    elif best_score < 0.7:
        return None
    return best_intent


def _is_greeting_or_smalltalk(message: str) -> bool:
    normalized = re.sub(r"[^a-z0-9\s]", " ", message.lower()).strip()
    tokens = [token for token in normalized.split() if token]
    if not tokens:
        return True

    issue_tokens = _tokenize(normalized)
    if issue_tokens.intersection(ISSUE_SIGNAL_TOKENS):
        return False

    if len(tokens) <= 3 and all(token in GREETING_TOKENS.union(COURTESY_TOKENS) for token in tokens):
        return True

    smalltalk_patterns = (
        "how are you",
        "are you there",
        "can you help",
        "need help",
        "anyone there",
        "test",
    )
    return any(pattern in normalized for pattern in smalltalk_patterns) and len(tokens) <= 5


def _clarification_reply() -> str:
    return (
        "Hello. I can help you troubleshoot this professionally.\n"
        "Please share these details so I can give accurate steps:\n"
        "1. What is failing (app, device, printer, internet, email, etc.).\n"
        "2. Exact error message (if visible).\n"
        "3. Branch/location and how many users are affected.\n"
        "4. When the issue started and what changed recently."
    )


def _not_understood_reply() -> str:
    return (
        "I could not clearly understand that message.\n"
        "Please rephrase your IT issue in one short sentence and include the affected app/device and any exact error text."
    )


def _is_unintelligible_message(message: str) -> bool:
    normalized = _normalize_text(message)
    if not normalized:
        return True

    tokens = _tokens_with_stopwords(normalized)
    if not tokens:
        return True

    # Treat known issue keywords and greetings as understandable input.
    keyword_tokens = _tokenize(normalized)
    if keyword_tokens.intersection(ISSUE_SIGNAL_TOKENS):
        return False
    if all(token in GREETING_TOKENS.union(COURTESY_TOKENS) for token in tokens):
        return False

    # Single consonant-heavy token is usually random text (e.g. "jkghfgdfgk").
    if len(tokens) == 1:
        token = tokens[0]
        vowel_count = sum(1 for char in token if char in "aeiou")
        if len(token) >= 10:
            return True
        if len(token) >= 5 and vowel_count <= 1:
            return True
        if len(token) >= 4 and vowel_count == 0:
            return True

    # Two short random chunks with no issue keywords are also treated as unclear input.
    if len(tokens) <= 2 and all(len(token) >= 4 for token in tokens):
        low_vowel_tokens = sum(1 for token in tokens if sum(1 for char in token if char in "aeiou") <= 1)
        if low_vowel_tokens == len(tokens):
            return True

    return False


def _clean_instruction(text: str) -> str:
    cleaned = re.sub(r"__eou__|__eot__", " ", str(text), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -\t")
    if not cleaned:
        return ""
    return cleaned[0].upper() + cleaned[1:]


def _is_actionable_instruction(step: str) -> bool:
    lowered = step.lower().strip()
    if len(lowered) < 12:
        return False
    low_quality_signals = (
        "thats why i ask",
        "that's why i ask",
        "thank you",
        "thanks",
        "hi there",
        "hello there",
    )
    return not any(signal in lowered for signal in low_quality_signals)


def _is_user_safe_step(step: str) -> bool:
    lowered = step.lower().strip()
    if not lowered:
        return False
    if any(pattern in lowered for pattern in SPECIALIST_ONLY_STEP_PATTERNS):
        return False
    specialist_actions = (
        "ask service desk",
        "contact service desk",
        "submit false-positive",
        "forward header details",
        "confirm user has correct access",
        "request mfa re-registration",
    )
    return not any(action in lowered for action in specialist_actions)


def _merge_unique_steps(primary_steps: List[str], fallback_steps: List[str], limit: int = 3) -> List[str]:
    merged: List[str] = []
    seen = set()
    for raw_step in primary_steps + fallback_steps:
        step = _clean_instruction(raw_step)
        if not _is_actionable_instruction(step):
            continue
        if not _is_user_safe_step(step):
            continue
        key = step.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(step)
        if len(merged) >= limit:
            break
    return merged


def _format_troubleshooting_reply(
    summary: str,
    category: str,
    steps: List[str],
    escalation: str,
    recommended_technician: str,
) -> str:
    numbered_steps = "\n".join([f"{idx}. {step}" for idx, step in enumerate(steps, start=1)])
    escalation_text = _clean_instruction(escalation) or "Escalate to Service Desk if unresolved."
    return (
        f"{summary} ({category})\n"
        "Troubleshooting steps:\n"
        f"{numbered_steps}\n"
        "Collect before escalation: exact error text, screenshot, affected users, and branch/location.\n"
        f"Escalation path: {recommended_technician}.\n"
        f"If unresolved: {escalation_text}"
    )


def _intent_issue_summary(tag: str) -> str:
    return f"{tag.replace('_', ' ').strip().title()} troubleshooting"


def _format_intent_issue_reply(intent: dict, category: str, recommended_technician: str) -> str:
    responses = [str(item) for item in intent.get("responses", []) if str(item).strip()]
    escalation = "Create a ticket manually with impact, location, and error details."
    troubleshooting_steps: List[str] = []

    for response in responses:
        cleaned = _clean_instruction(response)
        lower_response = cleaned.lower()
        if (
            "ticket" in lower_response or "support request" in lower_response or "support ticket" in lower_response
        ) and any(action in lower_response for action in ("submit", "request", "report", "create", "open", "escalate")):
            escalation = cleaned
            continue
        troubleshooting_steps.append(cleaned)

    steps = _merge_unique_steps(
        troubleshooting_steps,
        CATEGORY_PLAYBOOK.get(category, CATEGORY_PLAYBOOK["SOFTWARE"]),
    )
    if not steps:
        steps = CATEGORY_PLAYBOOK.get(category, CATEGORY_PLAYBOOK["SOFTWARE"])[:3]

    return _format_troubleshooting_reply(
        _intent_issue_summary(str(intent.get("tag", "issue"))),
        category,
        steps,
        escalation,
        recommended_technician,
    )


def _low_confidence_reply(category_hint: str) -> str:
    normalized_category = _normalize_category(category_hint)
    safe_category = normalized_category if normalized_category in ALLOWED_CATEGORIES else "SOFTWARE"
    queue_hint = TECHNICIAN_MAPPING.get(safe_category, "Service Desk")
    starter_steps = CATEGORY_PLAYBOOK.get(safe_category, CATEGORY_PLAYBOOK["SOFTWARE"])[:2]
    starter_steps_block = "\n".join([f"{idx}. {step}" for idx, step in enumerate(starter_steps, start=1)])
    return (
        "I need a bit more detail before I can give precise steps.\n"
        "Start with these checks:\n"
        f"{starter_steps_block}\n"
        "Please provide the exact symptom, error text, and affected system.\n"
        f"Current best category hint: {safe_category.title()} (queue: {queue_hint}).\n"
        "If business operations are blocked right now, proceed with manual fault reporting immediately."
    )


def _best_kb_article(message: str) -> Optional[dict]:
    normalized_message = _normalize_text(message)
    message_words = _tokens_with_stopwords(normalized_message)
    msg_tokens = _tokenize(message)
    if not msg_tokens:
        return None

    best_article = None
    best_score = 0
    best_phrase_bonus = -1
    best_overlap = -1

    for article in HELPDESK_KB:
        keyword_tokens = set()
        for keyword in article.get("keywords", []):
            keyword_tokens.update(_tokenize(keyword))
        keyword_tokens.update(_tokenize(article.get("title", "")))
        overlap = len(msg_tokens.intersection(keyword_tokens))

        # Prefer direct phrase matches if available
        phrase_bonus = 0
        for keyword in article.get("keywords", []):
            keyword_words = _tokens_with_stopwords(str(keyword))
            if _contains_phrase(message_words, keyword_words):
                phrase_bonus += 2
                if len(keyword_words) == 1 and keyword_words[0] in KB_PRECISION_TOKENS:
                    phrase_bonus += 2

        score = overlap + phrase_bonus
        if (
            score > best_score
            or (score == best_score and phrase_bonus > best_phrase_bonus)
            or (score == best_score and phrase_bonus == best_phrase_bonus and overlap > best_overlap)
        ):
            best_score = score
            best_phrase_bonus = phrase_bonus
            best_overlap = overlap
            best_article = article

    if best_score < 2:
        return None
    return best_article


def _format_kb_reply(article: dict, category: str, recommended_technician: str) -> str:
    normalized_category = _normalize_category(category)
    safe_category = normalized_category if normalized_category in ALLOWED_CATEGORIES else "SOFTWARE"
    article_steps = [str(item) for item in article.get("steps", [])]
    fallback_steps = CATEGORY_PLAYBOOK.get(safe_category, CATEGORY_PLAYBOOK["SOFTWARE"])
    merged_steps = _merge_unique_steps(article_steps, fallback_steps, limit=3)
    if not merged_steps:
        merged_steps = fallback_steps[:3]

    title = _clean_instruction(article.get("title", "Recommended troubleshooting actions"))
    escalation = str(article.get("escalation", "Escalate to service desk if issue remains unresolved."))
    return _format_troubleshooting_reply(
        title,
        safe_category,
        merged_steps,
        escalation,
        recommended_technician,
    )


def _generic_helpdesk_reply(category: str, recommended_technician: str) -> str:
    normalized_category = _normalize_category(category)
    safe_category = normalized_category if normalized_category in ALLOWED_CATEGORIES else "SOFTWARE"
    default_steps = CATEGORY_PLAYBOOK.get(safe_category, CATEGORY_PLAYBOOK["SOFTWARE"])[:3]
    return _format_troubleshooting_reply(
        "Recommended troubleshooting actions",
        safe_category,
        default_steps,
        "Create a ticket manually with impact, location, and error details.",
        recommended_technician,
    )


def _normalize_priority(priority: str) -> str:
    normalized = str(priority or "").strip().lower()
    if normalized == "urgent":
        return "Critical"
    if normalized == "critical":
        return "Critical"
    if normalized == "high":
        return "High"
    if normalized == "medium":
        return "Medium"
    if normalized == "low":
        return "Low"
    return "Medium"


def _predict_label_and_confidence(model, vector) -> tuple[str, float]:
    label = str(model.predict(vector)[0]).strip()
    confidence = 0.5
    if hasattr(model, "predict_proba"):
        try:
            confidence = float(np.max(model.predict_proba(vector)))
        except Exception:
            confidence = 0.5
    return label, confidence


def classify_with_models(text: str) -> Dict[str, Any]:
    cleaned_text = _normalize_text(text)
    if not cleaned_text:
        return {
            "category": "SOFTWARE",
            "priority": "Medium",
            "confidence": 0.0,
            "category_confidence": 0.0,
            "priority_confidence": 0.0,
        }

    vector = vectorizer.transform([cleaned_text])
    predicted_category, category_confidence = _predict_label_and_confidence(category_model, vector)
    predicted_priority, priority_confidence = _predict_label_and_confidence(priority_model, vector)

    category = _normalize_category(predicted_category)
    if category not in ALLOWED_CATEGORIES:
        category = "SOFTWARE"

    priority = _normalize_priority(predicted_priority)
    if priority not in ALLOWED_PRIORITIES:
        priority = "Medium"

    confidence = round((category_confidence + priority_confidence) / 2.0, 4)
    return {
        "category": category,
        "priority": priority,
        "confidence": confidence,
        "category_confidence": round(category_confidence, 4),
        "priority_confidence": round(priority_confidence, 4),
    }


def _clean_description_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "").replace("\r", " ")).strip()
    if not cleaned:
        return ""

    lowered = cleaned.lower()
    cut_positions = [
        lowered.find(marker)
        for marker in EMAIL_QUOTE_MARKERS
        if lowered.find(marker) > 0
    ]
    if cut_positions:
        cleaned = cleaned[: min(cut_positions)].strip()

    cleaned = re.sub(r"https?://\S+", "", cleaned).strip()
    return cleaned[:1800]


def _detect_asset(text: str, context: Optional[Dict[str, Any]] = None) -> str:
    normalized = _normalize_text(text)
    for asset_name, keywords in ASSET_PATTERNS:
        if any(keyword in normalized for keyword in keywords):
            return asset_name

    possible_asset = ""
    if context and isinstance(context.get("possible_asset_match"), dict):
        possible_asset = str(context["possible_asset_match"].get("display_name", "")).strip()
    return possible_asset


def _detect_impact(text: str, context: Optional[Dict[str, Any]] = None) -> str:
    normalized = _normalize_text(text)
    if any(
        phrase in normalized
        for phrase in (
            "everyone",
            "whole team",
            "entire team",
            "multiple users",
            "all users",
            "several users",
            "team members",
            "whole office",
            "entire office",
        )
    ) or re.search(r"\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+users?\b", normalized):
        return "Multiple users are affected."
    if any(phrase in normalized for phrase in ("cannot work", "can't work", "cannot continue", "operations blocked", "urgent")):
        return "Work is blocked for the affected user or team."
    if any(phrase in normalized for phrase in ("slow", "delay", "intermittent", "occasionally")):
        return "Productivity is reduced due to intermittent or slow behaviour."
    if context and isinstance(context.get("recent_tickets"), list) and len(context["recent_tickets"]) >= 3:
        return "Recent ticket history suggests this may be recurring."
    return "Single-user productivity impact."


def _generate_title(text: str, asset: str, category: str, context: Optional[Dict[str, Any]] = None) -> str:
    title_source = _clean_description_text(text)
    if context and isinstance(context.get("recent_tickets"), list):
        for item in context["recent_tickets"]:
            if not isinstance(item, dict):
                continue
            recent_title = str(item.get("title", "")).strip()
            if recent_title and recent_title.lower() in title_source.lower():
                return recent_title[:120]

    verb_phrase = ""
    normalized = _normalize_text(title_source)
    for pattern, label in TITLE_VERB_PATTERNS:
        if pattern in normalized:
            verb_phrase = label
            break

    if asset and verb_phrase:
        return f"{asset} {verb_phrase}"[:120]
    if asset:
        return f"{asset} Support Request"[:120]

    first_sentence = re.split(r"(?<=[.!?])\s+", title_source, maxsplit=1)[0].strip(" -")
    if first_sentence:
        return first_sentence[:120]

    return f"{category.title()} Support Request"


def extract_ticket_data(text: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    description = _clean_description_text(text)
    classification = classify_with_models(description)
    category = classification["category"]
    priority = classification["priority"]
    confidence = float(classification["confidence"])

    asset = _detect_asset(description, context)
    impact = _detect_impact(description, context)
    title = _generate_title(description, asset, category, context)

    if context:
        department = str(context.get("department", "")).strip()
        branch = str(context.get("branch", "")).strip()
        if department and department.lower() not in description.lower():
            description = f"{description}\n\nDepartment: {department}"
        if branch and branch.lower() not in description.lower():
            description = f"{description}\nBranch: {branch}"

    if not asset:
        confidence *= 0.82
    if "Single-user productivity impact." == impact and any(
        phrase in _normalize_text(description) for phrase in ("multiple", "team", "everyone")
    ):
        confidence *= 0.9

    return {
        "title": title,
        "description": description.strip(),
        "category": category,
        "priority": priority,
        "asset": asset,
        "impact": impact,
        "confidence": round(max(min(confidence, 1.0), 0.0), 4),
    }


def _normalize_category(cat: str) -> str:
    if not cat:
        return ""
    c = cat.strip().upper()
    # allow some legacy lowercase
    if c in ["HARDWARE", "SOFTWARE", "NETWORK", "SECURITY"]:
        return c
    # if a model still outputs lowercase for some reason
    c2 = cat.strip().lower()
    if c2 in ["hardware", "software", "network", "security"]:
        return c2.upper()
    return c

def _pick_best_technician(category: str, technicians: List[Technician]) -> Optional[Technician]:
    # choose technicians whose category matches, then least open tickets
    matches = [t for t in technicians if _normalize_category(t.category) == category]
    if not matches:
        return None
    matches.sort(key=lambda t: (t.open_tickets, t.name.lower()))
    return matches[0]

@app.get("/health")
def health():
    return {"status": "ok", "allowed_categories": sorted(list(ALLOWED_CATEGORIES))}

@app.post("/classify")
def classify_issue(data: ClassifyRequest):
    text = (data.text or "").strip()
    if not text:
        return {"error": "Field 'text' is required"}

    classification = classify_with_models(text)
    category = classification["category"]
    priority = classification["priority"]
    # Fallback technician recommendation (static)
    recommended_technician = TECHNICIAN_MAPPING.get(category, "Unassigned")

    return {
        "category": category,
        "priority": priority,
        "recommended_technician": recommended_technician,
        "confidence": classification["confidence"],
        "category_confidence": classification["category_confidence"],
        "priority_confidence": classification["priority_confidence"],
    }


@app.post("/ticket-draft")
def create_ticket_draft(data: TicketDraftRequest) -> Dict[str, Any]:
    message = (data.message or "").strip()
    if not message:
        return {"error": "Field 'message' is required"}

    return extract_ticket_data(message, data.context or {})

@app.post("/assign")
def assign_technician(data: AssignRequest) -> Dict[str, Any]:
    category = _normalize_category(data.category)
    if category not in ALLOWED_CATEGORIES:
        return {"error": f"category must be one of {sorted(list(ALLOWED_CATEGORIES))}"}

    # Only consider technicians that declare one of the allowed categories.
    valid_technicians = [t for t in data.technicians if _normalize_category(t.category) in ALLOWED_CATEGORIES]
    if not valid_technicians:
        return {
            "category": category,
            "assigned": None,
            "reason": "No technicians provided with valid categories (HARDWARE, SOFTWARE, NETWORK, SECURITY)",
        }

    best = _pick_best_technician(category, valid_technicians)
    if not best:
        return {"category": category, "assigned": None, "reason": "No technician matches category"}

    return {
        "category": category,
        "assigned": {
            "id": best.id,
            "name": best.name,
            "category": _normalize_category(best.category),
            "open_tickets": best.open_tickets,
        },
        "reason": "Matched by category and lowest workload",
    }


@app.post("/ai-service/chat")
def chat_helpdesk(data: ChatRequest) -> Dict[str, Any]:
    message = (data.message or "").strip()
    if not message:
        return {"reply": _clarification_reply(), "confidence": 0.0, "needs_clarification": True}

    if _is_unintelligible_message(message):
        return {
            "reply": _not_understood_reply(),
            "category": None,
            "recommended_technician": "Service Desk",
            "confidence": 0.0,
            "needs_clarification": True,
        }

    intent = _match_intent(message)
    if intent is not None:
        intent_tag = str(intent.get("tag", "")).strip().lower()
        matched_intent_tag = intent_tag
        category = INTENT_CATEGORY_MAP.get(intent_tag, None)
        if category not in ALLOWED_CATEGORIES:
            category = None
        recommended_technician = TECHNICIAN_MAPPING.get(category, "Service Desk") if category else "Service Desk"
        needs_clarification = False
        if intent_tag in NON_ISSUE_INTENTS:
            responses = [str(item) for item in intent.get("responses", []) if str(item).strip()]
            reply = _clean_instruction(responses[0]) if responses else _clarification_reply()
            needs_clarification = True
        else:
            kb_article = _best_kb_article(message)
            if kb_article is not None:
                matched_intent_tag = str(kb_article.get("id", intent_tag)).strip().lower() or intent_tag
                kb_category = _normalize_category(str(kb_article.get("category", "")))
                safe_category = kb_category if kb_category in ALLOWED_CATEGORIES else (category if category in ALLOWED_CATEGORIES else "SOFTWARE")
                recommended_technician = TECHNICIAN_MAPPING.get(safe_category, "Service Desk")
                reply = _format_kb_reply(kb_article, safe_category, recommended_technician)
                category = safe_category
            else:
                safe_category = category if category in ALLOWED_CATEGORIES else "SOFTWARE"
                recommended_technician = TECHNICIAN_MAPPING.get(safe_category, "Service Desk")
                reply = _format_intent_issue_reply(intent, safe_category, recommended_technician)
                category = safe_category
        return {
            "reply": reply,
            "intent": matched_intent_tag,
            "category": category,
            "recommended_technician": recommended_technician,
            "confidence": 1.0,
            "needs_clarification": needs_clarification,
        }

    if _is_greeting_or_smalltalk(message):
        return {
            "reply": _clarification_reply(),
            "category": None,
            "recommended_technician": "Service Desk",
            "confidence": 0.0,
            "needs_clarification": True,
        }

    message_tokens = _tokenize(message)

    if len(message_tokens) < 2:
        if not message_tokens.intersection(ISSUE_SIGNAL_TOKENS):
            return {
                "reply": _not_understood_reply(),
                "category": None,
                "recommended_technician": "Service Desk",
                "confidence": 0.0,
                "needs_clarification": True,
            }
        return {
            "reply": _low_confidence_reply("SOFTWARE"),
            "category": "SOFTWARE",
            "recommended_technician": TECHNICIAN_MAPPING.get("SOFTWARE", "Service Desk"),
            "confidence": 0.0,
            "needs_clarification": True,
        }

    classification = classify_with_models(message)
    category = classification["category"]
    confidence = float(classification["category_confidence"])

    recommended_technician = TECHNICIAN_MAPPING.get(category, "Unassigned")
    article = _best_kb_article(message)
    needs_clarification = False

    if article is not None:
        article_category = _normalize_category(str(article.get("category", "")))
        safe_category = article_category if article_category in ALLOWED_CATEGORIES else category
        recommended_technician = TECHNICIAN_MAPPING.get(safe_category, "Service Desk")
        reply = _format_kb_reply(article, safe_category, recommended_technician)
        category = safe_category
        confidence = max(confidence, 0.78)
    elif confidence < 0.5:
        if not _tokenize(message).intersection(ISSUE_SIGNAL_TOKENS):
            reply = _not_understood_reply()
        else:
            reply = _low_confidence_reply(category)
        needs_clarification = True
    else:
        reply = _generic_helpdesk_reply(category, recommended_technician)

    return {
        "reply": reply,
        "category": category,
        "recommended_technician": recommended_technician,
        "confidence": confidence,
        "needs_clarification": needs_clarification,
    }

