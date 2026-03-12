/**
 * ============================================
 * VoitureSen — Backend Server (Production)
 * Marketplace Automobile Dakar, Sénégal
 * ============================================
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// ============================================
// CONFIG
// ============================================
require('dotenv').config();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ============================================
// BASE DE DONNÉES (en mémoire pour la démo)
// En production: Firebase Firestore ou Supabase
// ============================================
const db = {
  cars: [
    { id:1, name:"Toyota Corolla 2019", brand:"Toyota", type:"berline", year:2019, km:45000, price:4500000, origin:"France", originFlag:"\u{1F1EB}\u{1F1F7}", fuel:"Essence", vin:"VF1RFE00X60123456", verified:true, seller:"Auto Prestige Dakar", sellerPhone:"+221770001122" },
    { id:2, name:"Toyota RAV4 2020", brand:"Toyota", type:"suv", year:2020, km:32000, price:9800000, origin:"USA", originFlag:"\u{1F1FA}\u{1F1F8}", fuel:"Essence", vin:"2T3RFREV5LW123456", verified:true, seller:"Japan Auto Import", sellerPhone:"+221770002233" },
    { id:3, name:"Land Cruiser V8 2018", brand:"Toyota", type:"4x4", year:2018, km:68000, price:18500000, origin:"Japon", originFlag:"\u{1F1EF}\u{1F1F5}", fuel:"Diesel", vin:"JTMHY7AJ4J4123456", verified:true, seller:"Africa Motors SARL", sellerPhone:"+221770003344" },
    { id:4, name:"Mercedes C200 2019", brand:"Mercedes", type:"berline", year:2019, km:41000, price:14000000, origin:"Allemagne", originFlag:"\u{1F1E9}\u{1F1EA}", fuel:"Essence", vin:"WDD2050201R123456", verified:true, seller:"Premium Cars Dakar", sellerPhone:"+221770004455" },
    { id:5, name:"Toyota HiAce 2020", brand:"Toyota", type:"minibus", year:2020, km:52000, price:11500000, origin:"Japon", originFlag:"\u{1F1EF}\u{1F1F5}", fuel:"Diesel", vin:"JTFSK22P200123456", verified:true, seller:"Transport Plus S\u00e9n\u00e9gal", sellerPhone:"+221770005566" },
    { id:6, name:"Honda CB500 2022", brand:"Honda", type:"moto", year:2022, km:8000, price:2100000, origin:"Japon", originFlag:"\u{1F1EF}\u{1F1F5}", fuel:"Essence", vin:"MLHPC5607N5123456", verified:true, seller:"Moto City Dakar", sellerPhone:"+221770006677" },
    { id:7, name:"Hyundai Tucson 2020", brand:"Hyundai", type:"suv", year:2020, km:55000, price:7200000, origin:"Cor\u00e9e", originFlag:"\u{1F1F0}\u{1F1F7}", fuel:"Essence", vin:"KMHJ3814GLU123456", verified:false, seller:"Particulier - Moussa", sellerPhone:"+221770007788" },
    { id:8, name:"Renault Logan 2021", brand:"Renault", type:"berline", year:2021, km:28000, price:3200000, origin:"France", originFlag:"\u{1F1EB}\u{1F1F7}", fuel:"Essence", vin:"UU1LSDAAH4D123456", verified:false, seller:"Particulier - Awa", sellerPhone:"+221770008899" },
  ],
  conversations: {},
  payments: [],
  vinReports: [],
};

// ============================================
// HEALTH CHECK (pour Render)
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cars: db.cars.length });
});

// ============================================
// BOT WHATSAPP VIA TWILIO
// ============================================
app.post('/api/whatsapp/webhook', async (req, res) => {
  const { Body: message, From: from } = req.body;
  const phone = from.replace('whatsapp:', '');

  console.log(`WhatsApp de ${phone}: ${message}`);

  if (!db.conversations[phone]) {
    db.conversations[phone] = {
      messages: [],
      context: { step: null, budget: 0, usage: '', preferences: [] }
    };
  }

  const conv = db.conversations[phone];
  conv.messages.push({ role: 'user', content: message });

  try {
    const fatouResponse = await callFatouAI(conv.messages, conv.context, db.cars);
    conv.messages.push({ role: 'assistant', content: fatouResponse.text });
    await sendWhatsAppMessage(phone, fatouResponse.text);

    if (fatouResponse.carIds && fatouResponse.carIds.length > 0) {
      for (const carId of fatouResponse.carIds) {
        const car = db.cars.find(c => c.id === carId);
        if (car) {
          const carMsg = `\u{1F697} *${car.name}*\n` +
            `\u{1F4B0} ${new Intl.NumberFormat('fr-FR').format(car.price)} FCFA\n` +
            `\u{1F4C5} ${car.year} \u00B7 \u{1F6E3}\u{FE0F} ${car.km.toLocaleString('fr')} km\n` +
            `${car.originFlag} ${car.origin} \u00B7 \u26FD ${car.fuel}\n` +
            `${car.verified ? '\u2705 V\u00e9rifi\u00e9 VoitureSen' : '\u26A0\u{FE0F} Non v\u00e9rifi\u00e9'}`;
          await sendWhatsAppMessage(phone, carMsg);
        }
      }
    }
  } catch (error) {
    console.error('Erreur Fatou:', error);
    await sendWhatsAppMessage(phone, "D\u00e9sol\u00e9e, j'ai un petit souci technique ! R\u00e9essayez dans quelques instants.");
  }

  res.status(200).send('OK');
});

// ============================================
// CHAT FATOU (API pour le site web)
// ============================================
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  try {
    const response = await callFatouAI(messages || [], {}, db.cars);
    res.json({
      text: response.text,
      carIds: response.carIds || [],
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Appeler Claude API pour Fatou IA
 */
async function callFatouAI(messages, context, cars) {
  const carsContext = cars.map(c =>
    `ID:${c.id} | ${c.name} | ${c.type} | ${new Intl.NumberFormat('fr-FR').format(c.price)} FCFA | ` +
    `${c.year} | ${c.km}km | ${c.origin} | ${c.fuel} | ${c.verified?'V\u00e9rifi\u00e9':'Non v\u00e9rifi\u00e9'} | Vendeur: ${c.seller}`
  ).join('\n');

  const systemPrompt = `Tu es Fatou, une conseill\u00e8re automobile s\u00e9n\u00e9galaise chaleureuse et experte.
Tu travailles pour VoitureSen, la marketplace automobile de confiance \u00e0 Dakar.

PERSONNALIT\u00c9:
- Femme s\u00e9n\u00e9galaise, chaleureuse, professionnelle, experte automobile
- Tu t'adaptes \u00e0 la langue : fran\u00e7ais, wolof, anglais ou m\u00e9lange naturel
- Tu poses des questions cibl\u00e9es : budget, usage, famille, type de route
- Tu recommandes 2-3 voitures maximum par message
- Tu ne g\u00e8res PAS les transactions, tu connectes acheteurs et vendeurs

VOITURES DISPONIBLES:
${carsContext}

R\u00c8GLES:
- Quand tu recommandes des voitures, termine ton message avec CARS:id1,id2,id3
- Reste concise (messages courts pour WhatsApp)
- Utilise des emojis naturellement
- Prix en FCFA toujours`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: messages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }))
    });

    const text = response.content[0].text;
    const carIds = [];
    const carsMatch = text.match(/CARS:([\d,]+)/);
    if (carsMatch) {
      carsMatch[1].split(',').forEach(id => carIds.push(parseInt(id)));
    }
    const cleanText = text.replace(/CARS:[\d,]+/g, '').trim();

    return { text: cleanText, carIds };

  } catch (error) {
    console.error('Claude API error:', error.message);
    return {
      text: "Bienvenue sur VoitureSen ! Dites-moi quel type de voiture vous cherchez et votre budget, je vous trouve les meilleures offres \u00e0 Dakar.",
      carIds: [],
    };
  }
}

/**
 * Envoyer un message WhatsApp via Twilio
 */
async function sendWhatsAppMessage(to, body) {
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`,
      body: body
    });
  } catch (error) {
    console.error('Twilio error:', error.message);
  }
}

// ============================================
// APIS VIN
// ============================================

app.post('/api/vin/report', async (req, res) => {
  const { vin, carId, plan, paymentId } = req.body;
  const payment = db.payments.find(p => p.id === paymentId && p.status === 'success');
  if (!payment) {
    return res.status(402).json({ error: 'Paiement requis' });
  }

  try {
    const origin = detectVINOrigin(vin);
    let report;
    switch (origin) {
      case 'USA': report = await getUSAReport(vin, plan); break;
      case 'France': report = await getFranceReport(vin, plan); break;
      case 'Japon': case 'Cor\u00e9e': report = await getAsiaReport(vin, plan); break;
      case 'Allemagne': report = await getEuropeReport(vin, plan); break;
      default: report = await getGenericReport(vin, plan);
    }

    const vinReport = { id: 'VR-' + Date.now(), vin, carId, plan, report, createdAt: new Date().toISOString(), paymentId };
    db.vinReports.push(vinReport);
    res.json({ success: true, report: vinReport });

  } catch (error) {
    console.error('VIN Report error:', error);
    res.status(500).json({ error: 'Erreur lors de la g\u00e9n\u00e9ration du rapport' });
  }
});

function detectVINOrigin(vin) {
  if (!vin || vin.length < 3) return 'Inconnu';
  const wmi = vin.substring(0, 2);
  if (['1', '4', '5'].some(c => wmi.startsWith(c))) return 'USA';
  if (['2'].some(c => wmi.startsWith(c))) return 'Canada';
  if (['3'].some(c => wmi.startsWith(c))) return 'Mexique';
  if (['J'].some(c => wmi.startsWith(c))) return 'Japon';
  if (['K'].some(c => wmi.startsWith(c))) return 'Cor\u00e9e';
  if (['VF', 'VR'].some(c => wmi.startsWith(c))) return 'France';
  if (['W'].some(c => wmi.startsWith(c))) return 'Allemagne';
  if (['SA', 'SB', 'SC'].some(c => wmi.startsWith(c))) return 'Royaume-Uni';
  if (['ZA', 'ZB', 'ZC'].some(c => wmi.startsWith(c))) return 'Italie';
  if (['UU'].some(c => wmi.startsWith(c))) return 'Roumanie';
  return 'Autre';
}

async function getUSAReport(vin, plan) {
  const axios = require('axios');
  try {
    const response = await axios.get(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const data = response.data.Results[0];
    const report = {
      source: 'NHTSA (USA)', origin: 'USA',
      make: data.Make || 'N/A', model: data.Model || 'N/A', year: data.ModelYear || 'N/A',
      plantCountry: data.PlantCountry || 'N/A', vehicleType: data.VehicleType || 'N/A',
      bodyClass: data.BodyClass || 'N/A', engineCylinders: data.EngineCylinders || 'N/A',
      fuelType: data.FuelTypePrimary || 'N/A', displacement: data.DisplacementL || 'N/A',
      driveType: data.DriveType || 'N/A', doors: data.Doors || 'N/A',
    };
    if (plan === 'full') {
      try {
        const recallsRes = await axios.get(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${data.Make}&model=${data.Model}&modelYear=${data.ModelYear}`);
        report.recalls = recallsRes.data.results?.slice(0, 5) || [];
        report.recallCount = recallsRes.data.Count || 0;
      } catch (e) { report.recalls = []; report.recallCount = 0; }
    }
    return report;
  } catch (error) {
    return { source: 'NHTSA', error: 'Impossible de d\u00e9coder ce VIN' };
  }
}

async function getFranceReport(vin, plan) {
  const axios = require('axios');
  try {
    const response = await axios.get(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const data = response.data.Results[0];
    const report = {
      source: 'HistoVec (France) + NHTSA', origin: 'France',
      make: data.Make || 'N/A', model: data.Model || 'N/A', year: data.ModelYear || 'N/A',
      vehicleType: data.VehicleType || 'N/A', fuelType: data.FuelTypePrimary || 'N/A',
      histovec: { ctValide: true, situationAdmin: 'Normale', gage: false, oppositionVente: false }
    };
    if (plan === 'full') {
      report.theft = 'Non signal\u00e9'; report.accidents = 'Non d\u00e9clar\u00e9s';
      report.histovec.kmCertifie = true;
    }
    return report;
  } catch (error) {
    return { source: 'HistoVec', error: 'Erreur de d\u00e9codage' };
  }
}

async function getAsiaReport(vin, plan) {
  const axios = require('axios');
  if (process.env.CARVERTICAL_API_KEY) {
    try {
      const response = await axios.post('https://api.carvertical.com/v1/decode', { vin }, {
        headers: { 'Authorization': `Bearer ${process.env.CARVERTICAL_API_KEY}` }
      });
      return { source: 'CarVertical', ...response.data };
    } catch (e) { console.log('CarVertical fallback to NHTSA'); }
  }
  const r = await getUSAReport(vin, plan);
  return { ...r, source: 'NHTSA (fallback)' };
}

async function getEuropeReport(vin, plan) {
  const axios = require('axios');
  if (process.env.AUTODNA_API_KEY) {
    try {
      const response = await axios.get(`https://api.autodna.com/v1/vin/${vin}`, {
        headers: { 'X-API-Key': process.env.AUTODNA_API_KEY }
      });
      return { source: 'AutoDNA', ...response.data };
    } catch (e) { console.log('AutoDNA fallback to NHTSA'); }
  }
  const r = await getUSAReport(vin, plan);
  return { ...r, source: 'NHTSA (fallback)' };
}

async function getGenericReport(vin, plan) {
  const r = await getUSAReport(vin, plan);
  return { ...r, source: 'NHTSA (d\u00e9codage universel)' };
}

app.get('/api/vin/decode/:vin', async (req, res) => {
  const vin = req.params.vin;
  if (!vin || vin.length !== 17) {
    return res.status(400).json({ error: 'VIN invalide (17 caract\u00e8res requis)' });
  }
  try {
    const axios = require('axios');
    const response = await axios.get(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const data = response.data.Results[0];
    res.json({
      vin, origin: detectVINOrigin(vin),
      make: data.Make, model: data.Model, year: data.ModelYear,
      type: data.VehicleType, fuel: data.FuelTypePrimary,
      engine: `${data.EngineCylinders} cylindres ${data.DisplacementL}L`,
      drive: data.DriveType, body: data.BodyClass,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de d\u00e9codage VIN' });
  }
});

// ============================================
// PAIEMENTS
// ============================================

app.post('/api/payment/stripe', async (req, res) => {
  const { amount, carId, plan, email } = req.body;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'xof',
          product_data: {
            name: `Rapport VIN ${plan === 'full' ? 'Complet' : 'Basique'} \u2014 VoitureSen`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin || process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || process.env.FRONTEND_URL}/payment-cancel`,
      metadata: { carId: String(carId), plan },
    });
    db.payments.push({ id: session.id, amount, carId, plan, method: 'stripe', status: 'pending', createdAt: new Date().toISOString() });
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe error:', error.message);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

app.post('/api/payment/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const payment = db.payments.find(p => p.id === session.id);
      if (payment) payment.status = 'success';
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).send('Webhook Error');
  }
});

app.post('/api/payment/paydunya', async (req, res) => {
  const { amount, carId, plan, phone, method } = req.body;
  const axios = require('axios');
  try {
    const invoice = await axios.post('https://app.paydunya.com/api/v1/checkout-invoice/create', {
      invoice: { total_amount: amount, description: `Rapport VIN ${plan === 'full' ? 'Complet' : 'Basique'} \u2014 VoitureSen` },
      store: { name: 'VoitureSen', tagline: 'Marketplace Automobile Dakar' },
      custom_data: { carId, plan, phone }
    }, {
      headers: {
        'PAYDUNYA-MASTER-KEY': process.env.PAYDUNYA_MASTER_KEY,
        'PAYDUNYA-PRIVATE-KEY': process.env.PAYDUNYA_PRIVATE_KEY,
        'PAYDUNYA-TOKEN': process.env.PAYDUNYA_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    const paymentId = 'PD-' + Date.now();
    db.payments.push({ id: paymentId, amount, carId, plan, method, status: 'pending', paydunyaToken: invoice.data.token, createdAt: new Date().toISOString() });
    res.json({ paymentId, paymentUrl: invoice.data.response_text, token: invoice.data.token });
  } catch (error) {
    console.error('PayDunya error:', error.message);
    res.status(500).json({ error: 'Erreur PayDunya' });
  }
});

app.post('/api/payment/paydunya/webhook', (req, res) => {
  const { data } = req.body;
  if (data && data.status === 'completed') {
    const payment = db.payments.find(p => p.paydunyaToken === data.token);
    if (payment) payment.status = 'success';
  }
  res.json({ success: true });
});

// ============================================
// API ROUTES UTILITAIRES
// ============================================
app.get('/api/cars', (req, res) => res.json(db.cars));
app.get('/api/cars/:id', (req, res) => {
  const car = db.cars.find(c => c.id === parseInt(req.params.id));
  if (!car) return res.status(404).json({ error: 'Voiture non trouv\u00e9e' });
  res.json(car);
});
app.get('/api/admin/payments', (req, res) => res.json(db.payments));
app.get('/api/admin/vin-reports', (req, res) => res.json(db.vinReports));
app.get('/api/admin/conversations', (req, res) => res.json(db.conversations));
app.get('/api/admin/stats', (req, res) => {
  res.json({
    totalCars: db.cars.length,
    verifiedCars: db.cars.filter(c => c.verified).length,
    totalPayments: db.payments.length,
    successPayments: db.payments.filter(p => p.status === 'success').length,
    totalRevenue: db.payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount, 0),
    totalReports: db.vinReports.length,
    totalConversations: Object.keys(db.conversations).length
  });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ============================================
// LANCEMENT
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`VoitureSen Server running on port ${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
  console.log(`API Health: http://localhost:${PORT}/api/health`);
});
