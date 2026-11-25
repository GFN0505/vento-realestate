# HR and payroll

## J-HR-01 · Run monthly payroll
**Who / how often:** HR prepares, finance approves; monthly per entity.
**Starts from:** *Payroll run* → "Start October payroll" (or the HR home reminder).

**Steps**
1. Draft: employees pulled in with their pay components; changes since last month highlighted (new starters, leavers, salary changes, unpaid leave).
2. Review: gross, PAYE, pension (employee and employer), NHF, NSITF, ITF, net, per employee and totals. Variance vs last month flagged.
3. "Submit for approval" → approver approves.
4. "Mark as paid" (bank payment file export) → payslips sent by email/WhatsApp.

**Behind the scenes:** deductions computed from the statutory rules effective on the pay date; ledger posting per entity; remittance schedules (PAYE, pension, NHF, NSITF, ITF) generated with due dates.
**Watch for:** mid-month joiners and leavers (pro-rata); employee missing PFA or tax ID (warning before approval); rerun after approval (blocked; correction in next run).
**Target:** under 15 minutes for a 50-person entity. **Test:** `e2e/hr/payroll-run.spec.ts` **Status:** draft

## J-HR-02 · Record site worker attendance and pay
**Who / how often:** Site engineer daily; HR weekly.

**Steps**
1. Attendance comes from the site diary (workers by name for registered workers) or *Site workers and daily attendance* on the phone.
2. Weekly: HR opens the week, sees days × daily rate per worker, approves and exports the payment list.

**Watch for:** worker on two sites the same day (flag); cash payments (receipt photo).
**Test:** `e2e/hr/site-worker-pay.spec.ts` **Status:** draft

## J-HR-03 · Request and approve leave
**Who / how often:** Employee requests, manager approves.

**Steps**
1. *Leave requests:* type, dates (working days counted), cover person. Submit.
2. Manager approves from notifications or the *Approvals inbox*; the leave calendar updates.

**Watch for:** balance exceeded; overlapping leave in a small team (warning).
**Test:** `e2e/hr/leave.spec.ts` **Status:** draft
