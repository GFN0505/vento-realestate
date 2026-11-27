# Set approval rules

An approval rule says which actions need a second person, above what amount, in which company, and who approves. Only owners can change rules. Admins and others with access to Settings can read them.

**See your rules**
Go to **Settings → Approval rules**. Each action lists its rules: when it applies ("Any amount" or "Over ₦5,000,000"), who approves ("Finance → MD", "Owner or Admin"), and which companies. Under an action with amounts, a grey line shows where approval stops: "Below ₦5,000,000: no approval needed". An action with no rule shows "No approval needed. It happens at once."

Two rules are ready for you: changing a role's permissions (an owner or admin approves) and making someone an owner (an owner approves). Inviting someone as an owner follows the same rule as making someone an owner.

**Add a rule**
1. Click **Add rule**.
2. Choose the action.
3. Choose when it applies: any amount, or over an amount.
4. Choose who approves. Add up to 3 steps; they happen in order. In each step, tap the roles that can approve it. Any one person with one of those roles approves that step.
5. Choose all companies, or only some.
6. Click **Save rule**.

Rules apply to new requests only. Requests already waiting keep the steps they started with.

**Change or delete a rule**
Click the rule, change it and click **Save rule**. To remove it, click **Delete rule** and confirm. The message has **Undo**. Every other owner is emailed when a rule is added, changed or deleted.

**Which rule applies**
A rule for the request's own company beats an "all companies" rule. If several fit, the one with the highest amount that the request is over wins. Only one rule applies.

**Always true**
- The person who asks can't approve, even if their role allows it.
- Nobody approves two steps of the same request. "Two steps of Finance" means two different people.

**If a role is greyed out**
A role can only approve in an area where it has **Approve** on its role page. Hover over the role to see why, then give it Approve first (**Settings → Roles & permissions**). Anyone whose role has Approve must use two-step sign-in. Land & legal, Project manager and Facility now do, and you'll see a banner with 7 days to set it up.

**If you see "Nobody can approve step 2"**
No one can approve that step in that company. Add a role, or give someone that role. For role changes and owner changes, if nobody else can approve, the change goes ahead and the audit log says "No one else could approve this".

**Roles in rules**
You can't delete a role that a rule uses: "Site manager approves in 2 rules. Change those rules first."

Related: *Approve or reject a request* · *Make a role that fits the job* · *Read the audit log*
