import re


WORK_STOPPAGE_PATTERNS = (
    re.compile(r"\b(?:unable|cannot|can't)\s+work\b", re.IGNORECASE),
    re.compile(r"\b(?:i\s+(?:am\s+)?)?unable\s+to\s+continue(?:\s+my\s+tasks?)?\b", re.IGNORECASE),
    re.compile(r"\b(?:i\s+)?cannot\s+continue(?:\s+my\s+tasks?)?\b", re.IGNORECASE),
    re.compile(r"\b(?:i\s+)?can't\s+continue(?:\s+my\s+tasks?)?\b", re.IGNORECASE),
    re.compile(
        r"\b(?:the\s+affected\s+team|employees?|staff|users?)\s+cannot\s+continue(?:\s+with\s+standard\s+workflow)?\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:business|normal)\s+operations\s+are\s+blocked\b", re.IGNORECASE),
    re.compile(r"\bimpacting\s+normal\s+operations\b", re.IGNORECASE),
    re.compile(r"\bblocked\s+from\s+working\b", re.IGNORECASE),
    re.compile(r"\bprevent(?:s|ing)?\s+(?:me|employees?|staff|users?)\s+from\s+working\b", re.IGNORECASE),
    re.compile(r"\bstop(?:s|ped|ping)?\s+(?:me|employees?|staff|users?)\s+from\s+working\b", re.IGNORECASE),
)


def indicates_work_stoppage(text: str) -> bool:
    searchable = str(text or "").strip()
    if not searchable:
        return False
    return any(pattern.search(searchable) for pattern in WORK_STOPPAGE_PATTERNS)


def upgrade_severity_for_work_stoppage(text: str, severity: str) -> str:
    normalized = str(severity or "").strip().lower()
    if normalized == "critical":
        return normalized
    if indicates_work_stoppage(text):
        return "high"
    return normalized
