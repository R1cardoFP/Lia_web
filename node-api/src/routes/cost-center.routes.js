const express = require('express');
const { listarCentrosCusto } = require('../controllers/cost-center.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.get('/centros-custo', requireSanctumToken, listarCentrosCusto);

module.exports = router;
