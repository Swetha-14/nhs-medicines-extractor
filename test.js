const { chromium } = require('playwright');
const fs = require('fs');

async function extractingNHSMedicineData() {
    const browser = await chromium.launch({ headless: false });
    const newTabPage = await browser.newPage();
    const medicinesData = {};

    await newTabPage.goto('https://www.nhs.uk/medicines/');

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const letter of letters) {

        medicinesData[letter.toUpperCase()] = {}

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

        for (const link of letterLinks) {
            try {

                await newTabPage.goto(link, { waitUntil: 'networkidle' });
                await newTabPage.waitForSelector('h1', { timeout: 5000 });

                // rate limiting

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

                })

                // About 
                let aboutData = { summary: '', keyFacts: [] };
                if (data.subLinks.about) {

                    try {

                        await newTabPage.goto(data.subLinks.about, { waitUntil: 'domcontentloaded' });
                        await newTabPage.waitForSelector('.nhsuk-grid-row', { timeout: 5000 });

                        aboutData = await newTabPage.evaluate(() => {
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
                        });

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
                        await newTabPage.goto(data.subLinks.whoCanTake, { waitUntil: 'domcontentloaded' });
                        await newTabPage.waitForSelector('h2#who-its-for, article ul', { timeout: 5000 });

                        whoCanTakeData = await newTabPage.evaluate(() => {
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
                        });

                    } catch (error) {
                        console.error(`Error extracting who can take data for ${data.title}:`, error.message);
                    }


                }

                // How and when to take it
                // nEED 
                let howAndWhenData = {
                    dosage: '',
                    howToTake: '',
                    howLong: '',
                    missedDose: '',
                    overdose: ''
                };

                if (data.subLinks.howAndWhen) {
                    try {
                        await newTabPage.goto(data.subLinks.howAndWhen, { waitUntil: 'domcontentloaded' });
                        await newTabPage.waitForSelector('h2', { timeout: 5000 });

                        howAndWhenData = await newTabPage.evaluate(() => {
                            let dosage = '';
                            let howToTake = '';
                            let howLong = '';
                            let missedDose = '';
                            let overdose = '';

                            const h2Headings = document.querySelectorAll('h2');
                            h2Headings.forEach(heading => {
                                const headingText = heading.textContent.toLowerCase();
                                let content = [];
                                let nextElement = heading.nextElementSibling;

                                while (nextElement && !nextElement.matches('h2')) {
                                    if (nextElement.textContent.trim()) {
                                        content.push(nextElement.textContent.trim());
                                    }
                                    nextElement = nextElement.nextElementSibling;
                                }

                                const subText = content.join(' ');

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
                        });


                    } catch (error) {
                        console.error(`Error extracting how and when data for ${data.title}:`, error.message);
                    }
                }

                // serious need
                // Side effects
                let sideEffects = {
                    commonSideEffects: [],
                    seriousSideEffects: [],
                    seriousAllergicReaction: []
                };

                if (data.subLinks.sideEffects) {
                    try {
                        await newTabPage.goto(data.subLinks.sideEffects, { waitUntil: 'domcontentloaded' });
                        await newTabPage.waitForSelector('details.nhsuk-details, h2', { timeout: 5000 });

                        sideEffects = await newTabPage.evaluate(() => {
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

                            const headingText = Array.from(document.querySelectorAll('h2')).find(p => p.textContent.toLowerCase().includes('serious side effects'));

                            if (headingText) {
                                let nextElement = headingText.nextElementSibling;
                                while (nextElement && !nextElement.matches('h2, h3')) {
                                    if (nextElement.tagName.toLowerCase() === 'ul') {
                                        const items = nextElement.querySelectorAll('li');
                                        seriousSideEffects = Array.from(items).map(li => li.textContent.trim());
                                        break;
                                    }
                                    nextElement = nextElement.nextElementSibling;
                                }
                            }

                            const allergySection = document.querySelector('.nhsuk-card--care--emergency');
                            if (allergySection) {
                                const ul = allergySection.querySelector('ul');
                                if (ul) {
                                    const items = ul.querySelectorAll('li');
                                    seriousAllergicReaction = Array.from(items).map(li => li.textContent.trim());
                                }
                            }

                            return { commonSideEffects, seriousSideEffects, seriousAllergicReaction };
                        });

                    } catch (error) {
                        console.error(`Error extracting side effects data for ${data.title}:`, error.message);
                    }
                }

                // fertility need 
                // Pregnancy, BreastFeeding, Fertility
                let pregnancyData = {
                    pregnancy: '',
                    breastfeeding: '',
                    fertility: ''
                };
                if (data.subLinks.pregnancy) {
                    try {
                        await newTabPage.goto(data.subLinks.pregnancy, { waitUntil: 'domcontentloaded' });
                        await newTabPage.waitForSelector('h2', { timeout: 5000 });

                        pregnancyData = await newTabPage.evaluate(() => {
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

                                const sectionText = content.join(' ');

                                if (headingText.includes('pregnancy') && !headingText.includes('breastfeeding')) {
                                    pregnancy = sectionText;
                                } else if (headingText.includes('breastfeeding')) {
                                    breastfeeding = sectionText;
                                } else if (headingText.includes('fertility')) {
                                    fertility = sectionText;
                                }
                            });

                            return { pregnancy, breastfeeding, fertility };
                        });

                    } catch (error) {
                        console.error(`Error extracting pregnancy data for ${data.title}:`, error.message);
                    }
                }

                // need if not ul
                // Other Medicines
                let otherMedicinesData = [];

                if (data.subLinks.otherMedicines) {
                    try {
                        await newTabPage.goto(data.subLinks.otherMedicines, { waitUntil: 'domcontentloaded' });
                        await newTabPage.waitForSelector('main ul, article ul', { timeout: 5000 });

                        otherMedicinesData = await newTabPage.evaluate(() => {
                            const mainContent = document.querySelector('main, article');
                            const firstUl = mainContent ? mainContent.querySelector('ul') : document.querySelector('ul');

                            if (firstUl) {
                                return Array.from(firstUl.querySelectorAll('li')).map(li => li.textContent.trim());
                            }

                            return [];
                        });
                    } catch (error) {
                        console.error(`Error extracting other medicines data for ${data.title}:`, error.message);
                    }
                }


                // Common Questions
                let commonQuestionsData = [];

                if (data.subLinks.commonQuestions) {
                    try {
                        await newTabPage.goto(data.subLinks.commonQuestions, { waitUntil: 'domcontentloaded' });
                        await newTabPage.waitForSelector('details.nhsuk-details', { timeout: 5000 });

                        commonQuestionsData = await newTabPage.evaluate(() => {
                            const details = document.querySelectorAll('details.nhsuk-details');
                            return Array.from(details).map(detail => {
                                const question = detail.querySelector('.nhsuk-details__summary-text')?.textContent.trim();
                                const answer = detail.querySelector('.nhsuk-details__text')?.textContent.trim();
                                return { question, answer };
                            });
                        });
                    } catch (error) {
                        console.error(`Error extracting common questions data for ${data.title}:`, error.message);
                    }

                }

                medicinesData[letter.toUpperCase()][data.title] = {
                    otherBrandNames: data.otherBrandNames,
                    about: aboutData,
                    whoCanTake: whoCanTakeData.whoCanTake,
                    whoCannotTake: whoCanTakeData.whoCannotTake,
                    howAndWhenToTake: howAndWhenData,
                    sideEffects: sideEffects,
                    pregnancyBreastFeedingAndFertility: pregnancyData,
                    cautionWithOtherMedicines: otherMedicinesData,
                    commonQuestionsData: commonQuestionsData
                }

            } catch (error) {
                console.error(`Failed to process medicine at ${link}:`, error.message);
            }
        }

    }


    fs.writeFileSync('nhs-medicines.json', JSON.stringify(medicinesData, null, 4));
    await browser.close()

}

extractingNHSMedicineData().catch(console.error);