import fitz  # PyMuPDF
import json

PDF_PATH = "class 9 checklist with photos (1).pdf"
doc = fitz.open(PDF_PATH)

# Deeper analysis: check image positions on page 1 and 3 (have multiple images)
for page_num in [0, 2]:
    page = doc[page_num]
    print(f"\n=== PAGE {page_num+1} ===")
    
    # Get all image instances with their positions on the page
    img_list = page.get_image_info(xrefs=True)
    print(f"  Image instances with positions:")
    for img in img_list:
        print(f"    xref={img.get('xref')}, bbox={img.get('bbox')}, size={img.get('width')}x{img.get('height')}")
    
    # Get text dict to find student names and their Y positions
    blocks = page.get_text("blocks")
    student_blocks = []
    for b in blocks:
        x0, y0, x1, y1, text, block_no, block_type = b
        # Look for SL.NO patterns (5-digit numbers like 00001)
        lines = text.strip().split('\n')
        for line in lines:
            line = line.strip()
            if line and line.isdigit() and len(line) == 5:
                print(f"  SL.NO block: '{line}' at y={y0:.0f}")
            # Look for Male/Female
            if 'Male' in line or 'Female' in line:
                print(f"  SEX block: '{line}' at y={y0:.0f}")
            # Candidate names (text in the name column x=96-178)
            if 90 < x0 < 180 and len(line) > 2:
                print(f"  Name-area block: '{line}' at ({x0:.0f},{y0:.0f})")

doc.close()
