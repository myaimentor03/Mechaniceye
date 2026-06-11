# Drivable Seed Knowledge Base V1

## Purpose

This directory contains original, structured starting data for Drivable symptom intake, evidence requests, roadside risk screening, decision support, follow-up questions, repair-versus-sell review, buyer risk review, and seller disclosure support.

The CSV files are convenient for workbook review and future import. The matching JSON files contain the same records for future application, prompt, report, and workflow use.

## Intended Uses

- Prototype future database imports and controlled taxonomies.
- Support consistent AI prompts and customer questions.
- Organize report-generation and workflow rules.
- Give human reviewers a versioned starting point for refinement.
- Connect future case outcomes to the categories, evidence, and decisions that were used.

## What This Is Not

- It is not a certified repair database.
- It is not an OEM service manual, diagnostic tree, labor guide, or parts catalog.
- It is not a substitute for physical inspection, professional testing, emergency services, or qualified repair.
- It does not confirm a cause, repair, safety condition, title status, legal requirement, price, or outcome.
- It must not be presented as comprehensive or automatically correct.

## Source and Originality

This seed content was written as general product taxonomy. It was not copied from OEM procedures, proprietary repair databases, paid manuals, or copyrighted diagnostic trees. It intentionally avoids step-by-step repair procedures and vehicle-specific specifications.

## Safe Use Rules

1. Treat customer statements, seller claims, remote media, and AI output as unverified until supported by appropriate evidence.
2. Use cautious language such as "possible," "based on the information provided," and "in-person inspection recommended."
3. Never use a seed row as driving clearance or a certified diagnosis.
4. Escalate control loss, braking risk, fire or fuel risk, overheating, severe leaks, wheel or tire failure, severe electrical symptoms, structural concerns, title concerns, and high-cost or low-confidence decisions.
5. Never ask a customer to drive, recreate a dangerous symptom, crawl under a vehicle, touch hot or moving parts, open a pressurized system, approach smoke or fuel, or record while driving.
6. Keep internal statuses and draft speculation out of customer-facing messages until the required review is complete.
7. Apply privacy, consent, access, retention, correction, and deletion rules before using real customer records.

## Improvement Loop

These records are a versioned baseline, not a finished knowledge system. Future permissioned case outcomes should improve the taxonomy by linking the original observation, available evidence, recommendation, confidence, human review, customer action, inspection result, repair or transaction outcome, and source quality.

Customer-reported outcomes must remain distinct from reviewer-confirmed or document-supported outcomes. Changes derived from real cases should be evaluated for safety, usefulness, and confidence calibration before they affect production guidance.

## File Pairs

Each `drivable_*_seed_v1.csv` file has a matching array-of-objects file in `json/`. Run `npm run validate:seed-data` to check JSON parsing, row presence, required fields, and unique primary IDs.
