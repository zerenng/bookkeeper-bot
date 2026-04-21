const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const { updateGoogleSheet } = require('./sheets');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const conversations = {};  // Stores chat history per user

const SYSTEM_PROMPT = `You are a WhatsApp bookkeeper bot for a reselling business.
Track purchases, sales, km travelled and tolls.
Always reply in JSON: {"message": "...", "action": null|"LOG_PURCHASE"|"LOG_SALE",
"data": {item, cogs, soldPrice, km, tolls}}.
Be friendly, use emojis, keep it concise. Currency is RM.`;

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  if (!conversations[from]) conversations[from] = [];
  conversations[from].push({ role: 'user', content: body });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: conversations[from]
  });

  const raw = response.content[0].text;
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = { message: raw }; }
  conversations[from].push({ role: 'assistant', content: raw });

  if (parsed.action === 'LOG_PURCHASE' || parsed.action === 'LOG_SALE') {
    await updateGoogleSheet(parsed.data, parsed.action);
  }

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(parsed.message || 'Error processing request');
  res.type('text/xml').send(twiml.toString());
});

app.listen(process.env.PORT || 3000, () => console.log('Bot running!'));
