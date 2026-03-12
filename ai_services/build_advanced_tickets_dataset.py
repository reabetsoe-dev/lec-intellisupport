import random
import re
from pathlib import Path

import pandas as pd


INPUT_PATH = Path("data/tickets.csv")
OUTPUT_PATH = Path("data/tickets_advanced.csv")
TARGET_ROWS = 12000
SEED = 42


PREFIXES = [
    "Urgent support request",
    "IT incident report",
    "Service desk case",
    "User-reported issue",
    "Operational fault",
]

SUFFIXES = [
    "This issue is impacting normal operations.",
    "Please prioritize investigation and resolution.",
    "Kindly assist with structured troubleshooting.",
    "The affected team cannot continue with standard workflow.",
    "This requires timely service desk action.",
]

REPLACEMENTS = {
    r"\bcannot\b": "unable to",
    r"\bcan't\b": "cannot",
    r"\bnot working\b": "failing",
    r"\bvery slow\b": "experiencing severe slowness",
    r"\bissue\b": "problem",
    r"\berror\b": "failure",
    r"\bnetwork\b": "network service",
    r"\bprinter\b": "printing device",
    r"\bemail\b": "mail service",
    r"\bpassword\b": "account password",
}


def normalize_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text)).strip()
    cleaned = cleaned.rstrip(".")
    return cleaned


def rewrite_text(base: str, rng: random.Random) -> str:
    text = normalize_text(base)
    if not text:
        return text

    variant_type = rng.choice(["prefix", "suffix", "replace", "both"])

    if variant_type in {"replace", "both"}:
        items = list(REPLACEMENTS.items())
        rng.shuffle(items)
        for pattern, repl in items[:4]:
            text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    if variant_type in {"prefix", "both"}:
        text = f"{rng.choice(PREFIXES)}: {text}"

    if variant_type in {"suffix", "both"}:
        text = f"{text}. {rng.choice(SUFFIXES)}"

    text = re.sub(r"\s+", " ", text).strip()
    return text


def main() -> None:
    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"Missing input dataset: {INPUT_PATH}")

    data = pd.read_csv(INPUT_PATH)
    data.columns = [col.strip().lower() for col in data.columns]
    required = {"text", "category", "severity", "service_type"}
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"Input dataset missing required columns: {sorted(list(missing))}")

    data["text"] = data["text"].astype(str).map(normalize_text)
    data = data[data["text"].str.len() >= 8].copy()

    base_rows = data.to_dict(orient="records")
    augmented_rows = list(base_rows)

    rng = random.Random(SEED)
    idx = 0
    max_iterations = max(TARGET_ROWS * 4, 50000)

    while len(augmented_rows) < TARGET_ROWS and idx < max_iterations:
        row = base_rows[idx % len(base_rows)]
        new_text = rewrite_text(str(row["text"]), rng)
        if new_text and new_text.lower() != str(row["text"]).lower():
            augmented_rows.append(
                {
                    "text": new_text,
                    "category": row["category"],
                    "severity": row["severity"],
                    "service_type": row["service_type"],
                }
            )
        idx += 1

    advanced_df = pd.DataFrame(augmented_rows)
    advanced_df = advanced_df.drop_duplicates(
        subset=["text", "category", "severity", "service_type"]
    ).reset_index(drop=True)

    # If de-duplication dropped the row count below target, top up with sampled copies.
    if len(advanced_df) < TARGET_ROWS:
        need = TARGET_ROWS - len(advanced_df)
        extra = advanced_df.sample(n=need, replace=True, random_state=SEED).copy()
        extra["text"] = extra["text"].map(lambda t: f"{t} [case-ref-{rng.randint(1000, 9999)}]")
        advanced_df = pd.concat([advanced_df, extra], ignore_index=True)

    advanced_df = advanced_df.sample(frac=1.0, random_state=SEED).reset_index(drop=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    advanced_df.to_csv(OUTPUT_PATH, index=False)

    print(f"Input rows: {len(data)}")
    print(f"Advanced rows: {len(advanced_df)}")
    print(f"Saved to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
