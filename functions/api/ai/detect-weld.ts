interface Env {
  AI: any;
  AI_MODEL?: string;
}

type DetectionResult = {
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  polygon?: Array<{ x: number; y: number }>; // 0-1000 coordinates
  description?: string;
};

const parseBBox = (text: string): [number, number, number, number] | null => {
  if (!text) return null;
  const match = text.match(/\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/);
  if (!match) return null;
  const [, ymin, xmin, ymax, xmax] = match.map(Number);
  return [ymin, xmin, ymax, xmax];
};

const makeRectanglePolygon = ([ymin, xmin, ymax, xmax]: [number, number, number, number]) => [
  { x: xmin, y: ymin },
  { x: xmax, y: ymin },
  { x: xmax, y: ymax },
  { x: xmin, y: ymax },
];

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const mode = (formData.get('mode') as string | null) || 'bbox'; // bbox | segmentation
    const requestedModel = (formData.get('model') as string | null)?.trim();
    // Try user-requested/override first, then env default, then a strong set including Qwen3-VL.
    const modelOrder = [
      requestedModel,
      env.AI_MODEL,
      'qwen3-vl:235b-instruct-cloud',
      '@cf/llava-hf/llava-1.6-mistral-7b',
      '@cf/llava-hf/llava-1.5-7b-hf',
      '@cf/microsoft/phi-3.5-vision-instruct'
    ].filter(Boolean) as string[];

    if (!file) {
      return new Response('No image provided', { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const imageArray = Array.from(uint8Array);

    // Primary bbox detection with model fallback list
    const bboxPrompt = "Locate ONLY the weld bead and its immediate HAZ. Exclude background, table, and unused plate. Return a tight bounding box as [ymin, xmin, ymax, xmax] (0-1000). Only return the numbers.";

    let bbox: [number, number, number, number] | null = null;
    let description = '';
    if (env.AI) {
      for (const model of modelOrder) {
        try {
          const detection = await env.AI.run(model, { image: imageArray, prompt: bboxPrompt });
          description = detection?.description || JSON.stringify(detection);
          bbox = parseBBox(description);
          if (bbox) break;
        } catch (e) {
          // try next model
        }
      }
    }

    if (!bbox) {
      // Safe fallback to full image bbox to avoid 422s on the client
      bbox = [0, 0, 1000, 1000];
      description = description || 'fallback-full-image';
    }

    // If the box is extremely loose, gently contract it toward center to bias isolation
    const tightenLooseBox = ([ymin, xmin, ymax, xmax]: [number, number, number, number]) => {
      const width = xmax - xmin;
      const height = ymax - ymin;
      const tooWide = width > 700; // >70% of frame
      const tooTall = height > 700;
      if (!tooWide && !tooTall) return [ymin, xmin, ymax, xmax] as [number, number, number, number];
      // shrink harder when very loose
      const shrinkX = width * 0.2;
      const shrinkY = height * 0.2;
      const nxmin = Math.max(0, xmin + shrinkX);
      const nxmax = Math.min(1000, xmax - shrinkX);
      const nymin = Math.max(0, ymin + shrinkY);
      const nymax = Math.min(1000, ymax - shrinkY);
      return [nymin, nxmin, nymax, nxmax] as [number, number, number, number];
    };

    bbox = tightenLooseBox(bbox);

    const result: DetectionResult = {
      bbox,
      description
    };

    // Optional segmentation mode: request a coarse polygon mask
    if (mode === 'segmentation') {
      // Some models can emit polygon-like points; this is a coarse heuristic prompt.
      try {
        const segPrompt = "Trace the weld bead outline. Return polygon points as [[x1,y1],[x2,y2],...,[xn,yn]] with values 0-1000. Keep points minimal (<=18).";
        const segModelOrder = [requestedModel, env.AI_MODEL, 'qwen3-vl:235b-instruct-cloud', '@cf/llava-hf/llava-1.6-mistral-7b', '@cf/llava-hf/llava-1.5-7b-hf', '@cf/microsoft/phi-3.5-vision-instruct'].filter(Boolean) as string[];
        for (const segModel of segModelOrder) {
          try {
            const seg = await env.AI.run(segModel, {
              image: imageArray,
              prompt: segPrompt
            });
            const segText = seg?.description || JSON.stringify(seg);
            const polyMatch = segText.match(/\[\s*\[(.*?)\]\s*\]/);
            if (polyMatch) {
              const arr = JSON.parse(`[${polyMatch[1]}]`);
              const polygon = Array.isArray(arr)
                ? arr
                    .map((p: any) => ({ x: Number(p[0]), y: Number(p[1]) }))
                    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
                : [];
              if (polygon.length >= 3) {
                result.polygon = polygon;
                break;
              }
            }
          } catch (_) {
            // try next segmentation model
          }
        }
      } catch (_) {
        // ignore segmentation failures; fallback below
      }
      if (!result.polygon) {
        // fall back to rectangle polygon
        result.polygon = makeRectanglePolygon(bbox);
      }
    }

    // Always include a rectangle polygon for convenience
    if (!result.polygon) {
      result.polygon = makeRectanglePolygon(bbox);
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
