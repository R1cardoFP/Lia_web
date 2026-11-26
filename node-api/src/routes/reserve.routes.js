const express = require('express');
const { historicoReservas, cancelarReserva } = require('../controllers/reserve.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.get('/reservas/historico', requireSanctumToken, historicoReservas);
router.post('/reservas/:id/cancelar', requireSanctumToken, cancelarReserva);

module.exports = router;
