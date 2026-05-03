"""
audit_pages.py — Find cross-page record splits
Identifies: 1) Records with no photo on their page
            2) Orphan photos at top of a page (no nearby student entry)
"""
import fitz
import re

PDF_PATH = "class 9 checklist with photos (1).pdf"
doc = fitz.open(PDF_PATH)

print("=== Cross-Page Analysis ===\n")
prev_page_missing = []  # Students from prev page with no photo

for page_num in range(min(10, len(doc))):
    page = doc[page_num]

    # Get images with positions
    img_infos = page.get_image_info(xrefs=True)
    photo_imgs = sorted(
        [i for i in img_infos if i.get("bbox") and 660 < i["bbox"][0] < 770],
        key=lambda i: i["bbox"][1]
    )

    # Get student SL entries and their Y positions
    text_items = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0: continue
        for line in block["lines"]:
            for span in line["spans"]:
                t = span["text"].strip()
                y = span["origin"][1]
                x = span["origin"][0]
                if t:
                    text_items.append((y, x, t))

    sl_entries = []
    for (y, x, t) in text_items:
        if re.match(r'^0\d{4}$', t) and x < 65:
            sl_entries.append({"sl": int(t), "y": y})

    # Find names for each SL
    for entry in sl_entries:
        for (y, x, t) in text_items:
            if 88 < x < 200 and abs(y - entry["y"]) < 20:
                if t not in ("CANDIDATE NAME","MOTHER NAME","FATHER NAME") and not t.startswith("Fee"):
                    entry["name"] = t
                    break

    print(f"Page {page_num+1:2d}: {len(sl_entries)} students, {len(photo_imgs)} photos", end="")

    # Check if any photos are at very top of page (orphan = from prev page's split student)
    orphan_photos = [i for i in photo_imgs if i["bbox"][1] < 60]
    if orphan_photos:
        print(f"  [!] {len(orphan_photos)} orphan photo(s) at top (y<60)", end="")

    # Check if any students from this page have no matching photo
    for entry in sl_entries:
        matched = any(abs(i["bbox"][1] - entry["y"]) < 150 for i in photo_imgs)
        if not matched:
            print(f"\n    [SPLIT] SL {entry['sl']:05d} ({entry.get('name','?')}) has no photo on this page", end="")

    print()

doc.close()
