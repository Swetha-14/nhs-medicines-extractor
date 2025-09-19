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
                await newTabPage.goto(data.subLinks.about);

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
            }

            // Who can take it and who cannot take it
            let whoCanTakeData = {
                whoCanTake: '',
                whoCannotTake: []
            };

            if (data.subLinks.whoCanTake) {
                await newTabPage.goto(data.subLinks.whoCanTake);

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
                await newTabPage.goto(data.subLinks.howAndWhen);

                howAndWhenData = await newTabPage.evaluate(() => {
                    let dosage = '';
                    let howToTake = '';
                    let howLong = '';
                    let missedDose = '';
                    let overdose = '';

                    const headings = document.querySelectorAll('h2');
                    headings.forEach(heading => {
                        const headingText = heading.textContent.toLowerCase();
                        let content = [];
                        let nextEl = heading.nextElementSibling;

                        while (nextEl && !nextEl.matches('h2')) {
                            if (nextEl.textContent.trim()) {
                                content.push(nextEl.textContent.trim());
                            }
                            nextEl = nextEl.nextElementSibling;
                        }

                        const sectionText = content.join(' ');

                        if (headingText.includes('dosage') || headingText.includes('how much')) {
                            dosage = sectionText;
                        } else if (headingText.includes('how to take') || headingText.includes('how to apply') || headingText.includes('how to use')) {
                            howToTake = sectionText;
                        } else if (headingText.includes('how long')) {
                            howLong = sectionText;
                        } else if (headingText.includes('forget') || headingText.includes('miss')) {
                            missedDose = sectionText;
                        } else if (headingText.includes('too much') || headingText.includes('overdose')) {
                            overdose = sectionText;
                        }
                    });

                    return { dosage, howToTake, howLong, missedDose, overdose };
                });
            }

            medicinesData[letter.toUpperCase()][data.title] = {
                otherBrandNames: data.otherBrandNames,
                aboutPageLink: data.aboutPageLink,
                about: aboutData,
                whoCanTake: whoCanTakeData.whoCanTake,
                whoCannotTake: whoCanTakeData.whoCannotTake,
                howAndWhenToTake: howAndWhenData,
            }

        }

        await newTabPage.goto('https://www.nhs.uk/medicines/');
    }


    fs.writeFileSync('nhs-medicines.json', JSON.stringify(medicinesData, null, 2));
    await browser.close()

}

testExtracting().catch(console.error);