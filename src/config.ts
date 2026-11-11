// ─────────────────────────────────────────────────────────────
//  Business details: edit this file to change what the site says.
// ─────────────────────────────────────────────────────────────

export const business = {
  name: 'Exeter Trailer Hire',
  siteUrl: 'https://exetertrailerhire.co.uk',
  phoneDisplay: '07391 051035',
  phoneHref: 'tel:+447391051035',
  // WhatsApp link uses the same mobile. Set to '' to hide WhatsApp buttons.
  whatsapp: '447391051035',
  email: 'thesmallcardoc@gmail.com',
  area: 'Exeter, Devon',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Exeter%2C+Devon',
};

export const pricing = {
  day: 65,
  weekend: 80, // Saturday + Sunday
  weekdays: 100, // Monday to Friday
  extraDay: 15,
  deposit: 150, // returned when the trailer comes back on time
};

export const trailer = {
  make: 'Brian James Trailers',
  model: '16ft twin-axle car transporter',
  unladenWeightKg: 450,
  grossWeightKg: 2700,
  payloadKg: 2250, // gross minus unladen
  included: ['Manual winch', 'wheel straps'],
};

export const whatsappLink = (text = '') =>
  business.whatsapp
    ? `https://wa.me/${business.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`
    : '';
