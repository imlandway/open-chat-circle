import { chromium } from 'playwright';

export class BrowserController {
  constructor({ headless }) {
    this.headless = headless;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async ensurePage() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1440, height: 960 },
      });
    }
    if (!this.page) {
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  async navigate(url) {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return {
      url: page.url(),
      title: await page.title(),
    };
  }

  async click(selector) {
    const page = await this.ensurePage();
    await page.locator(selector).first().click();
    return {
      url: page.url(),
      title: await page.title(),
      selector,
    };
  }

  async type(selector, text, { clear = true } = {}) {
    const page = await this.ensurePage();
    const locator = page.locator(selector).first();
    if (clear) {
      await locator.fill('');
    }
    await locator.type(text);
    return {
      url: page.url(),
      selector,
      length: text.length,
    };
  }

  async screenshot(targetPath) {
    const page = await this.ensurePage();
    await page.screenshot({
      path: targetPath,
      fullPage: true,
    });
    return {
      url: page.url(),
      path: targetPath,
      title: await page.title(),
    };
  }
}
