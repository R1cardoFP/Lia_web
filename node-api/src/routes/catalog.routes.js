const express = require('express');
const {
  catalogo,
  detalheItem,
  datasEsgotadas,
} = require('../controllers/catalog.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');
const router = express.Router();
router.get('/catalogo', requireSanctumToken, catalogo);
router.get('/item/:id/datas-esgotadas', requireSanctumToken, datasEsgotadas);
router.get('/item/:id', requireSanctumToken, detalheItem);
module.exports = router;
