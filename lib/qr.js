const QRCode = require('qrcode');

// Returns a data: URI PNG - any phone's native camera app can scan a QR
// encoding a URL directly, so no in-app scanner is needed on our side.
function qrDataUrl(url) {
  return QRCode.toDataURL(url, { margin: 1, width: 240 });
}

module.exports = { qrDataUrl };
