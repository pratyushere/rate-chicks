"""
extract_students.py
Extracts student names, gender, and photos from the CBSE Patna PDF.
Saves results to data/students.json and photos to data/photos/
"""
import fitz  # PyMuPDF
import json
import os
import re
from pathlib import Path

PDF_PATH = "class 9 checklist with photos (1).pdf"
OUTPUT_JSON = "data/students.json"
PHOTOS_DIR = "data/photos"

os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs("data", exist_ok=True)

doc = fitz.open(PDF_PATH)
students = []

# Track globally assigned SL numbers to avoid duplicates
seen_sl = set()

for page_num in range(len(doc)):
    page = doc[page_num]
    
    # ── Step 1: Extract all images with their Y positions ──────────────────
    img_infos = page.get_image_info(xrefs=True)
    # Filter: student photos are always in x-range ~673–756
    photo_imgs = [
        img for img in img_infos
        if img.get("bbox") and 660 < img["bbox"][0] < 770
    ]
    # Sort by Y position
    photo_imgs.sort(key=lambda i: i["bbox"][1])

    # ── Step 2: Extract student records via text blocks ────────────────────
    blocks = page.get_text("dict")["blocks"]

    # Build a list of (y_pos, text) for all text spans
    text_items = []
    for block in blocks:
        if block.get("type") != 0:  # 0 = text
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span["text"].strip()
                y = span["origin"][1]
                x = span["origin"][0]
                if text:
                    text_items.append((y, x, text))

    text_items.sort(key=lambda t: (t[0], t[1]))

    # ── Step 3: Find student entry groups ─────────────────────────────────
    # Each student block starts with a 5-digit SL.NO at x~30
    # Strategy: find all SL.NO items (5-digit, x<60), group by Y
    sl_entries = []
    for (y, x, text) in text_items:
        # 5-digit serial number in left column
        if re.match(r'^0\d{4}$', text) and x < 65:
            sl_num = int(text)
            if sl_num not in seen_sl:
                seen_sl.add(sl_num)
                sl_entries.append({"sl": sl_num, "y": y, "name": None, "gender": None})

    # For each SL entry, find nearest name (x~96-180, same y-band) and gender
    for entry in sl_entries:
        entry_y = entry["y"]
        # Collect all text items within ~100px Y range of this entry
        nearby = [(y, x, t) for (y, x, t) in text_items if abs(y - entry_y) < 100]

        # Name is in x-range 90-185 and appears near top of entry
        for (y, x, t) in nearby:
            if 88 < x < 200 and abs(y - entry_y) < 20 and t not in (
                "CANDIDATE NAME", "MOTHER NAME", "FATHER NAME", "Fee:"
            ) and not t.startswith("Fee") and not t.startswith("Adm") and len(t) > 2:
                if entry["name"] is None:
                    entry["name"] = t
                break

        # Gender: "Male" or "Female" in the SEX column (x~238-260)
        for (y, x, t) in nearby:
            if 225 < x < 280 and t in ("Male", "Female"):
                entry["gender"] = t
                break

    # ── Step 4: Match photos to student entries by Y proximity ────────────
    for i, entry in enumerate(sl_entries):
        entry_y = entry["y"]
        best_img = None
        best_dist = 9999

        for img in photo_imgs:
            img_y = img["bbox"][1]  # top of image
            dist = abs(img_y - entry_y)
            if dist < best_dist:
                best_dist = dist
                best_img = img

        if best_img and best_dist < 150:  # within 150px Y = same row
            xref = best_img.get("xref")
            if xref and entry["name"]:
                # Extract and save photo
                try:
                    base_image = doc.extract_image(xref)
                    img_ext = base_image["ext"]
                    safe_name = re.sub(r'[^\w\s-]', '', entry["name"]).strip().replace(" ", "_")
                    img_filename = f"{entry['sl']:05d}_{safe_name}.{img_ext}"
                    img_path = os.path.join(PHOTOS_DIR, img_filename)
                    with open(img_path, "wb") as f:
                        f.write(base_image["image"])
                    entry["photo"] = f"photos/{img_filename}"
                except Exception as e:
                    print(f"  [WARN] Could not save photo for {entry['name']}: {e}")
                    entry["photo"] = None
            else:
                entry["photo"] = None
        else:
            entry["photo"] = None

    # Add valid entries to global list
    for entry in sl_entries:
        if entry["name"] and entry["gender"]:
            students.append({
                "id": entry["sl"],
                "name": entry["name"],
                "gender": entry["gender"],
                "photo": entry.get("photo"),
                "active": True  # admin can set to False to hide
            })
            print(f"  [OK] [{entry['sl']:05d}] {entry['name']} ({entry['gender']}) -> {entry.get('photo', 'no photo')}")
        elif entry["name"]:
            print(f"  [SKIP] [{entry['sl']:05d}] {entry['name']} -- missing gender")

print(f"\n{'='*60}")
print(f"Total students extracted: {len(students)}")
male_count = sum(1 for s in students if s["gender"] == "Male")
female_count = sum(1 for s in students if s["gender"] == "Female")
print(f"  Male:   {male_count}")
print(f"  Female: {female_count}")
photos_found = sum(1 for s in students if s["photo"])
print(f"  With photos: {photos_found}")

# Save JSON
with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(students, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] Data saved to {OUTPUT_JSON}")
print(f"[DONE] Photos saved to {PHOTOS_DIR}/")
doc.close()
