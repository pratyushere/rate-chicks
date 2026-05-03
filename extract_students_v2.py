"""
extract_students_v2.py — Enhanced Extractor with:
  1. Cross-page photo stitching (every 5th student's photo is on next page)
  2. Auto-orientation correction via PIL (portrait enforcement)
  3. OCR-based name verification via pytesseract
  4. Discrepancy log saved to data/discrepancies.json
  5. Duplicate SL.NO merging

Run: python extract_students_v2.py
"""
import fitz          # PyMuPDF
import json
import os
import re
import io
import sys
from pathlib import Path

# ── PIL imports ─────────────────────────────────────────────────────────
from PIL import Image

# ── OCR import (graceful fallback if Tesseract not in PATH) ─────────────
OCR_AVAILABLE = False
try:
    import pytesseract
    # Common install paths for Tesseract on Windows
    possible_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        r"C:\Users\praty\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
    ]
    for p in possible_paths:
        if os.path.exists(p):
            pytesseract.pytesseract.tesseract_cmd = p
            break
    # Quick test
    pytesseract.get_tesseract_version()
    OCR_AVAILABLE = True
    print("[OCR] Tesseract available — name verification ENABLED")
except Exception as e:
    print(f"[OCR] Tesseract not available ({e}) — name verification DISABLED")
    print("      Photos will still be corrected but OCR matching will be skipped.")

# ── Config ───────────────────────────────────────────────────────────────
PDF_PATH      = "class 9 checklist with photos (1).pdf"
OUTPUT_JSON   = "data/students.json"
DISCREP_JSON  = "data/discrepancies.json"
PHOTOS_DIR    = "data/photos"

os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs("data", exist_ok=True)

# ── Helpers ───────────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Uppercase, strip extra spaces, remove noise for comparison."""
    return re.sub(r'[^A-Z ]', '', name.upper()).strip()

def fix_image_orientation(img_bytes: bytes, ext: str) -> bytes:
    """
    Auto-rotate images to portrait orientation.
    If width > height: rotate 90° CCW to make portrait.
    """
    try:
        pil_img = Image.open(io.BytesIO(img_bytes))
        w, h = pil_img.size

        if w > h:
            # Landscape → rotate 90° counter-clockwise to get portrait
            pil_img = pil_img.rotate(90, expand=True)
            rotated = True
        else:
            rotated = False

        # Re-save to bytes
        buf = io.BytesIO()
        fmt = "JPEG" if ext.lower() in ("jpg", "jpeg") else ext.upper()
        if fmt == "PNG":
            pil_img.save(buf, format="PNG")
        else:
            pil_img = pil_img.convert("RGB")  # ensure no alpha for JPEG
            pil_img.save(buf, format="JPEG", quality=92)
        return buf.getvalue(), rotated
    except Exception as e:
        return img_bytes, False

def ocr_photo_name(img_path: str) -> str | None:
    """
    Run OCR on the bottom strip of a photo where the name is printed.
    Returns normalized OCR'd name string, or None on failure.
    """
    if not OCR_AVAILABLE:
        return None
    try:
        pil_img = Image.open(img_path)
        w, h = pil_img.size
        # Bottom 20% of image contains the name strip
        strip_top = int(h * 0.78)
        strip = pil_img.crop((0, strip_top, w, h))
        # Upscale for better OCR
        strip = strip.resize((strip.width * 3, strip.height * 3), Image.LANCZOS)
        # Convert to grayscale + high contrast
        strip = strip.convert("L")

        config = r'--psm 7 --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ '
        text = pytesseract.image_to_string(strip, config=config)
        lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
        # First non-empty line should be the name
        if lines:
            return normalize_name(lines[0])
    except Exception as e:
        pass
    return None

def names_match(table_name: str, ocr_name: str) -> bool:
    """Fuzzy name comparison: ignore single-char differences."""
    if not ocr_name:
        return True  # can't verify, assume OK
    t = normalize_name(table_name)
    o = normalize_name(ocr_name)
    if t == o:
        return True
    # Allow if one is a subset of the other (partial OCR read)
    t_words = set(t.split())
    o_words = set(o.split())
    common = t_words & o_words
    if len(common) >= max(1, min(len(t_words), len(o_words)) - 1):
        return True
    return False

# ── Main Extraction ────────────────────────────────────────────────────────

doc = fitz.open(PDF_PATH)
print(f"PDF: {len(doc)} pages\n")

students_map  = {}   # sl_num → student dict
discrepancies = []
seen_sl       = set()

# ── PASS 1: Extract all student text records ───────────────────────────────
print("Pass 1: Extracting student records from text...")

for page_num in range(len(doc)):
    page = doc[page_num]
    blocks = page.get_text("dict")["blocks"]

    text_items = []
    for block in blocks:
        if block.get("type") != 0: continue
        for line in block["lines"]:
            for span in line["spans"]:
                t = span["text"].strip()
                if t:
                    text_items.append((span["origin"][1], span["origin"][0], t))
    text_items.sort(key=lambda x: (x[0], x[1]))

    # Find SL entries
    for (y, x, t) in text_items:
        if re.match(r'^0\d{4}$', t) and x < 65:
            sl_num = int(t)
            if sl_num in seen_sl:
                continue   # Duplicate from page header — skip
            seen_sl.add(sl_num)

            entry = {"sl": sl_num, "y": y, "page": page_num, "name": None, "gender": None, "photo": None}

            # Grab name (x=88-200, same y-band)
            for (yt, xt, tt) in text_items:
                if 88 < xt < 200 and abs(yt - y) < 20:
                    if tt not in ("CANDIDATE NAME","MOTHER NAME","FATHER NAME") \
                       and not tt.startswith("Fee") and not tt.startswith("Adm") \
                       and len(tt) > 2:
                        entry["name"] = tt
                        break

            # Grab gender (x=225-280, same y-band)
            for (yt, xt, tt) in text_items:
                if 225 < xt < 280 and abs(yt - y) < 100 and tt in ("Male", "Female"):
                    entry["gender"] = tt
                    break

            students_map[sl_num] = entry

print(f"  Found {len(students_map)} unique student records")

# ── PASS 2: Match photos — with cross-page stitching ─────────────────────
print("\nPass 2: Matching photos (with page-split stitching)...")

# Strategy:
#   - Every odd-indexed PDF page (0,2,4...) has 4 photos for 5 students.
#     The 5th student's photo is at the TOP of the NEXT page.
#   - We collect (page_num, img_info) for all photos and match by SL proximity.

all_photos = []   # list of (page_num, img_info)
for page_num in range(len(doc)):
    page = doc[page_num]
    imgs = page.get_image_info(xrefs=True)
    for img in imgs:
        if img.get("bbox") and 660 < img["bbox"][0] < 770:
            all_photos.append((page_num, img))

print(f"  Total student photos found: {len(all_photos)}")

# Sort all students by SL number
sorted_students = sorted(students_map.values(), key=lambda s: s["sl"])

# Assign photos: photos are also in SL order across the PDF
# Number of photos should equal number of students
if len(all_photos) != len(sorted_students):
    print(f"  [WARN] Photo count ({len(all_photos)}) != student count ({len(sorted_students)})")

# Zip them in order — both are sorted by document order which == SL order
for i, (student, (page_num, img_info)) in enumerate(zip(sorted_students, all_photos)):
    xref = img_info.get("xref")
    if not xref:
        continue

    try:
        base_image = doc.extract_image(xref)
        img_bytes  = base_image["image"]
        img_ext    = base_image["ext"]

        # Fix orientation
        img_bytes, was_rotated = fix_image_orientation(img_bytes, img_ext)
        save_ext = "jpeg" if img_ext.lower() in ("jpg","jpeg") else img_ext

        safe_name    = re.sub(r'[^\w\s-]', '', student["name"] or "unknown").strip().replace(" ","_")
        img_filename = f"{student['sl']:05d}_{safe_name}.{save_ext}"
        img_path     = os.path.join(PHOTOS_DIR, img_filename)

        with open(img_path, "wb") as f:
            f.write(img_bytes)

        student["photo"] = f"photos/{img_filename}"
        orientation_note = " [rotated]" if was_rotated else ""
        print(f"  [OK] SL{student['sl']:05d} {student['name']} -> {img_filename}{orientation_note}")

    except Exception as e:
        print(f"  [ERR] SL{student['sl']:05d}: {e}")

# ── PASS 3: OCR Verification ──────────────────────────────────────────────
print("\nPass 3: OCR name verification...")
ocr_flagged = 0

for student in sorted_students:
    if not student.get("photo"):
        continue
    img_path = os.path.join(PHOTOS_DIR, student["photo"].replace("photos/",""))
    if not os.path.exists(img_path):
        continue

    ocr_name = ocr_photo_name(img_path)
    student["ocr_name"] = ocr_name  # store for reference

    if ocr_name:
        match = names_match(student["name"] or "", ocr_name)
        student["ocr_match"] = match
        if not match:
            ocr_flagged += 1
            print(f"  [MISMATCH] SL{student['sl']:05d}: PDF='{student['name']}' | OCR='{ocr_name}'")
            discrepancies.append({
                "id":         student["sl"],
                "name":       student["name"],
                "ocr_name":   ocr_name,
                "photo":      student["photo"],
                "resolved":   False,
                "note":       f"PDF name '{student['name']}' vs OCR name '{ocr_name}'",
            })
        else:
            student["ocr_match"] = True
    else:
        student["ocr_match"] = None  # OCR not available or failed

if not OCR_AVAILABLE:
    print("  (OCR skipped — Tesseract not installed)")
else:
    print(f"  OCR done. {ocr_flagged} mismatches flagged.")

# ── Build final output ────────────────────────────────────────────────────
final_students = []
for s in sorted_students:
    if s["name"] and s["gender"]:
        final_students.append({
            "id":        s["sl"],
            "name":      s["name"],
            "gender":    s["gender"],
            "photo":     s.get("photo"),
            "active":    True,
            "ocr_name":  s.get("ocr_name"),
            "ocr_match": s.get("ocr_match"),
        })

# Summary
print(f"\n{'='*60}")
print(f"Total students: {len(final_students)}")
print(f"  Male:         {sum(1 for s in final_students if s['gender']=='Male')}")
print(f"  Female:       {sum(1 for s in final_students if s['gender']=='Female')}")
print(f"  With photos:  {sum(1 for s in final_students if s['photo'])}")
print(f"  Discrepancies:{len(discrepancies)}")

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(final_students, f, indent=2, ensure_ascii=False)

with open(DISCREP_JSON, "w", encoding="utf-8") as f:
    json.dump(discrepancies, f, indent=2, ensure_ascii=False)

print(f"\n[DONE] Students  -> {OUTPUT_JSON}")
print(f"[DONE] Discrepancies -> {DISCREP_JSON}")
doc.close()
