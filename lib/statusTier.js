// Small tier system so status-badge styling doesn't need one hardcoded CSS
// class per literal status value as more statuses are added over time.
const STATUS_TIERS = {
  open: 'success',
  closing_soon: 'warning',
  full: 'neutral',
  closed: 'danger',
};

function statusTier(status) {
  return STATUS_TIERS[status] || 'neutral';
}

module.exports = { STATUS_TIERS, statusTier };
