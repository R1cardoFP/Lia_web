const express = require('express');
const {
  createReservation,
  getReservationHistory,
} = require('../controllers/reserve.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.post('/reservas/criar', requireSanctumToken, createReservation);
router.get('/reservas/historico', requireSanctumToken, getReservationHistory);

module.exports = router;
