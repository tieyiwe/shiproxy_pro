const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
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
      const ext = path.extname(file.originalname).toLowerCase();
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
