from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "new_tickets.csv"
MODEL_DIR = BASE_DIR / "models"

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
}

PRIORITY_MAP = {
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "urgent": "Critical",
    "critical": "Critical",
}


def _normalize_text(series: pd.Series) -> pd.Series:
    return (
        series.fillna("")
        .astype(str)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )


def _load_training_frame() -> pd.DataFrame:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training dataset not found: {DATA_PATH}")

    data = pd.read_csv(DATA_PATH)
    data.columns = [column.strip().lower() for column in data.columns]

    required_columns = {"description", "category", "priority"}
    missing_columns = required_columns - set(data.columns)
    if missing_columns:
        raise ValueError(f"Missing required CSV columns: {sorted(missing_columns)}")

    data["description"] = _normalize_text(data["description"])
    data["category"] = (
        data["category"]
        .fillna("")
        .astype(str)
        .str.strip()
        .str.lower()
        .map(CATEGORY_MAP)
    )
    data["priority"] = (
        data["priority"]
        .fillna("")
        .astype(str)
        .str.strip()
        .str.lower()
        .map(PRIORITY_MAP)
    )

    data = data.dropna(subset=["description", "category", "priority"]).copy()
    data = data[data["description"].str.len() >= 12].copy()
    data = data.drop_duplicates(subset=["description", "category", "priority"]).copy()

    if data.empty:
        raise ValueError("No usable training rows remain after preprocessing.")

    return data


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    data = _load_training_frame()
    descriptions = data["description"]
    categories = data["category"]
    priorities = data["priority"]

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.98,
        strip_accents="unicode",
        sublinear_tf=True,
    )
    description_vectors = vectorizer.fit_transform(descriptions)

    category_model = LogisticRegression(max_iter=3000, class_weight="balanced")
    category_model.fit(description_vectors, categories)

    priority_model = LogisticRegression(max_iter=3000, class_weight="balanced")
    priority_model.fit(description_vectors, priorities)

    joblib.dump(vectorizer, MODEL_DIR / "vectorizer.pkl")
    joblib.dump(category_model, MODEL_DIR / "category_model.pkl")
    joblib.dump(priority_model, MODEL_DIR / "priority_model.pkl")

    print("Dataset-based intake models trained successfully.")
    print(f"Rows used: {len(data)}")
    print(f"Category classes: {list(category_model.classes_)}")
    print(f"Priority classes: {list(priority_model.classes_)}")
    print(f"Saved models to: {MODEL_DIR}")

    sample_text = descriptions.iloc[0]
    sample_vector = vectorizer.transform([sample_text])
    print(f"Sample category prediction: {category_model.predict(sample_vector)[0]}")
    print(f"Sample priority prediction: {priority_model.predict(sample_vector)[0]}")


if __name__ == "__main__":
    main()
