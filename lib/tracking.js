function trackingUrl(containerNumber) {
  if (!containerNumber) return null;
  return `https://www.track-trace.com/container?number=${encodeURIComponent(containerNumber)}`;
}

module.exports = { trackingUrl };
