const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// The stored file's extension is derived from this map, never from the
// client-supplied original filename - otherwise an attacker could upload
// e.g. a `.svg` (which can embed <script>) while declaring an allowed
// mimetype, and express.static would later serve it as image/svg+xml
// based on that attacker-chosen extension, executing as a stored XSS.
const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const ALLOWED_MIME = Object.keys(MIME_EXTENSIONS);
const MAX_PHOTOS = 4;
const MAX_PACKAGE_PHOTOS = 2;

// multer's diskStorage does not create its destination directory, and these
// paths are git-ignored (they hold user uploads), so they won't exist on a
// fresh clone/deploy unless created here.
function makeUploader(subdir, maxFiles) {
  const uploadDir = path.join(__dirname, '..', 'public', 'uploads', subdir);
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = MIME_EXTENSIONS[file.mimetype] || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: maxFiles },
    fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME.includes(file.mimetype)),
  });
}

const upload = makeUploader('containers', MAX_PHOTOS);
const packageUpload = makeUploader('packages', MAX_PACKAGE_PHOTOS);

module.exports = { upload, MAX_PHOTOS, packageUpload, MAX_PACKAGE_PHOTOS };
