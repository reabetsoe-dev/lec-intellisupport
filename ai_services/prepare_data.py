import pandas as pd

# Load the data
data = pd.read_csv("data/tickets.csv")

# Separate inputs and labels
X = data["text"]        # Input (what the user writes)
y_category = data["category"]  # Output 1
y_severity = data["severity"]  # Output 2
y_service_type = data["service_type"]  # Output 3

# Print to confirm
print("INPUT (X):")
print(X)

print("\nCATEGORY LABELS:")
print(y_category)

print("\nSEVERITY LABELS:")
print(y_severity)

print("\nSERVICE TYPE LABELS:")
print(y_service_type)
