const express = require('express');
const { estatisticas } = require('../controllers/profile.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.get('/perfil/estatisticas', requireSanctumToken, estatisticas);

module.exports = router;
