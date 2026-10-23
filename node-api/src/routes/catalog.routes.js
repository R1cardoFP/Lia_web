const express = require('express');
const { catalogo, detalheItem } = require('../controllers/catalog.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');
const router = express.Router();
router.get('/catalogo', requireSanctumToken, catalogo);
router.get('/item/:id', requireSanctumToken, detalheItem);
module.exports = router;
