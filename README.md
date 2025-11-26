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
   OLLAMA_MODEL="qwen3-vl:235b-instruct-cloud"
   OLLAMA_API_KEY="your-shared-ollama-key"
   ```
3. Start the local Ollama proxy (new terminal):
   `npm run dev:proxy`
4. Run the app:
   `npm run dev`

## Photo + Video uploads

- Upload standard photos (JPG/PNG) or short videos (MP4/MOV/WebM) directly from your device.
- Videos are limited to ~45 seconds and ~80MB to keep frame extraction responsive during local analysis.
- When a video is uploaded or recorded from your camera, the app samples a handful of frames in chronological order and sends them to the selected vision model, so you can reuse the same **Analyze** flow for both media types.

## Cloudflare Pages Functions proxy

- The app calls `/api/ollama/generate` and `/api/ollama/test`, which are implemented under `functions/api/ollama/` for deployment on Cloudflare Pages Functions.
- Provide `OLLAMA_URL`, `OLLAMA_MODEL` (optional), and `OLLAMA_API_KEY` as environment variables locally (`.env.local`) and in your Pages project settings so the proxy can reach Ollama Cloud.
- Users can still supply their own URL/key via the Settings modal; the proxy simply forwards those credentials server-side to avoid browser CORS blocks.
- To store Ollama API keys securely after a successful connection test, bind a KV namespace named `KEY_STORE` (or update the binding name in code) to your Pages project. The `/api/keys/ollama` route writes or deletes the key in that namespace.
- Clearing keys: `curl -X DELETE https://<your-domain>/api/keys/ollama`
