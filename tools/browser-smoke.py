#!/usr/bin/env python3
"""Smoke browser: run with a local app server running on http://localhost:3000 .
Requires Python playwright and Chromium system installation.
"""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173'
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page = browser.new_page(viewport={ 'width': 1366, 'height': 768 })
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base, wait_until='networkidle', timeout=20000)
    print('TITLE', page.title())
    print('HEADINGS', page.locator('h1,h2').all_text_contents()[:7])
    page.screenshot(path='/mnt/data/nba_smoke_desktop.png', full_page=True)
    # Responsiveness baseline
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path='/mnt/data/nba_smoke_mobile.png', full_page=True)
    print('BODY-LENGTH', len(page.locator('body').inner_text()))
    print('PAGE-ERRORS', errors)
    browser.close()
if errors: sys.exit(1)
