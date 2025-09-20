# NHS Medicines Extractor

## Problem Statement

### Criteria
The NHS has a list of medicines. Your mission, should you choose to accept it, is to extract this information into a JSON bundle.  

The JSON bundle should consist of a **map of objects**, where:
- The **key** is the medication name.
- The **value** is an object containing details about that medication.

For your submission, please include both your **code** and the **JSON bundle**.  

You may use any language or framework, though we recommend **JavaScript/TypeScript with Playwright or Puppeteer**.

---

## Quick Start

```bash
npm install playwright
node extract.js
```

# What It Does
- Scrapes all medicines A–Z from NHS Medicines

Creates nhs-medicines.json with:
- Medicine descriptions and brand names
- Dosage instructions
- Side effects
- Who can/cannot take it
- Pregnancy information
- Drug interactions
- FAQs


## Output

```json
{
  "MedicineName": {
    "otherBrandNames": [],
    "about": {
      "summary": "",
      "keyFacts": []
    },
    "whoCanTake": "",
    "whoCannotTake": [],
    "howAndWhenToTake": {
      "dosage": "",
      "howToTake": "",
      "missedDose": "",
      "overdose": ""
    },
    "sideEffects": {
      "commonSideEffects": [],
      "seriousAllergicReaction": []
    },
    "pregnancyBreastFeedingAndFertility": {
      "pregnancy": "",
      "breastfeeding": "",
      "fertility": ""
    },
    "cautionWithOtherMedicines": [],
    "commonQuestionsData": []
  }
}

```
