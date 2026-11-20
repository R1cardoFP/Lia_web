const express = require('express');
const { login, me, logout } = require('../controllers/auth.controller');
const { requireSanctumToken } = require('../middleware/sanctum.middleware');
const router = express.Router();
router.post('/login', login);
router.get('/me', requireSanctumToken, me);
router.post('/logout', requireSanctumToken, logout);
module.exports = router;
