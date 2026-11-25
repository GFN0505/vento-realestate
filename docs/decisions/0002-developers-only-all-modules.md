# 0002 · Developers only, all ten modules in v1

- **Date:** 2026-11-25
- **Status:** accepted

## Context
The reference ERP targeted property management (rentals). The owner wants a world-class ERP for Nigerian real estate **developers**, covering the business end to end.

## Decision
Customers are developers only. All ten modules (land & title, projects & construction, sales & CRM, finance, facility & estate, HR & payroll, compliance, documents & contracts, buyer portal, executive analytics) ship in v1, each kept lean: only what a developer genuinely needs (see `docs/PRODUCT.md`, "lean choices" and "Deliberately not building").

## Consequences
- Broad scope means each module must stay small; the product-manager agent challenges anything extra.
- Rental and letting features are out of scope; post-handover estate management is in.

## Alternatives considered
- Start with sales + finance only: faster to market, but the owner chose a complete v1.
- Serve both developers and property managers: two products in one, diluting both.
