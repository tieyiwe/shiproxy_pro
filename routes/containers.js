const express = require('express');
const { sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { upload, MAX_PHOTOS } = require('../middleware/upload');
const { deletePhotoFile } = require('../lib/photos');
const { trackingUrl } = require('../lib/tracking');
const { geocodeCity, distanceKm } = require('../lib/geocode');
const { activeStaffIds } = require('../lib/teams');
const { createNotification } = require('../lib/notify');
const {
  CONTAINER_SIZES,
  PRICE_UNITS,
  STATUSES,
  CURRENCIES,
  COUNTRIES,
  MESSAGEABLE_STATUSES,
  DEFAULT_BROWSE_STATUSES,
  PICKUP_OPTIONS,
  STOP_TYPES,
  MAX_STOPS,
} = require('../data/reference');

const router = express.Router();

// Reject non-numeric :id early with a clean 404 instead of a Postgres cast error.
router.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).render('errors/404', { title: '404' });
  next();
});

async function fetchPhotosFor(containerIds) {
  if (containerIds.length === 0) return new Map();
  const rows = await sql`
    SELECT * FROM container_photos
    WHERE container_id IN ${sql(containerIds)}
    ORDER BY container_id, position ASC
  `;
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.container_id)) map.set(row.container_id, []);
    map.get(row.container_id).push(row);
  }
  return map;
}

async function fetchStopsFor(containerId) {
  return sql`
    SELECT * FROM container_stops WHERE container_id = ${containerId} ORDER BY position ASC
  `;
}

// Reads the bounded stop_type[]/stop_city[]/stop_country[]/stop_notes[]
// form arrays into row objects, skipping any row missing a city or country.
function parseStops(body) {
  const types = [].concat(body.stop_type || []);
  const cities = [].concat(body.stop_city || []);
  const countries = [].concat(body.stop_country || []);
  const notes = [].concat(body.stop_notes || []);
  const stops = [];
  for (let i = 0; i < MAX_STOPS; i++) {
    const city = (cities[i] || '').trim();
    const country = (countries[i] || '').trim();
    if (!city || !country) continue;
    stops.push({
      stop_type: STOP_TYPES.includes(types[i]) ? types[i] : 'pickup',
      city,
      country,
      notes: (notes[i] || '').trim() || null,
    });
  }
  return stops;
}

async function replaceStops(containerId, stops) {
  await sql`DELETE FROM container_stops WHERE container_id = ${containerId}`;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    await sql`
      INSERT INTO container_stops (container_id, stop_type, city, country, notes, position)
      VALUES (${containerId}, ${s.stop_type}, ${s.city}, ${s.country}, ${s.notes}, ${i})
    `;
  }
}

function decorate(container, photosByContainer, userLocation) {
  const photos = photosByContainer.get(container.id) || [];
  const distanceKmValue =
    userLocation && container.origin_lat != null && container.origin_lng != null
      ? distanceKm(userLocation.lat, userLocation.lng, Number(container.origin_lat), Number(container.origin_lng))
      : null;
  return {
    ...container,
    photos,
    thumbnail: photos[0] ? `/uploads/containers/${photos[0].file_path}` : null,
    tracking_url: trackingUrl(container.container_number),
    messageable: MESSAGEABLE_STATUSES.includes(container.status),
    distance_km: distanceKmValue,
  };
}

// Builds a `WHERE ...` clause + matching params array for the browse filters.
// `includeCity` controls whether origin/destination city filters are applied
// (the "nearby" fallback search drops them to broaden the match), and
// `excludeIds` lets the nearby search skip rows already shown as exact matches.
function buildBrowseWhere(filters, { includeCity, excludeIds = [] }) {
  const conditions = [];
  const params = [];
  let i = 1;
  const next = () => i++;

  if (filters.origin_country) {
    conditions.push(`origin_country ILIKE $${next()}`);
    params.push(filters.origin_country);
  }
  if (filters.destination_country) {
    conditions.push(`destination_country ILIKE $${next()}`);
    params.push(filters.destination_country);
  }
  if (includeCity && filters.origin_city) {
    conditions.push(`origin_city ILIKE $${next()}`);
    params.push(`%${filters.origin_city}%`);
  }
  if (includeCity && filters.destination_city) {
    conditions.push(`destination_city ILIKE $${next()}`);
    params.push(`%${filters.destination_city}%`);
  }
  if (filters.size) {
    conditions.push(`size = $${next()}`);
    params.push(filters.size);
  }
  if (filters.status && STATUSES.includes(filters.status)) {
    conditions.push(`status = $${next()}`);
    params.push(filters.status);
  } else {
    const placeholders = DEFAULT_BROWSE_STATUSES.map(() => `$${next()}`).join(', ');
    conditions.push(`status IN (${placeholders})`);
    params.push(...DEFAULT_BROWSE_STATUSES);
  }
  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map(() => `$${next()}`).join(', ');
    conditions.push(`id NOT IN (${placeholders})`);
    params.push(...excludeIds);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

router.get('/browse', async (req, res, next) => {
  try {
    const filters = {
      origin_country: (req.query.origin_country || '').trim(),
      origin_city: (req.query.origin_city || '').trim(),
      destination_country: (req.query.destination_country || '').trim(),
      destination_city: (req.query.destination_city || '').trim(),
      size: (req.query.size || '').trim(),
      status: (req.query.status || '').trim(),
    };

    const exact = buildBrowseWhere(filters, { includeCity: true });
    const exactRows = await sql.unsafe(
      `SELECT * FROM containers ${exact.where} ORDER BY featured DESC, created_at DESC LIMIT 50`,
      exact.params
    );

    let nearbyRows = [];
    const searchedSpecificCity = filters.origin_city || filters.destination_city;
    if (searchedSpecificCity && exactRows.length < 6) {
      const nearby = buildBrowseWhere(filters, {
        includeCity: false,
        excludeIds: exactRows.map((r) => r.id),
      });
      nearbyRows = await sql.unsafe(
        `SELECT * FROM containers ${nearby.where} ORDER BY featured DESC, created_at DESC LIMIT 12`,
        nearby.params
      );
    }

    const allIds = [...exactRows, ...nearbyRows].map((r) => r.id);
    const photosByContainer = await fetchPhotosFor(allIds);

    const userLat = Number(req.query.lat);
    const userLng = Number(req.query.lng);
    const userLocation =
      Number.isFinite(userLat) && Number.isFinite(userLng) ? { lat: userLat, lng: userLng } : null;

    // Closest-first when we know where the shipper is; listings without a
    // cached origin location (geocoding failed/pending) sort to the end.
    const byDistance = (a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    };

    let results = exactRows.map((c) => decorate(c, photosByContainer, userLocation));
    let nearbyResults = nearbyRows.map((c) => decorate(c, photosByContainer, userLocation));
    if (userLocation) {
      results = results.sort(byDistance);
      nearbyResults = nearbyResults.sort(byDistance);
    }

    res.render('containers/browse', {
      title: res.locals.t('marketplace.browse_title'),
      results,
      nearbyResults,
      userLocation,
      filters,
      CONTAINER_SIZES,
      STATUSES,
      COUNTRIES,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/containers/new', requireAuth, (req, res) => {
  res.render('containers/form', {
    title: res.locals.t('marketplace.post_title'),
    mode: 'new',
    container: {},
    photos: [],
    stops: [],
    error: null,
    CONTAINER_SIZES,
    PRICE_UNITS,
    CURRENCIES,
    COUNTRIES,
    PICKUP_OPTIONS,
    STOP_TYPES,
    MAX_PHOTOS,
    MAX_STOPS,
  });
});

router.post('/containers', requireAuth, upload.array('photos', MAX_PHOTOS), async (req, res, next) => {
  const body = req.body;
  const renderError = (error) =>
    res.status(400).render('containers/form', {
      title: res.locals.t('marketplace.post_title'),
      mode: 'new',
      container: body,
      photos: [],
      stops: parseStops(body),
      error,
      CONTAINER_SIZES,
      PRICE_UNITS,
      CURRENCIES,
      COUNTRIES,
      PICKUP_OPTIONS,
      STOP_TYPES,
      MAX_PHOTOS,
      MAX_STOPS,
    });

  try {
    if (
      !body.container_number ||
      !CONTAINER_SIZES.includes(body.size) ||
      !body.origin_country ||
      !body.origin_city ||
      !body.destination_country ||
      !body.destination_city
    ) {
      return renderError(res.locals.t('auth.error_required_fields'));
    }

    const pickupOption = PICKUP_OPTIONS.includes(body.pickup_option) ? body.pickup_option : 'dropoff_only';
    const pickupFeeAmount = pickupOption === 'pickup_fee' ? body.pickup_fee_amount || null : null;
    const pickupFeeCurrency = pickupOption === 'pickup_fee' ? body.pickup_fee_currency || 'USD' : null;
    const origin = await geocodeCity(body.origin_city, body.origin_country);

    const [container] = await sql`
      INSERT INTO containers (
        owner_id, container_number, size, origin_country, origin_city,
        destination_country, destination_city, available_space,
        departure_date, closing_date, price_amount, price_currency, price_unit, notes,
        pickup_option, pickup_fee_amount, pickup_fee_currency, origin_lat, origin_lng
      ) VALUES (
        ${req.user.id}, ${body.container_number}, ${body.size}, ${body.origin_country}, ${body.origin_city},
        ${body.destination_country}, ${body.destination_city}, ${body.available_space || null},
        ${body.departure_date || null}, ${body.closing_date || null},
        ${body.price_amount || null}, ${body.price_currency || 'USD'}, ${PRICE_UNITS.includes(body.price_unit) ? body.price_unit : 'flat'},
        ${body.notes || null}, ${pickupOption}, ${pickupFeeAmount}, ${pickupFeeCurrency},
        ${origin ? origin.lat : null}, ${origin ? origin.lng : null}
      )
      RETURNING id
    `;

    const files = req.files || [];
    for (let idx = 0; idx < files.length; idx++) {
      await sql`
        INSERT INTO container_photos (container_id, file_path, position)
        VALUES (${container.id}, ${files[idx].filename}, ${idx})
      `;
    }

    await replaceStops(container.id, parseStops(body));

    req.session.flash = { type: 'success', text: res.locals.t('marketplace.created') };
    res.redirect(`/containers/${container.id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/containers/:id', requireAuth, async (req, res, next) => {
  try {
    const [container] = await sql`
      SELECT containers.*, users.name AS owner_name, users.rating_avg AS owner_rating_avg, users.rating_count AS owner_rating_count
      FROM containers
      JOIN users ON users.id = containers.owner_id
      WHERE containers.id = ${req.params.id}
    `;
    if (!container) return res.status(404).render('errors/404', { title: '404' });

    const photosByContainer = await fetchPhotosFor([container.id]);
    const decorated = decorate(container, photosByContainer);
    const stops = await fetchStopsFor(container.id);

    const baseUrl = res.locals.baseUrl;
    const sizeLabel = res.locals.t(`marketplace.size_${container.size}`);
    const og = {
      title: `${sizeLabel}: ${container.origin_city} → ${container.destination_city}`,
      description: res.locals.t('home.hero_subtitle'),
      url: `${baseUrl}/containers/${container.id}`,
      image: decorated.thumbnail ? `${baseUrl}${decorated.thumbnail}` : `${baseUrl}/images/og-fallback.png`,
    };

    res.render('containers/show', {
      title: og.title,
      og,
      container: decorated,
      stops,
      isOwner: req.user && req.user.id === container.owner_id,
      CONTAINER_SIZES,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/containers/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id !== req.user.id) return res.status(403).send('Forbidden');

    const photosByContainer = await fetchPhotosFor([container.id]);
    const stops = await fetchStopsFor(container.id);
    res.render('containers/form', {
      title: res.locals.t('marketplace.edit_title'),
      mode: 'edit',
      container,
      photos: photosByContainer.get(container.id) || [],
      stops,
      error: null,
      CONTAINER_SIZES,
      PRICE_UNITS,
      STATUSES,
      CURRENCIES,
      COUNTRIES,
      PICKUP_OPTIONS,
      STOP_TYPES,
      MAX_PHOTOS,
      MAX_STOPS,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/containers/:id/edit', requireAuth, upload.array('photos', MAX_PHOTOS), async (req, res, next) => {
  const body = req.body;
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id !== req.user.id) return res.status(403).send('Forbidden');

    const existingPhotos = await sql`
      SELECT * FROM container_photos WHERE container_id = ${container.id} ORDER BY position
    `;

    const renderError = async (error) => {
      res.status(400).render('containers/form', {
        title: res.locals.t('marketplace.edit_title'),
        mode: 'edit',
        container: { ...container, ...body },
        photos: existingPhotos,
        stops: parseStops(body),
        error,
        CONTAINER_SIZES,
        PRICE_UNITS,
        STATUSES,
        CURRENCIES,
        COUNTRIES,
        PICKUP_OPTIONS,
        STOP_TYPES,
        MAX_PHOTOS,
        MAX_STOPS,
      });
    };

    if (
      !body.container_number ||
      !CONTAINER_SIZES.includes(body.size) ||
      !body.origin_country ||
      !body.origin_city ||
      !body.destination_country ||
      !body.destination_city ||
      !STATUSES.includes(body.status)
    ) {
      return renderError(res.locals.t('auth.error_required_fields'));
    }

    const removeIds = [].concat(body.remove_photo_ids || []).map(Number).filter(Boolean);
    const keptCount = existingPhotos.filter((p) => !removeIds.includes(p.id)).length;
    const newFiles = req.files || [];
    if (keptCount + newFiles.length > MAX_PHOTOS) {
      return renderError(res.locals.t('marketplace.photos_hint'));
    }

    const pickupOption = PICKUP_OPTIONS.includes(body.pickup_option) ? body.pickup_option : 'dropoff_only';
    const pickupFeeAmount = pickupOption === 'pickup_fee' ? body.pickup_fee_amount || null : null;
    const pickupFeeCurrency = pickupOption === 'pickup_fee' ? body.pickup_fee_currency || 'USD' : null;

    // Only hit the geocoder again if the origin actually changed - avoids
    // re-geocoding on every unrelated edit (price tweak, status change, etc).
    const originChanged =
      body.origin_city !== container.origin_city || body.origin_country !== container.origin_country;
    const origin = originChanged
      ? await geocodeCity(body.origin_city, body.origin_country)
      : { lat: container.origin_lat, lng: container.origin_lng };

    await sql`
      UPDATE containers SET
        container_number = ${body.container_number},
        size = ${body.size},
        origin_country = ${body.origin_country},
        origin_city = ${body.origin_city},
        destination_country = ${body.destination_country},
        destination_city = ${body.destination_city},
        available_space = ${body.available_space || null},
        departure_date = ${body.departure_date || null},
        closing_date = ${body.closing_date || null},
        price_amount = ${body.price_amount || null},
        price_currency = ${body.price_currency || 'USD'},
        price_unit = ${PRICE_UNITS.includes(body.price_unit) ? body.price_unit : 'flat'},
        status = ${body.status},
        notes = ${body.notes || null},
        pickup_option = ${pickupOption},
        pickup_fee_amount = ${pickupFeeAmount},
        pickup_fee_currency = ${pickupFeeCurrency},
        origin_lat = ${origin ? origin.lat : null},
        origin_lng = ${origin ? origin.lng : null},
        updated_at = now()
      WHERE id = ${container.id}
    `;

    if (removeIds.length > 0) {
      const toRemove = existingPhotos.filter((p) => removeIds.includes(p.id));
      await sql`DELETE FROM container_photos WHERE id IN ${sql(removeIds)}`;
      for (const p of toRemove) deletePhotoFile('containers', p.file_path);
    }

    let nextPosition = existingPhotos.filter((p) => !removeIds.includes(p.id)).length;
    for (const file of newFiles) {
      await sql`
        INSERT INTO container_photos (container_id, file_path, position)
        VALUES (${container.id}, ${file.filename}, ${nextPosition})
      `;
      nextPosition++;
    }

    await replaceStops(container.id, parseStops(body));

    req.session.flash = { type: 'success', text: res.locals.t('marketplace.updated') };
    res.redirect(`/containers/${container.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/containers/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id !== req.user.id) return res.status(403).send('Forbidden');

    const photos = await sql`SELECT * FROM container_photos WHERE container_id = ${container.id}`;
    await sql`DELETE FROM containers WHERE id = ${container.id}`;
    for (const p of photos) deletePhotoFile('containers', p.file_path);

    req.session.flash = { type: 'success', text: res.locals.t('marketplace.deleted') };
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

async function setStatus(req, res, next, status) {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id !== req.user.id) return res.status(403).send('Forbidden');

    await sql`UPDATE containers SET status = ${status}, updated_at = now() WHERE id = ${container.id}`;

    // Packages already departed/delivered are unaffected either way - only
    // the receiving/held states move with the listing's open<->closed toggle.
    let updatedPackages = [];
    if (status === 'closed') {
      updatedPackages = await sql`
        UPDATE packages SET status = 'packed_closed', updated_at = now()
        WHERE container_id = ${container.id} AND status = 'received'
        RETURNING id
      `;
    } else if (status === 'open') {
      updatedPackages = await sql`
        UPDATE packages SET status = 'received', updated_at = now()
        WHERE container_id = ${container.id} AND status = 'packed_closed'
        RETURNING id
      `;
    }

    if (updatedPackages.length > 0) {
      const packageStatus = status === 'closed' ? 'packed_closed' : 'received';
      const staffIds = await activeStaffIds(container.owner_id);
      for (const staffId of staffIds) {
        await createNotification(staffId, {
          type: 'package_status_bulk',
          i18nKey: 'notifications.package_status_bulk',
          i18nVars: { container: container.container_number, count: updatedPackages.length, status: packageStatus },
          link: `/containers/${container.id}/packages`,
        });
      }
    }

    req.session.flash = { type: 'success', text: res.locals.t('marketplace.updated') };
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
}

router.post('/containers/:id/close', requireAuth, (req, res, next) => setStatus(req, res, next, 'closed'));
router.post('/containers/:id/reopen', requireAuth, (req, res, next) => setStatus(req, res, next, 'open'));

router.post('/containers/:id/depart', requireAuth, async (req, res, next) => {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id !== req.user.id) return res.status(403).send('Forbidden');
    if (container.status !== 'closed') {
      return res.status(400).send(res.locals.t('packages.must_close_before_departure'));
    }

    await sql`UPDATE containers SET departed_at = now(), updated_at = now() WHERE id = ${container.id}`;
    const departedPackages = await sql`
      UPDATE packages SET status = 'departed', updated_at = now()
      WHERE container_id = ${container.id} AND status NOT IN ('departed', 'delivered')
      RETURNING id
    `;

    if (departedPackages.length > 0) {
      const staffIds = await activeStaffIds(container.owner_id);
      for (const staffId of staffIds) {
        await createNotification(staffId, {
          type: 'package_status_bulk',
          i18nKey: 'notifications.package_status_bulk',
          i18nVars: { container: container.container_number, count: departedPackages.length, status: 'departed' },
          link: `/containers/${container.id}/packages`,
        });
      }
    }

    req.session.flash = { type: 'success', text: res.locals.t('packages.marked_departed') };
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/containers/:id/feature', requireAuth, async (req, res, next) => {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id !== req.user.id) return res.status(403).send('Forbidden');

    await sql`
      UPDATE containers SET featured = true, featured_until = now() + interval '14 days', updated_at = now()
      WHERE id = ${container.id}
    `;
    req.session.flash = { type: 'success', text: res.locals.t('marketplace.updated') };
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/containers/:id/unfeature', requireAuth, async (req, res, next) => {
  try {
    const [container] = await sql`SELECT * FROM containers WHERE id = ${req.params.id}`;
    if (!container) return res.status(404).render('errors/404', { title: '404' });
    if (container.owner_id !== req.user.id) return res.status(403).send('Forbidden');

    await sql`UPDATE containers SET featured = false, featured_until = NULL, updated_at = now() WHERE id = ${container.id}`;
    req.session.flash = { type: 'success', text: res.locals.t('marketplace.updated') };
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
