const express = require('express');
const crypto = require('crypto');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { packageUpload, MAX_PACKAGE_PHOTOS } = require('../middleware/upload');
const { deletePhotoFile } = require('../lib/photos');
const { qrDataUrl } = require('../lib/qr');
const { sendMail } = require('../lib/mailer');
const { canManagePackagesFor } = require('../lib/teams');
const { CURRENCIES } = require('../data/reference');

// mergeParams so :id (the container id) from the parent mount path
// (/containers/:id/packages) is visible here.
const router = express.Router({ mergeParams: true });

router.param('packageId', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).render('errors/404', { title: '404' });
  next();
});

router.use(requireAuth);

async function loadOwnedContainer(req, res) {
  // This router is mounted separately from routes/containers.js (so its
  // numeric :id guard via router.param doesn't apply here), and mergeParams
  // only forwards the value, not that validation - so re-check it here.
  if (!/^\d+$/.test(req.params.id)) {
    res.status(404).render('errors/404', { title: '404' });
    return null;
  }
  const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
  if (!container) {
    res.status(404).render('errors/404', { title: '404' });
    return null;
  }
  if (!(await canManagePackagesFor(req.user.id, container.owner_id))) {
    res.status(403).send('Forbidden');
    return null;
  }
  return container;
}

function initialStatusFor(container) {
  if (container.departed_at) return 'departed';
  if (container.status === 'closed') return 'packed_closed';
  return 'received';
}

router.get('/', async (req, res, next) => {
  try {
    const container = await loadOwnedContainer(req, res);
    if (!container) return;

    const packages = await sql`
      SELECT * FROM packages WHERE container_id = ${container.id} ORDER BY created_at DESC
    `;

    res.render('packages/list', {
      title: res.locals.t('packages.list_title'),
      container,
      packages,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/new', async (req, res, next) => {
  try {
    const container = await loadOwnedContainer(req, res);
    if (!container) return;

    res.render('packages/form', {
      title: res.locals.t('packages.add_title'),
      container,
      values: {},
      error: null,
      CURRENCIES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', packageUpload.array('photos', MAX_PACKAGE_PHOTOS), async (req, res, next) => {
  const body = req.body;
  try {
    const container = await loadOwnedContainer(req, res);
    if (!container) return;

    const renderError = (error) =>
      res.status(400).render('packages/form', {
        title: res.locals.t('packages.add_title'),
        container,
        values: body,
        error,
        CURRENCIES,
      });

    if (!body.sender_name || !body.sender_contact || !body.receiver_name) {
      return renderError(res.locals.t('auth.error_required_fields'));
    }

    const accessToken = crypto.randomBytes(20).toString('hex');
    const status = initialStatusFor(container);

    const [pkg] = await sql`
      INSERT INTO packages (
        container_id, sender_name, sender_contact, sender_email, receiver_name,
        weight_kg, details, amount_charged, amount_currency, payment_note,
        status, access_token
      ) VALUES (
        ${container.id}, ${body.sender_name}, ${body.sender_contact}, ${body.sender_email || null}, ${body.receiver_name},
        ${body.weight_kg || null}, ${body.details || null}, ${body.amount_charged || null},
        ${body.amount_charged ? body.amount_currency || 'USD' : null}, ${body.payment_note || null},
        ${status}, ${accessToken}
      )
      RETURNING id
    `;

    const files = req.files || [];
    for (let idx = 0; idx < files.length; idx++) {
      await sql`
        INSERT INTO package_photos (package_id, file_path, position)
        VALUES (${pkg.id}, ${files[idx].filename}, ${idx})
      `;
    }

    if (body.sender_email) {
      const trackUrl = `${res.locals.baseUrl}/track/${accessToken}`;
      sendMail({
        to: body.sender_email,
        subject: res.locals.t('packages.email_subject'),
        text: res.locals.t('packages.email_body', { url: trackUrl }),
      }).catch(() => {});
    }

    req.session.flash = { type: 'success', text: res.locals.t('packages.created') };
    res.redirect(`/containers/${container.id}/packages/${pkg.id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/:packageId', async (req, res, next) => {
  try {
    const container = await loadOwnedContainer(req, res);
    if (!container) return;

    const [pkg] = await sql`SELECT * FROM packages WHERE id = ${req.params.packageId} AND container_id = ${container.id}`;
    if (!pkg) return res.status(404).render('errors/404', { title: '404' });

    const photos = await sql`
      SELECT * FROM package_photos WHERE package_id = ${pkg.id} ORDER BY position ASC
    `;

    const trackUrl = `${res.locals.baseUrl}/track/${pkg.access_token}`;

    res.render('packages/show', {
      title: res.locals.t('packages.detail_title'),
      container,
      pkg,
      photos,
      trackUrl,
      qrSrc: await qrDataUrl(trackUrl),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:packageId/delete', async (req, res, next) => {
  try {
    const container = await loadOwnedContainer(req, res);
    if (!container) return;

    const [pkg] = await sql`SELECT * FROM packages WHERE id = ${req.params.packageId} AND container_id = ${container.id}`;
    if (!pkg) return res.status(404).render('errors/404', { title: '404' });

    const photos = await sql`SELECT * FROM package_photos WHERE package_id = ${pkg.id}`;
    await sql`DELETE FROM packages WHERE id = ${pkg.id}`;
    for (const p of photos) deletePhotoFile('packages', p.file_path);

    req.session.flash = { type: 'success', text: res.locals.t('packages.deleted') };
    res.redirect(`/containers/${container.id}/packages`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
