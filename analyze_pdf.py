import fitz  # PyMuPDF
import json

PDF_PATH = "class 9 checklist with photos (1).pdf"

doc = fitz.open(PDF_PATH)
print(f"Total pages: {len(doc)}")
print(f"Metadata: {doc.metadata}")
print("\n" + "="*60)

# Analyze first 3 pages
for page_num in range(min(3, len(doc))):
    page = doc[page_num]
    print(f"\n--- PAGE {page_num+1} ---")
    print(f"  Size: {page.rect}")
    
    # Extract text
    text = page.get_text("text")
    print(f"  Text (first 1000 chars):\n{text[:1000]}")
    
    # Extract images
    images = page.get_images(full=True)
    print(f"\n  Images found: {len(images)}")
    for i, img in enumerate(images[:5]):
        xref = img[0]
        base_image = doc.extract_image(xref)
        print(f"    Image {i}: xref={xref}, size={base_image['width']}x{base_image['height']}, ext={base_image['ext']}")
    
    # Extract text blocks with positions
    blocks = page.get_text("blocks")
    print(f"\n  Text blocks: {len(blocks)}")
    for b in blocks[:10]:
        x0, y0, x1, y1, text, block_no, block_type = b
        if text.strip():
            print(f"    Block at ({x0:.0f},{y0:.0f})-({x1:.0f},{y1:.0f}): {repr(text[:80])}")

doc.close()
