import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: "You are an AI assistant integrated into a personal knowledge management app. Provide concise, highly relevant, and beautifully formatted responses. Do not wrap tags in markdown if asked for a list. If asked for JSON, respond ONLY with valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 1,
      top_p: 1,
      max_tokens: 4096,
      stream: false
    });

    const reasoning = completion.choices[0]?.message?.reasoning_content;
    let text = completion.choices[0]?.message?.content;

    if (!text) {
      return res.status(500).json({ error: "Received an empty response from Nvidia AI backend." });
    }

    // Optionally include reasoning in the output or log it
    if (reasoning) {
      console.log("Reasoning:", reasoning);
      // text = `*Reasoning:*\n${reasoning}\n\n${text}`;
    }

    return res.status(200).json({ result: text });
  } catch (error) {
    console.error("Backend Error in chat.js:", error);
    return res.status(500).json({ error: error.message || "Failed to communicate securely with Nvidia API." });
  }
}
