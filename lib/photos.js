const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');

// `subdir` must match whatever middleware/upload.js's makeUploader stored
// the file under (e.g. 'containers', 'packages').
function deletePhotoFile(subdir, filePath) {
  const fullPath = path.join(UPLOADS_ROOT, subdir, path.basename(filePath));
  fs.promises.unlink(fullPath).catch(() => {});
}

module.exports = { deletePhotoFile };
