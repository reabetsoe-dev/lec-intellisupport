from training_data import load_training_frame

data = load_training_frame()

X = data["description"]
y_category = data["category"]
y_priority = data["priority"]

print("INPUT (X):")
print(X.head(20))

print("\nCATEGORY LABELS:")
print(y_category.head(20))

print("\nPRIORITY LABELS:")
print(y_priority.head(20))

print("\nSOURCE DATASETS:")
print(data["source_dataset"].value_counts())

print(f"\nCLEANED ROWS READY FOR TRAINING: {len(data)}")
