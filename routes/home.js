const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('home', { title: null });
});

module.exports = router;
