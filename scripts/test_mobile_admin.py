from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})

    # Login
    page.goto('http://localhost:8001/login')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1000)

    # Use nth to target the right inputs (first text input = username, first password input = password)
    page.locator('input[type="text"]').fill('admin')
    page.locator('input[type="password"]').fill('admin12345678')
    page.locator('button[type="submit"]').click()
    page.wait_for_timeout(3000)

    # Navigate to mobile admin heroes
    page.goto('http://localhost:8001/m/admin/heroes')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)

    page.screenshot(path='scripts/mobile_admin_heroes.png', full_page=True)
    print("Screenshot saved to scripts/mobile_admin_heroes.png")

    browser.close()
