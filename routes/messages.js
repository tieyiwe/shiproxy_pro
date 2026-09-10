const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { MESSAGEABLE_STATUSES } = require('../data/reference');

const router = express.Router();

router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).render('errors/404', { title: '404' });
  next();
});

router.use(requireAuth);

router.post('/containers/:id', async (req, res, next) => {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id === req.user.id) return res.status(403).send('Forbidden');
    if (!MESSAGEABLE_STATUSES.includes(container.status)) {
      return res.status(400).send(res.locals.t('marketplace.listing_closed_notice'));
    }

    const body = (req.body.body || '').trim();
    if (!body) return res.redirect(`/containers/${container.id}`);

    let [conversation] = await sql`
      SELECT * FROM conversations WHERE container_id = ${container.id} AND shipper_id = ${req.user.id}
    `;
    if (!conversation) {
      [conversation] = await sql`
        INSERT INTO conversations (container_id, owner_id, shipper_id)
        VALUES (${container.id}, ${container.owner_id}, ${req.user.id})
        RETURNING *
      `;
    }

    await sql`
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES (${conversation.id}, ${req.user.id}, ${body})
    `;

    req.session.flash = { type: 'success', text: res.locals.t('messages.message_sent') };
    res.redirect(`/messages/${conversation.id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const conversations = await sql`
      SELECT
        conversations.*,
        containers.origin_city, containers.destination_city, containers.container_number, containers.status AS container_status,
        (SELECT body FROM messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS last_at,
        CASE WHEN conversations.owner_id = ${req.user.id} THEN shipper.name ELSE owner.name END AS other_name
      FROM conversations
      JOIN containers ON containers.id = conversations.container_id
      JOIN users owner ON owner.id = conversations.owner_id
      JOIN users shipper ON shipper.id = conversations.shipper_id
      WHERE conversations.owner_id = ${req.user.id} OR conversations.shipper_id = ${req.user.id}
      ORDER BY last_at DESC NULLS LAST, conversations.created_at DESC
    `;

    res.render('messages/inbox', {
      title: res.locals.t('messages.inbox_title'),
      conversations,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [conversation] = await sql`
      SELECT conversations.*, containers.origin_city, containers.destination_city, containers.container_number
      FROM conversations
      JOIN containers ON containers.id = conversations.container_id
      WHERE conversations.id = ${req.params.id}
    `;
    if (!conversation) return res.status(404).render('errors/404', { title: '404' });
    if (conversation.owner_id !== req.user.id && conversation.shipper_id !== req.user.id) {
      return res.status(403).send('Forbidden');
    }

    const otherId = conversation.owner_id === req.user.id ? conversation.shipper_id : conversation.owner_id;
    const [otherUser] = await sql`SELECT name FROM users WHERE id = ${otherId}`;

    const messages = await sql`
      SELECT * FROM messages WHERE conversation_id = ${conversation.id} ORDER BY created_at ASC
    `;

    res.render('messages/thread', {
      title: res.locals.t('messages.conversation_with') + ' ' + (otherUser ? otherUser.name : ''),
      conversation,
      otherUser,
      messages,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reply', async (req, res, next) => {
  try {
    const [conversation] = await sql`SELECT * FROM conversations WHERE id = ${req.params.id}`;
    if (!conversation) return res.status(404).render('errors/404', { title: '404' });
    if (conversation.owner_id !== req.user.id && conversation.shipper_id !== req.user.id) {
      return res.status(403).send('Forbidden');
    }

    const body = (req.body.body || '').trim();
    if (body) {
      await sql`
        INSERT INTO messages (conversation_id, sender_id, body)
        VALUES (${conversation.id}, ${req.user.id}, ${body})
      `;
    }
    res.redirect(`/messages/${conversation.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
