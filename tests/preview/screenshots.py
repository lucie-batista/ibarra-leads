"""Screenshot the local UI preview at desktop and phone sizes (output in data/preview)."""
import os, sys
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.environ.get("IBARRA_DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"), "preview")
URL = "file://" + os.path.join(OUT, "index.html")
tag = sys.argv[1] if len(sys.argv) > 1 else "before"

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, mobile in [("desktop", {"width": 1280, "height": 900}, False), ("phone", {"width": 390, "height": 844}, True)]:
        pg = b.new_page(viewport=vp, is_mobile=mobile, device_scale_factor=2 if mobile else 1)
        pg.goto(URL); pg.wait_for_timeout(400)
        pg.screenshot(path=f"{OUT}/{tag}-{name}-1-login.png")
        pg.fill("#passcode", "preview"); pg.click("#loginForm button"); pg.wait_for_timeout(800)
        pg.wait_for_selector(".card", state="attached")
        pg.screenshot(path=f"{OUT}/{tag}-{name}-2-list.png")
        pg.click(".card h3 >> nth=0"); pg.wait_for_selector(".detail-card h2")
        pg.screenshot(path=f"{OUT}/{tag}-{name}-3-detail.png", full_page=False)
        pg.evaluate("document.querySelector('.detail').scrollTop = 10000; window.scrollTo(0, 10000)"); pg.wait_for_timeout(100)
        pg.screenshot(path=f"{OUT}/{tag}-{name}-4-detail-bottom.png")
        pg.click("[data-act=close]"); pg.click("[data-view=visit]"); pg.wait_for_timeout(200)
        pg.click(".card h3 >> nth=0"); pg.wait_for_selector(".detail-card h2")
        pg.screenshot(path=f"{OUT}/{tag}-{name}-5-detail-noemail.png")
        pg.click("[data-act=close]"); pg.click("#templatesBtn"); pg.wait_for_selector("#tplPart")
        pg.screenshot(path=f"{OUT}/{tag}-{name}-6-templates.png")
        pg.click("[data-act=close]"); pg.click("#resultsBtn"); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{OUT}/{tag}-{name}-7-results.png")
        pg.close()
    b.close()
print("screenshots in", OUT)
