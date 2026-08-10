import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const mockVercelApiPlugin = (env) => ({
  name: 'mock-vercel-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.originalUrl === '/api/chat' && req.method === 'POST') {
        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const body = Buffer.concat(chunks).toString();
          const parsed = body ? JSON.parse(body) : {};
          const apiKey = env.NVIDIA_API_KEY;

            if (!apiKey) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Local error: NVIDIA_API_KEY missing from .env.local' }));
              return;
            }

            const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                  { role: "system", content: "You are an AI assistant integrated into a personal knowledge management app. Provide concise, highly relevant, and beautifully formatted responses. Do not wrap tags in markdown if asked for a list. If asked for JSON, respond ONLY with valid JSON." },
                  { role: "user", content: parsed.prompt }
                ],
                temperature: 1.1, top_p: 0.95, max_tokens: 4096
              })
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              res.statusCode = response.status;
              res.end(JSON.stringify({ error: errData?.error?.message || `HTTP error! status: ${response.status}` }));
              return;
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content;
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ result: text }));
          } catch (e) {
            console.error("Vite Local Mock Error:", e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message || 'Server error' }));
          }
        return;
      }
      next();
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      mockVercelApiPlugin(env)
    ],
    build: {
      chunkSizeWarningLimit: 1600,
    }
  };
})
