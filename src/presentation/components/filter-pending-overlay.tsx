/**
 * Shown while a filter change (comparison period, reporting period, channel,
 * SKU, location) is still waiting on the server render. The controls update
 * optimistically, so without this the page looks finished while it is still
 * showing the previous period's numbers.
 *
 * The appearance is delayed in CSS so fast navigations never flash it.
 */
export function FilterPendingOverlay() {
  return (
    <div className="filter-pending-overlay" role="status">
      <span className="filter-pending-spinner" aria-hidden="true" />
      <span>Updating dashboard…</span>
    </div>
  );
}
