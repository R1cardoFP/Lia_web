const express = require('express');
const { estatisticas, atualizarPerfil } = require('../controllers/profile.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.get('/perfil/estatisticas', requireSanctumToken, estatisticas);
router.post('/perfil/edit', requireSanctumToken, atualizarPerfil);

module.exports = router;
