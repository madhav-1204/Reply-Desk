// Ollama client and prompt pipeline for Reply Desk

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';

// Check if Ollama is running and responding
async function checkHealth() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}`);
    }
    return { status: 'ok', model: OLLAMA_MODEL, host: OLLAMA_HOST };
  } catch (err) {
    throw new Error('Could not reach Ollama. Start it with: ollama serve');
  }
}

// Step 1: Classify sentiment
// Uses star rating as a hint if provided, and falls back to star rating if output is invalid.
async function classifySentiment({ reviewText, starRating }) {
  const stars = typeof starRating === 'number' && starRating >= 1 && starRating <= 5 ? starRating : null;
  const starsHint = stars ? `(${stars} out of 5 stars)` : '';

  const prompt = `Classify customer review sentiment as: positive, neutral, or negative.

Examples:
Review: "Fantastic service and delicious food!" (5 stars)
Sentiment: positive

Review: "Decent place. Food was average, prices were fair." (3 stars)
Sentiment: neutral

Review: "Awful experience, rude manager and dirty tables." (1 star)
Sentiment: negative

Now classify this review:
Review: "${(reviewText || '').trim()}" ${starsHint}
Sentiment:`;

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          stop: ['\n', '.', ',']
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`Ollama error: ${res.statusText}`);
    }

    const data = await res.json();
    let sentiment = (data.response || '').trim().toLowerCase().replace(/[^a-z]/g, '');

    if (sentiment === 'positive' || sentiment === 'neutral' || sentiment === 'negative') {
      return sentiment;
    }
  } catch (err) {
    console.warn('Sentiment model classification failed, using star rating fallback:', err.message);
  }

  // Fallback to star rating if model classification fails or output is invalid
  if (stars !== null) {
    if (stars >= 4) return 'positive';
    if (stars === 3) return 'neutral';
    return 'negative';
  }

  return 'neutral';
}

// Step 2: Build prompt with business profile, tone, length, sentiment, and matched few-shot examples
function buildReplyPrompt({ reviewText, starRating, sentiment, tone, length, profile }) {
  const businessName = profile.businessName || 'Our Business';
  const businessType = profile.businessType || 'local business';
  const ownerName = profile.ownerName || 'The Owner';
  const toneNotes = profile.toneNotes || 'Warm and professional';
  const neverSay = profile.neverSay || 'Never promise refunds or discounts';

  const lengthInstructions = length === 'medium'
    ? 'Write 2 to 3 sentences for the main body.'
    : 'Write 1 to 2 short sentences for the main body.';

  let negativeGuideline = '';
  if (sentiment === 'negative' || tone === 'apologetic') {
    negativeGuideline = `For this negative review:
- Thank the customer for the feedback and apologize for their experience.
- Address the specific issue mentioned without making excuses.
- Invite them to contact us directly to discuss further.
- Do not argue and do not admit legal fault.`;
  }

  // Matched few-shot examples
  let fewShot = '';
  if (sentiment === 'positive') {
    fewShot = `Example 1:
Review: "Loved the sourdough bread and cinnamon rolls!" (5 stars)
Reply:
Thank you so much for the kind words! We take great pride in our sourdough and are thrilled the cinnamon rolls hit the spot. We look forward to seeing you again soon.

Example 2:
Review: "Quick stop for coffee, lovely atmosphere." (4 stars)
Reply:
Thanks for stopping by! We're glad you enjoyed the atmosphere and hope to see you next time you're in the neighborhood.`;
  } else if (sentiment === 'neutral') {
    fewShot = `Example 1:
Review: "Pastries were good, but parking was tough." (3 stars)
Reply:
Thank you for visiting and for sharing your thoughts. We are glad you enjoyed the pastries, and we understand parking can be challenging during peak hours. We appreciate your patience and feedback.

Example 2:
Review: "Average haircut, price was okay." (3 stars)
Reply:
Thank you for visiting us. We appreciate your feedback and hope to give you an even better experience on your next appointment.`;
  } else {
    fewShot = `Example 1:
Review: "Ordered a birthday cake and the frosting was completely melted when picked up." (1 star)
Reply:
Thank you for bringing this to our attention, and I sincerely apologize for the condition of your cake. This is certainly not the standard we hold ourselves to. Please reach out to us directly so we can speak with you and look into this.

Example 2:
Review: "Rude cashier, waited 20 minutes for a cold latte." (1 star)
Reply:
Thank you for sharing your experience, and I am very sorry for the wait and the poor service you received. We expect much better from our team. Please get in touch with us directly so we can hear more about your visit.`;
  }

  const starText = starRating ? ` (${starRating} out of 5 stars)` : '';

  return `You write genuine, professional review replies for ${businessName} (${businessType}).
Owner: ${ownerName}
Desired Tone: ${tone}
Tone notes: ${toneNotes}
Length requirement: ${lengthInstructions}
Strict rules:
1. ${neverSay}
2. Only reference details that appear in the review. Never invent facts, discounts, or phone numbers.
${negativeGuideline}

${fewShot}

Now write the reply for this review. Do not include sign-off or quotes:
Review: "${(reviewText || '').trim()}"${starText}
Reply:`;
}

// Step 3: Post-process the reply
function postProcessReply(rawText, profile, length) {
  if (!rawText) return '';

  let text = rawText.trim();

  // Strip preambles
  text = text.replace(/^(here('s| is) (a |your |the )?(generated )?reply:?|reply:?|response:?)\s*/i, '');

  // Strip surrounding quotes (regular and curly quotes)
  text = text.replace(/^[“"'\`]+|[”"'\`]+$/g, '');
  text = text.replace(/^["'`]+|["'`]+$/g, '');

  // Strip markdown formatting (*italics*, **bold**)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');

  // Strip accidental trailing prompt tokens or "Example" headers
  text = text.split(/Example \d+:|Review:|\n\nReply:/i)[0].trim();

  // Clean trailing sign-offs generated by model if any
  const signoff = profile.preferredSignoff || `${profile.ownerName || 'The Owner'}\n${profile.businessName || ''}`.trim();
  const signoffLines = signoff.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);

  let body = text;
  for (const line of signoffLines) {
    const idx = body.toLowerCase().lastIndexOf(line);
    if (idx !== -1 && idx > body.length - 120) {
      body = body.slice(0, idx).trim();
    }
  }

  // Remove common trailing sign-off signifiers (e.g. "Warm regards,", "Sincerely,")
  body = body.replace(/(Warm regards|Best regards|Sincerely|Thanks again|Cheers|Best|With regards),?\s*$/i, '').trim();

  // Enforce max length by sentence count
  const maxSentences = length === 'short' ? 2 : 4;
  // Match sentences ending in punctuation
  const sentences = body.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (sentences && sentences.length > maxSentences) {
    body = sentences.slice(0, maxSentences).join('').trim();
  }

  // Ensure it ends with the owner's configured sign-off
  if (signoff) {
    return `${body}\n\n${signoff}`;
  }
  return body;
}

// Generate reply with stream support
async function generateReply({ reviewText, starRating, sentiment, tone, length, profile }) {
  const prompt = buildReplyPrompt({ reviewText, starRating, sentiment, tone, length, profile });

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.7
      }
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.statusText}`);
  }

  const data = await res.json();
  const rawReply = data.response || '';
  return postProcessReply(rawReply, profile, length);
}

module.exports = {
  OLLAMA_MODEL,
  checkHealth,
  classifySentiment,
  buildReplyPrompt,
  postProcessReply,
  generateReply
};
