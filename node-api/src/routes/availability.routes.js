const express = require('express');
const { listarDisponibilidade } = require('../controllers/availability.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');

const router = express.Router();

router.get('/disponibilidade', requireSanctumToken, listarDisponibilidade);

module.exports = router;
