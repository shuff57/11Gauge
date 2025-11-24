<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ARYaFdx2arW9joHVDoUfDS06cWXXwmXp

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create an `.env.local` file and set any provider keys you want to preload:
   ```
   GEMINI_API_KEY="your-gemini-key"
   OLLAMA_URL="https://ollama.com/api"
   # Leave this unset to keep the default cloud vision model
   OLLAMA_MODEL="llama3.2-vision"
   OLLAMA_API_KEY="your-shared-ollama-key"
   ```
3. Run the app:
   `npm run dev`

## Cloudflare Pages Functions proxy

- The app calls `/api/ollama/generate` and `/api/ollama/test`, which are implemented under `functions/api/ollama/` for deployment on Cloudflare Pages Functions.
- Provide `OLLAMA_URL`, `OLLAMA_MODEL` (optional), and `OLLAMA_API_KEY` as environment variables locally (`.env.local`) and in your Pages project settings so the proxy can reach Ollama Cloud.
- Users can still supply their own URL/key via the Settings modal; the proxy simply forwards those credentials server-side to avoid browser CORS blocks.
