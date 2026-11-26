const express = require('express');
const { createReservation } = require('../controllers/reserve.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.post('/reservas/criar', requireSanctumToken, createReservation);

module.exports = router;
