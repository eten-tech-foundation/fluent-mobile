#!/usr/bin/env python
"""
Record a DETERMINISTIC UI flow as a demo video (Playwright native video + injected cursor/captions).
Worked example: SkyPortal "edit a Kubernetes host + rotate credential" (PR #3087).

Adapt the CONFIG block and the FLOW section for your PR. Run with the project venv's python
from the worktree dir (so relative asset paths + .env resolve). Output: a .webm in VIDEO_DIR
(post-process to mp4 with postprocess.sh).

    cd <worktree> && <venv>/bin/python record_ui_flow.py
"""
import asyncio
import os
from playwright.async_api import async_playwright

# ---- CONFIG (edit per PR) --------------------------------------------------
APP = "http://localhost:9137"
SESSION = "PUT_DJANGO_SESSIONID_HERE"          # mint via SessionStore (see SKILL.md)
HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAY_JS = open(os.path.join(HERE, "overlay.js")).read()
VIDEO_DIR = os.path.join(HERE, "video")
VIEWPORT = {"width": 1440, "height": 900}
# ---------------------------------------------------------------------------


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)   # headless is fine; the injected cursor renders in-page
        ctx = await browser.new_context(viewport=VIEWPORT, record_video_dir=VIDEO_DIR, record_video_size=VIEWPORT)
        await ctx.add_cookies([{"name": "sessionid", "value": SESSION, "domain": "localhost", "path": "/"}])
        await ctx.add_init_script(OVERLAY_JS)
        page = await ctx.new_page()

        async def cap(text, ms=0):
            await page.evaluate("(t) => window.__caption && window.__caption(t)", text)
            if ms:
                await page.wait_for_timeout(ms)

        async def glide(selector):
            """Move the cursor smoothly to an element's centre and return the locator."""
            el = page.locator(selector).first
            await el.wait_for(state="visible", timeout=15000)
            box = await el.bounding_box()
            await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=28)
            await page.wait_for_timeout(280)
            return el

        async def glide_click(selector):
            el = await glide(selector)
            await el.click()

        async def glide_type(selector, text, clear=True):
            el = await glide(selector)
            await el.click()
            if clear:
                await page.keyboard.press("Control+A")
                await page.keyboard.press("Delete")
            await page.keyboard.type(text, delay=50)   # visible typing

        # ---- SETUP ----
        await page.goto(APP + "/agent/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2200)
        await page.evaluate("""() => {   // belt-and-suspenders tour removal
            document.querySelectorAll('[id*="tour"],[class*="tour"]').forEach(el => {
                const s = (el.id || '') + ' ' + (el.className || '');
                if (/overlay|backdrop|active/i.test(s)) el.remove();
            });
        }""")
        await page.evaluate("() => window.loadUserServers && window.loadUserServers()")  # app-specific hydrate
        await page.wait_for_timeout(900)
        await page.mouse.move(700, 520, steps=8)   # park the cursor on-screen

        # ==== FLOW (edit per PR) =================================================
        # GOTCHAS baked in below:
        #  - wait for a CLOSED modal with state='hidden' (default 'visible' never matches a .hidden node)
        #  - custom checkboxes with a tick-span overlay intercept real clicks -> use el.evaluate('e=>e.click()')
        await cap("Kubernetes host in the sidebar", 2400)

        await cap("Open the edit modal", 700)
        await glide_click('.server-item[data-server-name="gpu-cluster-01"] button[title="Edit Server"]')
        await page.wait_for_selector('#serverDetailsModal:not(.hidden)', timeout=8000)
        await page.wait_for_timeout(2200)

        await cap("Rename, then Save", 700)
        await glide_type('#modalHostName', 'gpu-cluster-01-west')
        await page.wait_for_timeout(800)
        await glide_click('#saveServerDetails')
        await page.wait_for_selector('#serverDetailsModal', state='hidden', timeout=8000)  # closed, not visible
        await page.wait_for_timeout(2500)
        # ========================================================================

        await ctx.close()
        await browser.close()
        import glob
        vids = sorted(glob.glob(VIDEO_DIR + "/*.webm"), key=os.path.getmtime)
        print("VIDEO_WEBM=" + (vids[-1] if vids else "NONE"))


asyncio.run(main())
