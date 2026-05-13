from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

CATEGORY_MAP = {
    "hardware": "HARDWARE",
    "software": "SOFTWARE",
    "network": "NETWORK",
    "security": "SECURITY",
    "account": "SOFTWARE",
    "communication": "SOFTWARE",
    "training": "SOFTWARE",
    "remotework": "NETWORK",
    "infrastructure": "NETWORK",
    "licensing": "SOFTWARE",
    "performance": "SOFTWARE",
    "email": "SOFTWARE",
}

PRIORITY_MAP = {
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "urgent": "Critical",
    "critical": "Critical",
}

EMAIL_QUOTE_MARKERS = (
    "-----original message-----",
    "---------- forwarded message ---------",
    "from:",
    "subject:",
)


@dataclass(frozen=True)
class TrainingDataset:
    filename: str
    text_columns: tuple[str, ...]
    category_column: str
    priority_column: str
    required: bool = True


TRAINING_DATASETS: tuple[TrainingDataset, ...] = (
    TrainingDataset(
        filename="new_tickets.csv",
        text_columns=("subject", "description"),
        category_column="category",
        priority_column="priority",
    ),
    TrainingDataset(
        filename="tickets.csv",
        text_columns=("text",),
        category_column="category",
        priority_column="severity",
    ),
    TrainingDataset(
        filename="tickets_advanced.csv",
        text_columns=("text",),
        category_column="category",
        priority_column="severity",
        required=False,
    ),
)


def _normalize_columns(data: pd.DataFrame) -> pd.DataFrame:
    normalized = data.copy()
    normalized.columns = [str(column).strip().lower() for column in normalized.columns]
    return normalized


def _clean_text(value: object) -> str:
    cleaned = str(value or "").replace("\r", " ")
    cleaned = re.sub(r"__eou__|__eot__", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"https?://\S+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    lowered = cleaned.lower()
    cut_positions = [
        lowered.find(marker)
        for marker in EMAIL_QUOTE_MARKERS
        if lowered.find(marker) > 0
    ]
    if cut_positions:
        cleaned = cleaned[: min(cut_positions)].strip()

    return re.sub(r"\s+", " ", cleaned).strip()


def _combine_text_columns(data: pd.DataFrame, columns: Iterable[str]) -> pd.Series:
    values = []
    for column in columns:
        values.append(data[column].fillna("").astype(str).map(_clean_text))

    if not values:
        return pd.Series([""] * len(data), index=data.index)

    combined = values[0]
    for value in values[1:]:
        combined = combined.str.cat(value, sep=" ")
    return combined.map(_clean_text)


def _prepare_dataset(config: TrainingDataset) -> pd.DataFrame:
    dataset_path = DATA_DIR / config.filename
    if not dataset_path.exists():
        if config.required:
            raise FileNotFoundError(f"Training dataset not found: {dataset_path}")
        return pd.DataFrame(columns=["description", "category", "priority", "source_dataset"])

    raw_data = _normalize_columns(pd.read_csv(dataset_path))
    required_columns = set(config.text_columns).union({config.category_column, config.priority_column})
    missing_columns = required_columns - set(raw_data.columns)
    if missing_columns:
        raise ValueError(f"{config.filename} is missing required columns: {sorted(missing_columns)}")

    data = pd.DataFrame(
        {
            "description": _combine_text_columns(raw_data, config.text_columns),
            "category": raw_data[config.category_column]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.lower()
            .map(CATEGORY_MAP),
            "priority": raw_data[config.priority_column]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.lower()
            .map(PRIORITY_MAP),
            "source_dataset": config.filename,
        }
    )
    return data


def load_training_frame() -> pd.DataFrame:
    frames = [_prepare_dataset(config) for config in TRAINING_DATASETS]
    data = pd.concat(frames, ignore_index=True)

    if data.empty:
        raise ValueError("No training datasets were loaded.")

    data = data.dropna(subset=["description", "category", "priority"]).copy()
    data = data[data["description"].str.len() >= 12].copy()
    data["dedupe_key"] = data["description"].str.lower()
    data = data.drop_duplicates(subset=["dedupe_key", "category", "priority"]).copy()
    data = data.drop(columns=["dedupe_key"]).reset_index(drop=True)

    if data.empty:
        raise ValueError("No usable training rows remain after preprocessing.")

    return data
