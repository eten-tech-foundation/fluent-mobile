#!/usr/bin/env python
"""
Record an AI-AGENT flow as a demo video: ask the SkyPortal chat agent to run a command,
approve it, and show the real output. Worked example: "list the pods" -> kubectl get pods -A.

REQUIRES (see SKILL.md "SkyPortal infra"): app on POSTGRES (sqlite breaks the chat message
store), app served by UVICORN/ASGI (not runserver), a connected kube host whose kubeconfig
reaches a real cluster, and ANTHROPIC_API_KEY/OPENAI_API_KEY in .env (real LLM call).

The agent is LLM-driven => NON-DETERMINISTIC. Use an imperative prompt, generous timeouts,
and expect occasional retakes.

    cd <worktree> && <venv>/bin/python record_agent_flow.py
"""
import asyncio
import os
from playwright.async_api import async_playwright

# ---- CONFIG (edit per PR) --------------------------------------------------
APP = "http://localhost:9137"
SESSION = "PUT_DJANGO_SESSIONID_HERE"
PROMPT = "Run kubectl get pods -A and show me the output"   # imperative => reliable tool choice
DONE_TEXT_JS = "document.body.textContent.includes('web-frontend') && document.body.textContent.includes('kube-system')"
HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAY_JS = open(os.path.join(HERE, "overlay.js")).read()
VIDEO_DIR = os.path.join(HERE, "video")
VIEWPORT = {"width": 1440, "height": 900}
# ---------------------------------------------------------------------------


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport=VIEWPORT, record_video_dir=VIDEO_DIR, record_video_size=VIEWPORT)
        await ctx.add_cookies([{"name": "sessionid", "value": SESSION, "domain": "localhost", "path": "/"}])
        await ctx.add_init_script(OVERLAY_JS)
        page = await ctx.new_page()

        async def cap(text, ms=0):
            await page.evaluate("(t) => window.__caption && window.__caption(t)", text)
            if ms:
                await page.wait_for_timeout(ms)

        async def glide(selector):
            el = page.locator(selector).first
            await el.wait_for(state="visible", timeout=15000)
            box = await el.bounding_box()
            await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=28)
            await page.wait_for_timeout(280)
            return el

        async def glide_click(selector):
            el = await glide(selector)
            await el.click()

        await page.goto(APP + "/agent/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2500)
        await page.evaluate("() => window.loadUserServers && window.loadUserServers()")
        await page.wait_for_timeout(800)
        try:
            await glide_click('#newChatButtonNormal')   # clean transcript
            await page.wait_for_timeout(1500)
        except Exception:
            pass

        # ---- SCOPE THE CLUSTER (the key breakthrough) -------------------------
        # The scope popover's namespace section renders async and is RACY under automation.
        # Set scope at the source instead: ChatState + a direct `set_servers` WS message.
        # selected_namespaces uses the '__all__' sentinel for cluster-wide (needed for `-A`).
        await cap("Scope the Kubernetes cluster into the chat", 500)
        res = await page.evaluate("""async () => {
            const s = window.ChatState || {};
            const avail = s.availableServers || window.currentServers || [];
            const host = avail.find(x => x.target_kind === 'kubernetes') || avail[0];
            if (!host) return { ok:false };
            s.selectedServers = [host];
            s.activeServerId = host.id;
            s.selectedNamespaces = { [host.id]: ['__all__'] };
            if (typeof connectWebSocket === 'function' && (!s.websocket || s.websocket.readyState > 1)) connectWebSocket();
            for (let i=0;i<60;i++){ if (s.websocket && s.websocket.readyState===1) break; await new Promise(r=>setTimeout(r,150)); }
            const payload = { type:'set_servers', selected_server_ids:[host.id], active_server_id: host.id, selected_namespaces: { [host.id]: ['__all__'] } };
            let sent=false; try { if (s.websocket && s.websocket.readyState===1){ s.websocket.send(JSON.stringify(payload)); sent=true; } } catch(e){}
            if (window.renderChatScopePill) window.renderChatScopePill();
            return { ok:true, host:host.hostname, ws:(s.websocket?s.websocket.readyState:'none'), sent, ns: s.selectedNamespaces[host.id] };
        }""")
        print("scope set:", res)   # expect ns: ['__all__'], sent: True
        await page.wait_for_timeout(2200)   # let the backend process set_servers

        # ---- ASK THE AGENT ----------------------------------------------------
        await cap("Ask the agent to list the pods", 700)
        el = await glide('#chatInput')
        await el.click()
        await page.keyboard.type(PROMPT, delay=42)
        await page.wait_for_timeout(700)
        await glide_click('#chatSend')

        # ---- APPROVAL GATE (LLM latency -> long timeout) ----------------------
        await cap("The agent chooses the command …", 300)
        await page.wait_for_selector('button.approval-dialog-action-btn', timeout=90000)
        await page.wait_for_timeout(1600)
        await cap("Command approval gate — approve to run", 1200)
        # Approve-once (✓). The checkmark is an icon, not literal text -> pick in JS, glide, click.
        box = await page.evaluate("""() => {
            const btns = Array.from(document.querySelectorAll('button.approval-dialog-action-btn')).filter(b=>b.offsetParent);
            let b = btns.find(x => x.textContent.trim() === '✓') || btns[btns.length-1];
            if (!b) return null; b.setAttribute('data-approve','1');
            const r = b.getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 };
        }""")
        if box:
            await page.mouse.move(box["x"], box["y"], steps=26)
            await page.wait_for_timeout(300)
            await page.evaluate("() => { const b=document.querySelector('[data-approve=\"1\"]'); if(b) b.click(); }")

        # ---- REAL OUTPUT ------------------------------------------------------
        await cap("Approved → agent runs the command on the live cluster", 500)
        await page.wait_for_function("() => " + DONE_TEXT_JS, timeout=60000)
        await page.wait_for_timeout(1500)
        try:
            await glide_click('#execution-log-panel-tab')   # show it in the Execution Log too
            await page.wait_for_timeout(700)
            await page.evaluate("() => { const es=document.querySelectorAll('.execution-log-entry'); if(es.length) es[es.length-1].scrollIntoView({block:'center'}); }")
        except Exception:
            pass
        await cap("Command executed on the cluster — output shown in-app", 4000)

        await ctx.close()
        await browser.close()
        import glob
        vids = sorted(glob.glob(VIDEO_DIR + "/*.webm"), key=os.path.getmtime)
        print("VIDEO_WEBM=" + (vids[-1] if vids else "NONE"))


asyncio.run(main())
