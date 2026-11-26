const express = require('express');
const {
  createReservation,
  getReservationHistory,
  getReservationDetails,
} = require('../controllers/reserve.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.post('/reservas/criar', requireSanctumToken, createReservation);
router.get('/reservas/historico', requireSanctumToken, getReservationHistory);
router.get('/reservas/:id', requireSanctumToken, getReservationDetails);

module.exports = router;
