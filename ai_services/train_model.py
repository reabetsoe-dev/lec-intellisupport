import os
import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression



DATA_PATH = "data/tickets_advanced.csv"
MODEL_DIR = "models"

os.makedirs(MODEL_DIR, exist_ok=True)

# Load data
data = pd.read_csv(DATA_PATH)

# Normalize column names (safe)
data.columns = [c.strip().lower() for c in data.columns]

# Required columns
required_cols = {"text", "category", "severity"}
missing = required_cols - set(data.columns)
if missing:
    raise ValueError(f"Missing required columns in CSV: {missing}")

# service_type is optional: default to "general" when absent
if "service_type" not in data.columns:
    print("service_type column not found. Using default value: general")
    data["service_type"] = "general"

# Normalize labels
data["text"] = (
    data["text"]
    .astype(str)
    .fillna("")
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
)

# Collapse any extra categories into the supported core classes.
CATEGORY_COLLAPSE = {
    "hardware": "HARDWARE",
    "software": "SOFTWARE",
    "network": "NETWORK",
    "security": "SECURITY",
    "cybersecurity": "SECURITY",
    # Optional: map other legacy categories if they appear
    "email": "SOFTWARE",
    "account": "SOFTWARE",
    "printer": "HARDWARE",
}

data["category"] = data["category"].astype(str).str.strip().str.lower().map(CATEGORY_COLLAPSE)

# Drop rows with unknown/unmapped categories
data = data.dropna(subset=["category"]).copy()
data = data[data["text"].str.len() >= 8].copy()

# Keep only these core categories strictly
allowed = {"HARDWARE", "SOFTWARE", "NETWORK", "SECURITY"}
data = data[data["category"].isin(allowed)].copy()
data = data.drop_duplicates(subset=["text", "category", "severity", "service_type"]).copy()
if data.empty:
    raise ValueError("No training rows left after preprocessing. Check dataset quality/mappings.")

# Severity + service_type normalization (keep as-is but lower-case for consistency)
data["severity"] = data["severity"].astype(str).fillna("").str.strip().str.lower()
data["service_type"] = data["service_type"].astype(str).fillna("general").str.strip().str.lower()
data.loc[data["service_type"] == "", "service_type"] = "general"

X = data["text"]
y_category = data["category"]
y_severity = data["severity"]
y_service_type = data["service_type"]

# Convert text to numbers
vectorizer = TfidfVectorizer(
    ngram_range=(1, 2),
    min_df=2,
    max_df=0.95,
    sublinear_tf=True,
)
X_vectors = vectorizer.fit_transform(X)

# Train category model
category_model = LogisticRegression(max_iter=3000, class_weight="balanced")
category_model.fit(X_vectors, y_category)

# Train severity model
severity_model = LogisticRegression(max_iter=3000, class_weight="balanced")
severity_model.fit(X_vectors, y_severity)

# Train service type model
service_type_classes = y_service_type.nunique()
if service_type_classes >= 2:
    service_type_model = LogisticRegression(max_iter=3000, class_weight="balanced")
    service_type_model.fit(X_vectors, y_service_type)
else:
    # LogisticRegression requires at least 2 classes, so we use a constant fallback model.
    service_type_model = DummyClassifier(strategy="most_frequent")
    service_type_model.fit(X_vectors, y_service_type)

print("Models trained successfully!")
print("Training rows:", len(data))
print("Category classes:", list(category_model.classes_))
print("Service type classes:", sorted(data["service_type"].unique().tolist()))

# Save models and vectorizer
joblib.dump(vectorizer, os.path.join(MODEL_DIR, "vectorizer.joblib"))
joblib.dump(category_model, os.path.join(MODEL_DIR, "category_model.joblib"))
joblib.dump(severity_model, os.path.join(MODEL_DIR, "severity_model.joblib"))
joblib.dump(service_type_model, os.path.join(MODEL_DIR, "service_type_model.joblib"))

print("Models saved successfully in:", MODEL_DIR)

# Quick sanity test
sample = "internet down HQ pls"
vec = vectorizer.transform([sample])
print("Sample:", sample)
print("Predicted category:", category_model.predict(vec)[0])
