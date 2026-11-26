const express = require('express');
const { historicoReservas } = require('../controllers/reserve.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.get('/reservas/historico', requireSanctumToken, historicoReservas);

module.exports = router;
