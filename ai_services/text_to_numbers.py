import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

data = pd.read_csv("data/tickets.csv")

X = data["text"]

vectorizer = TfidfVectorizer()

X_vectors = vectorizer.fit_transform(X)

print("Text converted to numbers successfully!")
print("Shape of numeric data:", X_vectors.shape)
