from __future__ import annotations

from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

from training_data import load_training_frame


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    data = load_training_frame()
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
    print(f"Source datasets: {data['source_dataset'].value_counts().to_dict()}")
    print(f"Category classes: {list(category_model.classes_)}")
    print(f"Priority classes: {list(priority_model.classes_)}")
    print(f"Saved models to: {MODEL_DIR}")

    sample_text = descriptions.iloc[0]
    sample_vector = vectorizer.transform([sample_text])
    print(f"Sample category prediction: {category_model.predict(sample_vector)[0]}")
    print(f"Sample priority prediction: {priority_model.predict(sample_vector)[0]}")


if __name__ == "__main__":
    main()
