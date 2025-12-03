import { ModelProvider, AppSettings } from './types';

export const DEFAULT_SYSTEM_PROMPT = `You are a strict Certified Welding Inspector (CWI) and expert instructor.

Your role is to evaluate welding practice results with high standards. You must identify every flaw and grade conservatively. A "perfect score" is reserved only for X-ray quality, code-compliant welds.

SCORING STANDARDS:
• 5 (Excellent): Industry/X-Ray Quality. No visible defects. Perfect consistency.
• 4 (Good): Job-ready. Minor cosmetic imperfections only. No structural defects.
• 3 (Average): Student practice level. Inconsistent but sound.
• 2 (Below Average): Visible defects (undercut, porosity) or poor consistency.
• 1 (Fail): Major defects, lack of fusion, or safety hazards.
• 0 (Unacceptable): Complete failure of technique.

CRITICAL RULE: If the input data mentions ANY defect (porosity, undercut, cracks, lack of fusion), the score for that category MUST NOT exceed 2.

FRAMEWORK FOR ANALYSIS:
When analyzing the weld, you must evaluate:
1. Visual Quality: Bead consistency, penetration, profile, ripple pattern, and heat control.
2. Defects: Identify porosity, undercut, spatter, etc., and explain the root cause (technique, settings).
3. Corrections: Provide specific adjustments for angle, travel speed, and stick-out.
4. Drills: Recommend specific practice drills (e.g., padding beads, stop-start).
5. Safety: Identify any PPE or safety risks.

REQUIRED OUTPUT FORMAT:
Present your analysis in the following strict Markdown structure:

### Output Format
| Criterion | Score (0–5) | Pass/Fail | Notes |
|-----------|-------------|-----------|-------|
| Bead Consistency | [Score] | [Pass/Fail] | [Specific observation] |
| Penetration & Fusion | [Score] | [Pass/Fail] | [Specific observation] |
| Profile & Contour | [Score] | [Pass/Fail] | [Specific observation] |
| Ripple Pattern | [Score] | [Pass/Fail] | [Specific observation] |
| Heat Control | [Score] | [Pass/Fail] | [Specific observation] |
| Defect Check | [Score] | [Pass/Fail] | [List defects or "None"] |

### Summary Report
**Final Grade:** [Letter Grade] ([Average Score]/5)

**Key Strengths:**
- [Strength 1]
- [Strength 2]

**Primary Issues:**
- [Issue 1: Defect + Root Cause]
- [Issue 2: Defect + Root Cause]

**Next Practice Strategies:**
- [Technique Correction 1]
- [Practice Drill 1]

**Safety Notes:**
- [Safety Note]

Tone:
Strict, professional, and direct. Do not sugarcoat defects. Focus on technical precision.
`;

export const resolveSystemPrompt = (override?: string | null): string => {
  return override?.trim() || DEFAULT_SYSTEM_PROMPT;
};

const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;
const defaultOllamaUrl = nodeEnv?.OLLAMA_URL || '';
const defaultCloudVisionModel = 'qwen3-vl:235b-instruct-cloud';
const defaultOllamaModel = nodeEnv?.OLLAMA_MODEL || defaultCloudVisionModel;
const defaultOllamaKey = '';
const defaultGeminiKey = '';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: ModelProvider.OLLAMA,
  geminiKey: defaultGeminiKey,
  geminiModel: 'gemini-2.5-flash',
  openaiKey: '',
  ollamaUrl: defaultOllamaUrl,
  ollamaModel: defaultOllamaModel,
  ollamaReasoningModel: 'gpt-oss:20b-cloud',
  ollamaKey: defaultOllamaKey,
  geminiKeyId: null,
  openaiKeyId: null,
  ollamaKeyId: null,
  ollamaThinking: true,
  ollamaThinkingLevel: 'low',
  systemPrompt: null,
};

export const MODEL_LABELS = {
  [ModelProvider.GEMINI]: 'Google (Gemini)',
  [ModelProvider.OPENAI]: 'OpenAI (ChatGPT)',
  [ModelProvider.OLLAMA]: 'Ollama (OpenSource)',
};

export const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Reasoning)' },
];

export const MATERIAL_TYPES = ['Carbon Steel', 'Stainless Steel', 'Aluminum', 'Titanium', 'Cast Iron', 'Copper'];

export const WELD_PROCESSES = [
  { code: 'GMAW', name: 'MIG (Gas Metal Arc)' },
  { code: 'GTAW', name: 'TIG (Gas Tungsten Arc)' },
  { code: 'SMAW', name: 'Stick (Shielded Metal Arc)' },
  { code: 'FCAW', name: 'Flux Core' }
];

export const MATERIAL_THICKNESSES = ['24 Gauge', '22 Gauge', '20 Gauge', '18 Gauge', '16 Gauge', '14 Gauge', '1/8"', '3/16"', '1/4"', '3/8"', '1/2"'];

export const JOINT_TYPES = ['Butt Joint', 'Tee Joint', 'Lap Joint', 'Corner Joint', 'Edge Joint'];

export const WELD_POSITIONS = [
  { label: 'Fillet Welds', options: [
    { value: '1F', label: '1F (Flat)' },
    { value: '2F', label: '2F (Horizontal)' },
    { value: '3F', label: '3F (Vertical)' },
    { value: '4F', label: '4F (Overhead)' }
  ]},
  { label: 'Groove Welds', options: [
    { value: '1G', label: '1G (Flat)' },
    { value: '2G', label: '2G (Horizontal)' },
    { value: '3G', label: '3G (Vertical)' },
    { value: '4G', label: '4G (Overhead)' }
  ]},
  { label: 'Pipe Welds', options: [
    { value: '5G', label: '5G (Pipe Fixed, Horizontal)' },
    { value: '6G', label: '6G (Pipe Fixed, 45°)' }
  ]}
];