const { chromium } = require('playwright');


async function testExtracting() {
    const browser = await chromium.launch({ headless: false });
    const newTabPage = await browser.newPage();

    await newTabPage.goto('https://www.nhs.uk/medicines/');
    const pageTitle = await newTabPage.title()

    console.log("Page Title", pageTitle);
    await browser.close()

}

testExtracting().catch(console.error);