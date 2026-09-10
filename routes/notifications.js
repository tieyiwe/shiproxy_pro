const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).render('errors/404', { title: '404' });
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const notifications = await sql`
      SELECT * FROM notifications WHERE user_id = ${req.user.id} ORDER BY created_at DESC LIMIT 50
    `;

    res.render('notifications/index', {
      title: res.locals.t('notifications.title'),
      notifications,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/open', async (req, res, next) => {
  try {
    const [notification] = await sql`
      SELECT * FROM notifications WHERE id = ${req.params.id} AND user_id = ${req.user.id}
    `;
    if (!notification) return res.status(404).render('errors/404', { title: '404' });

    if (!notification.read_at) {
      await sql`UPDATE notifications SET read_at = now() WHERE id = ${notification.id}`;
    }

    res.redirect(notification.link || '/notifications');
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${req.user.id} AND read_at IS NULL`;
    res.redirect('/notifications');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
