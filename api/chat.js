export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Retrieve API key securely from Vercel's environment variables
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: NVIDIA_API_KEY is not securely set in the environment variables.' });
  }

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "bytedance/seed-oss-36b-instruct",
        messages: [
          { role: "system", content: "You are an AI assistant integrated into a personal knowledge management app. Provide concise, highly relevant, and beautifully formatted responses. Do not wrap tags in markdown if asked for a list. If asked for JSON, respond ONLY with valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 1.1,
        top_p: 0.95,
        max_tokens: 4096,
        frequency_penalty: 0,
        presence_penalty: 0,
        thinking_budget: -1
      })
    });

    if (!response.ok) {
      if (response.status === 403) {
        return res.status(403).json({ error: "403 Forbidden: NVIDIA API key may be invalid, or explicit Terms of Service acceptance is missing." });
      }
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errData?.error?.message || `HTTP error! status: ${response.status}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(500).json({ error: "Received an empty response from Nvidia AI backend." });
    }

    // Success
    return res.status(200).json({ result: text });
  } catch (error) {
    console.error("Backend Error in chat.js:", error);
    return res.status(500).json({ error: error.message || "Failed to communicate securely with Nvidia API." });
  }
}
