const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'containers');

function deletePhotoFile(filePath) {
  const fullPath = path.join(UPLOAD_DIR, path.basename(filePath));
  fs.promises.unlink(fullPath).catch(() => {});
}

module.exports = { deletePhotoFile };
