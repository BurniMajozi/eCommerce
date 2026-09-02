# Review findings remediation

This change set closes the seven findings identified against `f0802f4`.

1. **Store checkout schema:** Railway runs `npm run bootstrap:store:direct`
   before deployment. The bootstrap is idempotent and upgrades an existing
   `store_orders` table with `created_by` as well as creating a missing table.
2. **Private product cost:** `/app/catalogue` excludes cost and margin. Those
   fields are available only from `/app/catalogue/profit`, guarded by
   `commerce.manage` and AAL2. Supplier variance consumes that protected result.
3. **Transactional email:** browser requests contain only a template and a
   tenant-owned record id. The backend requires `commerce.manage` plus AAL2,
   resolves the recipient/content server-side, and rate-limits sends.
4. **Report totals:** an order without an authoritative total is returned with
   `total: null` and a data-quality marker; no monetary value is invented.
5. **PO receipt and returns:** whole-number quantities are validated; damaged
   units cannot exceed received units; quality returns cannot exceed usable
   units; return deltas reverse or restore active-site inventory.
6. **Supplier on-time score:** deliveries without both expected and received
   dates are `Unknown` and excluded from the on-time denominator.
7. **Login privacy:** every email address follows the same email-code flow. The
   compatibility status endpoint returns the same response for every input.

The store schema release step requires the existing Railway `DATABASE_URL` and
`DATABASE_SCHEMA`; it does not contain or print credentials. Hosted schema and
application deployment remain separate operational actions.
