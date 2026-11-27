const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const multer = require('multer');

const PROFILE_DIRECTORY = path.resolve(__dirname, '../../../public/profiles');
const IMAGE_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination(_request, _file, callback) {
      fs.mkdir(PROFILE_DIRECTORY, { recursive: true }, (error) => {
        callback(error, PROFILE_DIRECTORY);
      });
    },
    filename(_request, file, callback) {
      callback(null, `${randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_request, file, callback) {
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      return callback(new Error('A imagem deve ser JPEG, PNG, GIF ou WebP.'));
    }
    return callback(null, true);
  },
});

function uploadProfileImage(request, response, next) {
  upload.single('image')(request, response, (error) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
    return response.status(status).json({
      status: 'error',
      message: error.message,
    });
  });
}

module.exports = { PROFILE_DIRECTORY, uploadProfileImage };
