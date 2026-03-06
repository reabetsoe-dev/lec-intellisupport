import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

# Load data
data = pd.read_csv("data/tickets.csv")

X = data["text"]

# Create TF-IDF converter
vectorizer = TfidfVectorizer()

# Convert text to numbers
X_vectors = vectorizer.fit_transform(X)

print("Text converted to numbers successfully!")
print("Shape of numeric data:", X_vectors.shape)
