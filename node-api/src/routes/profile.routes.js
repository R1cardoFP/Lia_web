const express = require('express');
const { updateProfile, estatisticas } = require('../controllers/profile.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');
const { uploadProfileImage } = require('../middleware/profile-image.middleware');

const router = express.Router();

router.post('/perfil/edit', requireSanctumToken, uploadProfileImage, updateProfile);
router.get('/perfil/estatisticas', requireSanctumToken, estatisticas);

module.exports = router;
