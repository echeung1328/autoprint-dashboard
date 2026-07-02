import re

path = r"D:\WBStorage\Projects\AutoPrint\insert_final.sql"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace T with space in ISO timestamp strings within single quotes
# Pattern matches: 'YYYY-MM-DDTHH:MM:SS+08:00'
pattern = r"'(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?)'"
replacement = r"'\1 \2'"
fixed = re.sub(pattern, replacement, content)

# Also handle timestamps without timezone
pattern2 = r"'(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})'"
replacement2 = r"'\1 \2'"
fixed = re.sub(pattern2, replacement2, fixed)

out_path = r"D:\WBStorage\Projects\AutoPrint\insert_final_fixed.sql"
with open(out_path, "w", encoding="utf-8") as f:
    f.write(fixed)

# Count fixes
original_ts = len(re.findall(r"T\d{2}:\d{2}:\d{2}", content))
fixed_ts = len(re.findall(r" \d{2}:\d{2}:\d{2}", fixed))
print(f"Original ISO timestamps: {original_ts}")
print(f"Fixed SQL written to: {out_path}")

# Show a sample
lines = fixed.split("\n")
for line in lines[:5]:
    if line.strip() and not line.strip().startswith("--"):
        print(f"Sample: {line[:120]}")
        break
