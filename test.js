const { chromium } = require('playwright');
const fs = require('fs');

async function testExtracting() {
    const browser = await chromium.launch({ headless: false });
    const newTabPage = await browser.newPage();
    const medicinesData = {};

    await newTabPage.goto('https://www.nhs.uk/medicines/');

    const letters = 'abc'.split('');
    for (const letter of letters) {

        medicinesData[letter.toUpperCase()] = {}

        const letterLinks = await newTabPage.evaluate((letter) => {

            const heading = document.querySelector(`h2#${letter}`);
            if (!heading) return [];

            const list = heading.nextElementSibling;
            if (!list) return [];

            const links = list.querySelectorAll('a');
            return Array.from(links).map(link => link.href);

        }, letter)

        for (const link of letterLinks) {
            await newTabPage.goto(link);

            const data = await newTabPage.evaluate(() => {

                // Title
                const outerSpan = document.querySelector('h1 span[role="text"]');
                const title = outerSpan?.childNodes[0]?.textContent.trim() || document.querySelector('h1')?.textContent.trim() || 'No title';

                // Other Brand Names
                const container = document.querySelector('.nhsuk-u-reading-width');
                let otherBrandNames = [];
                if (container) {
                    const brandText = Array.from(container.querySelectorAll('*'))
                        .map(el => el.textContent)
                        .find(text => text.toLowerCase().includes('brand name'));

                    if (brandText) {
                        const names = brandText.split(':')[1]?.split('.')[0];

                        if (names) {
                            otherBrandNames = names.split(',').map(n => n.trim());
                        }
                    }
                }

                // Page Links - About
                let aboutPageLink = '';
                const linksList = document.querySelector('ul.nhsuk-hub-key-links.beta-hub-key-links');
                if (linksList) {
                    const aboutEl = Array.from(linksList.querySelectorAll('a'))
                        .find(a => a.textContent.toLowerCase().includes('about'));
                    if (aboutEl) {
                        aboutPageLink = aboutEl.getAttribute('href');
                    }
                }
                return { title, otherBrandNames, aboutPageLink };

            })

            medicinesData[letter.toUpperCase()][data.title] = {
                otherBrandNames: data.otherBrandNames,
                aboutPageLink: data.aboutPageLink
            }

        }

        await newTabPage.goto('https://www.nhs.uk/medicines/');
    }


    fs.writeFileSync('nhs-medicines.json', JSON.stringify(medicinesData, null, 2));
    await browser.close()

}

testExtracting().catch(console.error);