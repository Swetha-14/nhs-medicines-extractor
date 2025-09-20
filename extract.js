const { chromium } = require('playwright');
const fs = require('fs');


function sanitizeTitle(title, existingTitles = {}) {
    let base = (title && title.trim()) ? title.replace(/[<>:"/\\|?*]/g, '-').trim() : 'Unknown Medicine';
    let count = 1;
    let finalTitle = base;

    while (existingTitles[finalTitle]) {
        finalTitle = `${base} (${count})`;
        count++;
    }

    return finalTitle;
}

function extractBasicMedicineInfo() {

    // Title
    const outerSpan = document.querySelector('h1 span[role="text"]');
    const title = outerSpan?.childNodes[0]?.textContent.trim() || document.querySelector('h1')?.textContent.trim() || 'Unknown Medicine';

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


    // Sub Links 
    const subLinks = {};
    const linksList = document.querySelector('ul.nhsuk-hub-key-links.beta-hub-key-links');
    if (linksList) {
        const allLinks = Array.from(linksList.querySelectorAll('a'));

        allLinks.forEach(link => {
            const text = link.textContent.toLowerCase();
            const href = link.getAttribute('href');

            if (href) {
                if (text.includes('about')) {
                    subLinks.about = href;
                } else if (text.includes('who can and cannot')) {
                    subLinks.whoCanTake = href;
                } else if (text.includes('side effects')) {
                    subLinks.sideEffects = href;
                } else if (text.includes('pregnancy')) {
                    subLinks.pregnancy = href;
                } else if (text.includes('taking') && text.includes('other medicines')) {
                    subLinks.otherMedicines = href;
                } else if (text.includes('common questions')) {
                    subLinks.commonQuestions = href;
                } else if (text.includes('how and when')) {
                    subLinks.howAndWhen = href;
                }
            }
        });
    }

    return { title, otherBrandNames, subLinks };

}

function extractAboutData() {
    const gridRows = document.querySelectorAll('.nhsuk-grid-row');

    if (gridRows.length >= 2) {
        const secondGridRow = gridRows[1];
        const sections = secondGridRow.querySelectorAll('section');

        let summary = '';
        let keyFacts = [];

        if (sections.length >= 2) {
            summary = sections[0].textContent.trim();

            const ul = sections[1].querySelector('ul');
            if (ul) {
                const listItems = ul.querySelectorAll('li');
                keyFacts = Array.from(listItems).map(li => li.textContent.trim());
            }
        }

        return { summary, keyFacts };
    }

    return { summary: '', keyFacts: [] };
}


function extractWhoCanTakeData() {
    let whoCanTake = '';
    let whoCannotTake = [];

    // Who can take
    const whoSection = document.querySelector('h2#who-its-for');
    if (whoSection && whoSection.nextElementSibling) {
        whoCanTake = whoSection.nextElementSibling.textContent.trim();
    }

    // Who cannot take
    const firstUl = document.querySelector('article ul');
    if (firstUl) {
        whoCannotTake = Array.from(firstUl.querySelectorAll('li'))
            .map(li => li.textContent.trim());
    }

    return { whoCanTake, whoCannotTake };
}


function extractHowAndWhenData() {
    let dosage = '';
    let howToTake = '';
    let howLong = '';
    let missedDose = '';
    let overdose = '';

    const h2Headings = document.querySelectorAll('h2, h3');
    h2Headings.forEach(heading => {
        const headingText = heading.textContent.toLowerCase();
        let content = [];
        let nextElement = heading.nextElementSibling;

        while (nextElement && !nextElement.matches('h2, h3')) {
            if (nextElement.textContent.trim()) {
                content.push(nextElement.textContent.trim());
            }
            nextElement = nextElement.nextElementSibling;
        }

        const subText = content.join(' ').replace(/\s+/g, ' ').trim();

        if (headingText.includes('dosage') || headingText.includes('how much')) {
            dosage = subText;
        } else if (headingText.includes('how to take') || headingText.includes('how to apply') || headingText.includes('how to use')) {
            howToTake = subText;
        } else if (headingText.includes('how long')) {
            howLong = subText;
        } else if (headingText.includes('forget') || headingText.includes('miss')) {
            missedDose = subText;
        } else if (headingText.includes('too much') || headingText.includes('overdose')) {
            overdose = subText;
        }
    });

    return { dosage, howToTake, howLong, missedDose, overdose };
}

function extractSideEffectsData() {
    let commonSideEffects = [];
    let seriousSideEffects = [];
    let seriousAllergicReaction = [];

    const detailsElements = document.querySelectorAll('details.nhsuk-details');
    detailsElements.forEach(detail => {
        const summary = detail.querySelector('.nhsuk-details__summary-text')?.textContent.trim();
        const content = detail.querySelector('.nhsuk-details__text')?.textContent.trim();

        if (summary && content) {
            commonSideEffects.push({ effect: summary, advice: content });
        }
    });

    const seriousHeading = Array.from(document.querySelectorAll('h2, h3')).find(h => h.textContent.toLowerCase().includes('serious side effects'));

    if (seriousHeading) {
        let nextElement = seriousHeading.nextElementSibling;

        while (nextElement) {
            if (nextElement.matches('h2, h3, h4') && nextElement.textContent.toLowerCase().includes('serious allergic')) {
                break;
            }
            const items = nextElement.querySelectorAll('li');
            if (items.length > 0) {
                seriousSideEffects.push(...Array.from(items).map(li => li.textContent.trim()));
            }

            nextElement = nextElement.nextElementSibling;
        }
    }

    const allergyHeading = Array.from(document.querySelectorAll('h2, h3')).find(h =>
        h.textContent.toLowerCase().includes('serious allergic reaction')
    );

    if (allergyHeading) {
        let nextElement = allergyHeading.nextElementSibling;

        while (nextElement) {
            if (nextElement.matches('.nhsuk-card--care--emergency')) {
                const items = nextElement.querySelectorAll('li');
                if (items.length > 0) {
                    seriousAllergicReaction.push(...Array.from(items).map(li => li.textContent.trim()));
                }
            }

            if (nextElement.matches('h2, h3')) {
                break;
            }
            nextElement = nextElement.nextElementSibling;
        }
    }

    return { commonSideEffects, seriousSideEffects, seriousAllergicReaction };
}

function extractPregnancyData() {
    let pregnancy = '';
    let breastfeeding = '';
    let fertility = '';

    const h2Headings = document.querySelectorAll('h2');
    h2Headings.forEach(heading => {
        const headingText = heading.textContent.toLowerCase();

        let content = [];
        let nextElement = heading.nextElementSibling;

        while (nextElement && !nextElement.matches('h2, h3')) {
            if (nextElement.textContent.trim()) {
                content.push(nextElement.textContent.trim());
            }
            nextElement = nextElement.nextElementSibling;
        }

        const sectionText = content.join(' ').replace(/\s+/g, ' ').trim();

        if (headingText.includes('pregnancy') && !headingText.includes('breastfeeding')) {
            pregnancy = sectionText;
        } else if (headingText.includes('breastfeeding')) {
            breastfeeding = sectionText;
        } else if (headingText.includes('fertility')) {
            fertility = sectionText;
        }
    });

    return { pregnancy, breastfeeding, fertility };
}

function extractOtherMedicinesData() {
    const firstUl = document.querySelector('article section ul');

    if (firstUl) {
        const items = firstUl.querySelectorAll('li');
        return Array.from(items).map(li => li.textContent.trim());
    }

    return [];
}

function extractAboutCommonQuestions() {
    const details = document.querySelectorAll('details.nhsuk-details');
    return Array.from(details).map(detail => {
        const question = detail.querySelector('.nhsuk-details__summary-text')?.textContent.trim();
        const answer = detail.querySelector('.nhsuk-details__text')?.textContent.trim();
        return { question, answer };
    });
}


async function extractingNHSMedicineData() {
    const browser = await chromium.launch();
    const newTabPage = await browser.newPage();
    const medicinesData = {};

    await newTabPage.goto('https://www.nhs.uk/medicines/');

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const letter of letters) {

        const letterLinks = await newTabPage.evaluate((letter) => {
            try {

                const heading = document.querySelector(`h2#${letter}`);
                if (!heading) return [];

                const list = heading.nextElementSibling;
                if (!list) return [];

                const links = list.querySelectorAll('a');
                return Array.from(links).map(link => link.href);

            } catch (error) {
                console.error(`Error extracting links for letter ${letter}:`, error);
                return [];
            }

        }, letter)

        const batchSize = 3;
        for (let i = 0; i < letterLinks.length; i += batchSize) {
            const batch = letterLinks.slice(i, i + batchSize);

            const batchPromises = batch.map(link => processMedicine(browser, link));
            const results = await Promise.allSettled(batchPromises);

            results.forEach((result, idx) => {
                if (result.status === 'fulfilled' && result.value) {
                    const { title, data } = result.value;
                    const sanitizedTitle = sanitizeTitle(title, medicinesData);
                    medicinesData[sanitizedTitle] = data;
                }
            });
        }

    }

    await newTabPage.close();
    fs.writeFileSync('nhs-medicines.json', JSON.stringify(medicinesData, null, 4));
    await browser.close()

}

async function processMedicine(browser, link) {
    const page = await browser.newPage();

    try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('h1', { timeout: 5000 });
        await page.waitForTimeout(500);
        // rate limiting

        const data = await page.evaluate(extractBasicMedicineInfo);


        // About 
        let aboutData = { summary: '', keyFacts: [] };
        if (data.subLinks.about) {
            try {
                await page.goto(data.subLinks.about, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('.nhsuk-grid-row', { timeout: 5000 });
                await page.waitForTimeout(500);

                aboutData = await page.evaluate(extractAboutData);

            } catch (error) {
                console.error(`Error extracting about data for ${data.title}:`, error.message);
            }
        }

        // Who can take it and who cannot take it
        let whoCanTakeData = {
            whoCanTake: '',
            whoCannotTake: []
        };

        if (data.subLinks.whoCanTake) {

            try {
                await page.goto(data.subLinks.whoCanTake, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('h2#who-its-for, article ul', { timeout: 5000 });
                await page.waitForTimeout(500);

                whoCanTakeData = await page.evaluate(extractWhoCanTakeData);

            } catch (error) {
                console.error(`Error extracting who can take data for ${data.title}:`, error.message);
            }
        }

        // How and when to take it
        let howAndWhenData = {
            dosage: '',
            howToTake: '',
            howLong: '',
            missedDose: '',
            overdose: ''
        };

        if (data.subLinks.howAndWhen) {
            try {
                await page.goto(data.subLinks.howAndWhen, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('h2', { timeout: 5000 });
                await page.waitForTimeout(500);

                howAndWhenData = await page.evaluate(extractHowAndWhenData);
            } catch (error) {
                console.error(`Error extracting how and when data for ${data.title}:`, error.message);
            }
        }

        // Side effects
        let sideEffects = {
            commonSideEffects: [],
            seriousSideEffects: [],
            seriousAllergicReaction: []
        };

        if (data.subLinks.sideEffects) {
            try {
                await page.goto(data.subLinks.sideEffects, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('details.nhsuk-details, h2', { timeout: 5000 });
                await page.waitForTimeout(500);

                sideEffects = await page.evaluate(extractSideEffectsData);

            } catch (error) {
                console.error(`Error extracting side effects data for ${data.title}:`, error.message);
            }
        }

        // Pregnancy, BreastFeeding, Fertility
        let pregnancyData = {
            pregnancy: '',
            breastfeeding: '',
            fertility: ''
        };
        if (data.subLinks.pregnancy) {
            try {
                await page.goto(data.subLinks.pregnancy, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('h2', { timeout: 5000 });
                await page.waitForTimeout(500);

                pregnancyData = await page.evaluate(extractPregnancyData);

            } catch (error) {
                console.error(`Error extracting pregnancy data for ${data.title}:`, error.message);
            }
        }

        // Other Medicines
        let otherMedicinesData = [];

        if (data.subLinks.otherMedicines) {
            try {
                await page.goto(data.subLinks.otherMedicines, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('main ul, article ul', { timeout: 5000 });
                await page.waitForTimeout(500);

                otherMedicinesData = await page.evaluate(extractOtherMedicinesData);
            } catch (error) {
                console.error(`Error extracting other medicines data for ${data.title}:`, error.message);
            }
        }

        // Common Questions
        let commonQuestionsData = [];

        if (data.subLinks.commonQuestions) {
            try {
                await page.goto(data.subLinks.commonQuestions, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('details.nhsuk-details', { timeout: 5000 });
                await page.waitForTimeout(500);

                commonQuestionsData = await page.evaluate(extractAboutCommonQuestions);
            } catch (error) {
                console.error(`Error extracting common questions data for ${data.title}:`, error.message);
            }

        }

        const medicineData = {
            otherBrandNames: data.otherBrandNames,
            about: aboutData,
            ...whoCanTakeData,
            howAndWhenToTake: howAndWhenData,
            sideEffects: sideEffects,
            pregnancyBreastFeedingAndFertility: pregnancyData,
            cautionWithOtherMedicines: otherMedicinesData,
            commonQuestionsData: commonQuestionsData
        }

        return { title: data.title, data: medicineData };

    } catch (error) {
        console.error(`Failed to process medicine at ${link}:`, error.message);
        return null;
    } finally {
        await page.close();
    }
}

extractingNHSMedicineData().catch(console.error);