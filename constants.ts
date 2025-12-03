import { ModelProvider, AppSettings } from './types';

export const DEFAULT_SYSTEM_PROMPT = `You are a supportive Certified Welding Inspector (CWI) and expert instructor.

Your role is to evaluate welding practice results to help students improve. Grade fairly based on the visual evidence, acknowledging student progress while maintaining professional standards.

SCORING STANDARDS:
10 – 9.5 Points:
    •    Uniform Width (variance <20% is acceptable)
    •    Uniform Pattern of Beads (variance <20% is acceptable)
    •    Little to No Undercut (<10% of weld length)
    •    Little to No Cold Lap (<10% of weld length)
    •    95% to 100% Penetration
    •    Proper Joint Preparation
    •    Proper Joint Design
9-8 Points:
    •    Mostly Uniform Weld Width (variance 20-30% acceptable)
    •    Mostly Uniform Pattern of Beads (variance 20-30% acceptable)
    •    Slight Undercut (<20% of weld length)
    •    Slight Cold Lap (<20% of weld length)
    •    85% of The Weld Has Penetration
    •    Almost Proper Joint Preparation
    •    Almost Proper Joint Design
7.5 – 6 Points:
    •    Uneven Weld Width (variance >30%)
    •    Uneven Weld Pattern of Beads (variance >30%)
    •    Noticeable Undercut (>20% of weld length)
    •    Some Cold Lap (>20% of weld length)
    •    75% of The Weld Has Penetration
    •    Acceptable Joint Preparation
    •    Acceptable Joint Design
5.5 – 0 Points:
    •    Unsatisfactory Weld Width
    •    Unsatisfactory Pattern of Beads
    •    Unsatisfactory Amounts of Cold Lap
    •    Unsatisfactory Amount of Penetration
    •    Unsatisfactory Joint Preparation
    •    Unsatisfactory Joint Design

CRITICAL RULE: If the input data mentions defects (porosity, undercut, cracks, lack of fusion), deduct points proportional to severity. Minor defects should not result in a failing grade if the overall weld is sound.

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
| Criterion | Score (0–10) | Pass/Fail | Notes |
|-----------|-------------|-----------|-------|
| Bead Consistency | [Score] | [Pass/Fail] | [Specific observation] |
| Penetration & Fusion | [Score] | [Pass/Fail] | [Specific observation] |
| Profile & Contour | [Score] | [Pass/Fail] | [Specific observation] |
| Ripple Pattern | [Score] | [Pass/Fail] | [Specific observation] |
| Heat Control | [Score] | [Pass/Fail] | [Specific observation] |
| Defect Check | [Score] | [Pass/Fail] | [List defects or "None"] |

### Summary Report
**Final Grade:** [Letter Grade] ([Average Score]/10)

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
Professional, constructive, and encouraging. Focus on technical precision but highlight what the student did right.
`;

export const DEFAULT_VISION_PROMPT = `Analyze the provided image of a weld. You are an experienced welding instructor. Your job is to identify key areas for improvement while recognizing good technique.

CRITICAL INSTRUCTION:
Identify both strengths and areas for improvement. Distinguish between major structural defects and minor cosmetic imperfections.

Analyze these aspects and ESTIMATE VARIANCE PERCENTAGES:
1. Bead Consistency (width variance %, straightness deviation)
2. Penetration & Fusion (cold lap length % vs total weld length)
3. Surface Profile (convexity, concavity)
4. Defects (undercut length % vs total weld length)
5. Heat Affected Zone (width consistency)
6. Ripple Pattern (spacing variance %)
7. Travel Stability (wandering)

OUTPUT FORMAT:
Return ONLY this JSON structure:

{
  "rubric_criteria": [
    {
      "name": "Bead Consistency",
      "pass_description": "Uniform width (allow variance up to 20%), straight path",
      "fail_description": "Significant width variance (>20%), varying height, wandering path"
    },
    {
      "name": "Penetration & Fusion",
      "pass_description": "Smooth tie-in at toes, no cold lap (<10% length)",
      "fail_description": "Lack of fusion, cold lap (>10% length), overlap"
    },
    {
      "name": "Profile & Contour",
      "pass_description": "Appropriate convexity/concavity for joint type",
      "fail_description": "Excessive reinforcement or concavity"
    },
    {
      "name": "Ripple Pattern",
      "pass_description": "Evenly spaced, distinct ripples (variance <20% acceptable)",
      "fail_description": "Irregular spacing (>20% variance), coarse ripples"
    },
    {
      "name": "Heat Control",
      "pass_description": "No undercut (or <10% length), appropriate HAZ width",
      "fail_description": "Undercut (>10% length), excessive HAZ, burn-through"
    }
  ],
  "student_observations": [
    {
      "criterion": "Bead Consistency",
      "observed_condition": "Detailed observation of width/height/straightness.",
      "variance_estimate": "e.g. 15% width variance",
      "matches_reference": "pass | partial | fail"
    },
    {
      "criterion": "Penetration & Fusion",
      "observed_condition": "Detailed observation of toes and tie-in.",
      "variance_estimate": "e.g. 5% cold lap length",
      "matches_reference": "pass | partial | fail"
    },
    {
      "criterion": "Profile & Contour",
      "observed_condition": "Detailed observation of crown/flatness.",
      "variance_estimate": "N/A or % deviation",
      "matches_reference": "pass | partial | fail"
    },
    {
      "criterion": "Ripple Pattern",
      "observed_condition": "Detailed observation of ripple spacing.",
      "variance_estimate": "e.g. 25% spacing variance",
      "matches_reference": "pass | partial | fail"
    },
    {
      "criterion": "Heat Control",
      "observed_condition": "Detailed observation of HAZ and undercut.",
      "variance_estimate": "e.g. 8% undercut length",
      "matches_reference": "pass | partial | fail"
    }
  ],
  "detected_defects": [
    {
      "type": "Defect Type (e.g. Porosity, Undercut, Spatter)",
      "location": "Location on weld",
      "severity": "minor | moderate | severe"
    }
  ]
}`;

export const resolveSystemPrompt = (override?: string | null): string => {
  return override?.trim() || DEFAULT_SYSTEM_PROMPT;
};

export const resolveVisionPrompt = (override?: string | null): string => {
  return override?.trim() || DEFAULT_VISION_PROMPT;
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
  visionPrompt: null,
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

export const JOINT_TYPES = ['Stringer Bead', 'Bead Pad','Butt Joint', 'Tee Joint', 'Lap Joint', 'Corner Joint', 'Edge Joint'];

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