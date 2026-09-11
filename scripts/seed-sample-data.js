// Creates a handful of realistic demo listings (plus the owner accounts
// behind them) purely so the marketplace doesn't look empty while the app
// is being reviewed - not real data, not meant to ship to production.
//
// Everything this script creates is tagged so it can be found and removed
// later with its companion script:
//   - demo owner/customer accounts use the @sample.shiproxy.demo email domain
//   - demo listings use container numbers starting with "DEMO-"
//
//   node scripts/seed-sample-data.js     (run once the server has migrated)
//   node scripts/remove-sample-data.js   (deletes everything the above created)
//
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql } = require('../db');
const { generatePublicId } = require('../lib/publicId');

const DEMO_EMAIL_DOMAIN = 'sample.shiproxy.demo';
const DEMO_PASSWORD = 'SampleDemo123!';

function daysFromNow(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function createOwner({ email, name, accountType, businessName, businessContactName, businessPhone, businessLocation }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [user] = await sql`
    INSERT INTO users (
      name, email, password_hash, public_id, account_type,
      business_name, business_contact_name, business_phone, business_location
    ) VALUES (
      ${name}, ${email}, ${passwordHash}, ${generatePublicId()}, ${accountType},
      ${businessName || null}, ${businessContactName || null}, ${businessPhone || null}, ${businessLocation || null}
    )
    RETURNING id, name, email
  `;
  return user;
}

async function createContainer(owner, data) {
  const [container] = await sql`
    INSERT INTO containers (
      owner_id, container_number, size, origin_country, origin_city,
      destination_country, destination_city, opening_date, closing_date, departure_date,
      price_amount, price_currency, price_unit, status, notes,
      pickup_option, pickup_fee_amount, pickup_fee_currency, featured, featured_until
    ) VALUES (
      ${owner.id}, ${data.containerNumber}, ${data.size}, ${data.originCountry}, ${data.originCity},
      ${data.destinationCountry}, ${data.destinationCity}, ${data.openingDate}, ${data.closingDate}, ${data.departureDate},
      ${data.priceAmount}, ${data.priceCurrency}, ${data.priceUnit}, ${data.status}, ${data.notes},
      ${data.pickupOption}, ${data.pickupFeeAmount || null}, ${data.pickupFeeCurrency || null},
      ${data.featured || false}, ${data.featured ? sql`now() + interval '14 days'` : null}
    )
    RETURNING id, container_number
  `;

  for (const stop of data.stops || []) {
    await sql`
      INSERT INTO container_stops (container_id, stop_type, city, country, position)
      VALUES (${container.id}, ${stop.type}, ${stop.city}, ${stop.country}, ${stop.position})
    `;
  }

  return container;
}

async function main() {
  const [existing] = await sql`SELECT id FROM users WHERE email = ${'atlas.freight@' + DEMO_EMAIL_DOMAIN}`;
  if (existing) {
    console.log('Sample data already exists (found atlas.freight@' + DEMO_EMAIL_DOMAIN + ').');
    console.log('Run `node scripts/remove-sample-data.js` first if you want to reseed.');
    return;
  }

  const atlas = await createOwner({
    email: 'atlas.freight@' + DEMO_EMAIL_DOMAIN,
    name: 'Atlas Freight Togo',
    accountType: 'shipping_company',
    businessName: 'Atlas Freight Togo',
    businessContactName: 'Komi Adjovi',
    businessPhone: '+228 90 12 34 56',
    businessLocation: 'Lomé, Togo',
  });

  const sahel = await createOwner({
    email: 'sahel.cargo@' + DEMO_EMAIL_DOMAIN,
    name: 'Sahel Cargo Sénégal',
    accountType: 'independent_shipper',
    businessName: 'Sahel Cargo Sénégal',
    businessContactName: 'Fatou Ndiaye',
    businessPhone: '+221 77 234 56 78',
    businessLocation: 'Dakar, Sénégal',
  });

  const horizon = await createOwner({
    email: 'horizon.shipping@' + DEMO_EMAIL_DOMAIN,
    name: 'Horizon Shipping Ghana',
    accountType: 'shipping_company',
    businessName: 'Horizon Shipping Ghana',
    businessContactName: 'Kwame Asante',
    businessPhone: '+233 24 987 6543',
    businessLocation: 'Accra, Ghana',
  });

  const customer = await createOwner({
    email: 'yaw.mensah@' + DEMO_EMAIL_DOMAIN,
    name: 'Yaw Mensah',
    accountType: 'expediter',
  });

  const listings = [
    {
      owner: atlas,
      containerNumber: 'DEMO-TG001',
      size: '40ft_standard',
      originCountry: 'Togo', originCity: 'Lomé',
      destinationCountry: 'France', destinationCity: 'Paris',
      openingDate: daysFromNow(-2), closingDate: daysFromNow(12), departureDate: daysFromNow(18),
      priceAmount: 4.5, priceCurrency: 'USD', priceUnit: 'per_kg',
      status: 'open',
      pickupOption: 'pickup_fee', pickupFeeAmount: 15, pickupFeeCurrency: 'USD',
      featured: true,
      notes: 'Groupage hebdomadaire vers la France. Réception au dépôt du port de Lomé.',
    },
    {
      owner: atlas,
      containerNumber: 'DEMO-TG002',
      size: '20ft_standard',
      originCountry: 'Togo', originCity: 'Lomé',
      destinationCountry: 'Belgium', destinationCity: 'Antwerp',
      openingDate: daysFromNow(-10), closingDate: daysFromNow(3), departureDate: daysFromNow(9),
      priceAmount: 3.8, priceCurrency: 'EUR', priceUnit: 'per_kg',
      status: 'closing_soon',
      pickupOption: 'dropoff_only',
      notes: 'Dernières places disponibles avant clôture.',
    },
    {
      owner: atlas,
      containerNumber: 'DEMO-TG003',
      size: '40ft_high_cube',
      originCountry: 'Togo', originCity: 'Lomé',
      destinationCountry: 'Canada', destinationCity: 'Montréal',
      openingDate: daysFromNow(-40), closingDate: daysFromNow(-20), departureDate: daysFromNow(-10),
      priceAmount: 180000, priceCurrency: 'CFA', priceUnit: 'flat',
      status: 'closed',
      pickupOption: 'dropoff_only',
      notes: 'Conteneur déjà parti - exemple d\'annonce clôturée.',
    },
    {
      owner: sahel,
      containerNumber: 'DEMO-SN001',
      size: '40ft_high_cube',
      originCountry: 'Sénégal', originCity: 'Dakar',
      destinationCountry: 'France', destinationCity: 'Marseille',
      openingDate: daysFromNow(-1), closingDate: daysFromNow(15), departureDate: daysFromNow(20),
      priceAmount: 250, priceCurrency: 'EUR', priceUnit: 'flat',
      status: 'open',
      pickupOption: 'pickup_free',
      notes: 'Enlèvement gratuit à Thiès, dépôt final à Fos-sur-Mer.',
      stops: [
        { type: 'pickup', city: 'Thiès', country: 'Sénégal', position: 0 },
        { type: 'dropoff', city: 'Fos-sur-Mer', country: 'France', position: 1 },
      ],
    },
    {
      owner: sahel,
      containerNumber: 'DEMO-SN002',
      size: 'lcl_part_load',
      originCountry: 'Sénégal', originCity: 'Dakar',
      destinationCountry: 'United States', destinationCity: 'New York',
      openingDate: daysFromNow(-3), closingDate: daysFromNow(10), departureDate: daysFromNow(16),
      priceAmount: 6.2, priceCurrency: 'USD', priceUnit: 'per_kg',
      status: 'open',
      pickupOption: 'dropoff_only',
      notes: 'Groupage LCL, petites quantités bienvenues.',
    },
    {
      owner: horizon,
      containerNumber: 'DEMO-GH001',
      size: '40ft_standard',
      originCountry: 'Ghana', originCity: 'Accra',
      destinationCountry: 'United Kingdom', destinationCity: 'London',
      openingDate: daysFromNow(-5), closingDate: daysFromNow(9), departureDate: daysFromNow(14),
      priceAmount: 300, priceCurrency: 'GBP', priceUnit: 'flat',
      status: 'open',
      pickupOption: 'pickup_fee', pickupFeeAmount: 20, pickupFeeCurrency: 'GBP',
      featured: true,
      notes: 'Service premium avec suivi dédié.',
    },
    {
      owner: horizon,
      containerNumber: 'DEMO-GH002',
      size: '45ft_high_cube',
      originCountry: 'Ghana', originCity: 'Accra',
      destinationCountry: 'China', destinationCity: 'Guangzhou',
      openingDate: daysFromNow(-20), closingDate: daysFromNow(-2), departureDate: daysFromNow(5),
      priceAmount: 850, priceCurrency: 'CNY', priceUnit: 'per_cbm',
      status: 'full',
      pickupOption: 'dropoff_only',
      notes: 'Complet - exemple d\'annonce pleine.',
    },
  ];

  const created = [];
  for (const listing of listings) {
    const container = await createContainer(listing.owner, listing);
    created.push(container);
    console.log(`Created listing ${container.container_number} (id ${container.id}) for ${listing.owner.name}`);
  }

  // A sample inquiry + logged package on the first Atlas listing, so its
  // dashboard analytics and the tracking page have something to show.
  const flagship = created[0];
  const [conversation] = await sql`
    INSERT INTO conversations (container_id, owner_id, shipper_id)
    VALUES (${flagship.id}, ${atlas.id}, ${customer.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO messages (conversation_id, sender_id, body)
    VALUES (${conversation.id}, ${customer.id}, 'Bonjour, il reste de la place pour environ 40kg ? Merci !')
  `;

  const crypto = require('crypto');
  await sql`
    INSERT INTO packages (
      container_id, sender_name, sender_contact, sender_email, receiver_name,
      weight_kg, details, amount_charged, amount_currency, status, access_token
    ) VALUES (
      ${flagship.id}, 'Yaw Mensah', '+233 20 111 2233', ${customer.email}, 'Ama Mensah',
      40, 'Vêtements et articles ménagers', 90, 'USD', 'received', ${crypto.randomBytes(20).toString('hex')}
    )
  `;

  console.log('');
  console.log(`Created ${created.length} sample listings and 4 demo accounts.`);
  console.log(`All demo accounts share the password: ${DEMO_PASSWORD}`);
  console.log('Demo accounts:');
  console.log(`  - ${atlas.email} (shipping company, owns 3 listings)`);
  console.log(`  - ${sahel.email} (independent shipper, owns 2 listings)`);
  console.log(`  - ${horizon.email} (shipping company, owns 2 listings)`);
  console.log(`  - ${customer.email} (customer, sent one inquiry + one package)`);
  console.log('');
  console.log('Run `node scripts/remove-sample-data.js` when you\'re ready to delete all of this.');
}

main()
  .catch((err) => {
    console.error('Failed to seed sample data:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
